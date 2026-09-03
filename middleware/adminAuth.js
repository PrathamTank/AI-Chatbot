import supabase from "../lib/supabaseAdmin.js";

/**
 * Server-Side Admin Authorization Middleware
 *
 * Enforces strict role-based access control:
 * 1. Requires valid Authorization: Bearer <Supabase token> header.
 * 2. Validates token server-side against Supabase auth.
 * 3. Extracts verified user UUID from Supabase.
 * 4. Fails closed if ADMIN_USER_ID is missing or blank in server environment.
 * 5. Compares verified user UUID against process.env.ADMIN_USER_ID.
 * 6. Returns 401 for unauthenticated requests, 403 for unauthorized users.
 *
 * Never trusts client-supplied user IDs, query parameters, bodies, or cookies.
 */
export default async function adminAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            res.status(401).json({
                error: "Authentication required"
            });
            return false;
        }

        const token = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!token) {
            res.status(401).json({
                error: "Authentication required"
            });
            return false;
        }

        // Validate token with Supabase server-side
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data || !data.user) {
            res.status(401).json({
                error: "Authentication required"
            });
            return false;
        }

        const verifiedUserId = data.user.id;
        const adminUserId = process.env.ADMIN_USER_ID ? process.env.ADMIN_USER_ID.trim() : null;

        // Fail closed: If ADMIN_USER_ID is not configured, deny access immediately
        if (!adminUserId) {
            console.error("Admin Authorization Error: ADMIN_USER_ID environment variable is missing or empty.");
            res.status(500).json({
                error: "Server configuration error"
            });
            return false;
        }

        // Compare verified Supabase UUID against configured ADMIN_USER_ID
        if (verifiedUserId !== adminUserId) {
            res.status(403).json({
                error: "Admin access required"
            });
            return false;
        }

        // Attach verified admin identity to request object
        req.user = {
            id: data.user.id,
            email: data.user.email
        };
        req.isAdmin = true;

        if (typeof next === 'function') {
            return next();
        }

        return true;

    } catch (err) {
        console.error("Admin Authorization Internal Error:", err);
        res.status(500).json({
            error: "Authorization failed"
        });
        return false;
    }
}
