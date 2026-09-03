import supabase from "../lib/supabaseAdmin.js";

export default async function auth(req, res) {

    try {

        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                error: "Authorization header missing"
            });
        }

        const token = authHeader.replace(/^Bearer\s+/i, "").trim();

        if (!token) {
            return res.status(401).json({
                error: "Invalid or expired token"
            });
        }

        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
            return res.status(401).json({
                error: "Invalid or expired token"
            });
        }

        req.user = {
            id: data.user.id,
            email: data.user.email
        };

        return true;

    } catch (err) {

        console.error("Authentication Error:", err);

        return res.status(500).json({
            error: "Authentication failed"
        });

    }

}