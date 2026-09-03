import adminAuth from '../../middleware/adminAuth.js';

/**
 * GET /api/admin/check
 *
 * Verifies if the requester has valid administrator credentials.
 * - 401: Authentication required (missing / invalid token)
 * - 403: Admin access required (valid user, but not admin)
 * - 500: Server configuration error (ADMIN_USER_ID missing)
 * - 200: { admin: true } (verified admin)
 */
export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const authorized = await adminAuth(req, res);
    if (authorized !== true) return;

    return res.status(200).json({
        admin: true
    });
}
