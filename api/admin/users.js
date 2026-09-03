import adminAuth from '../../middleware/adminAuth.js';
import supabaseAdmin from '../../lib/supabaseAdmin.js';
import redis from '../redis.js';

/**
 * GET /api/admin/users
 *
 * Secure admin endpoint to retrieve registered users and their conversation counts.
 *
 * Security:
 * - Strictly protected by server-side adminAuth middleware.
 * - Compares verified Supabase user UUID against process.env.ADMIN_USER_ID.
 * - Fails closed if ADMIN_USER_ID is missing or empty.
 * - Server constructs user:<userId>:conversations keys using verified IDs.
 * - Strips all sensitive auth credentials, passwords, and tokens before responding.
 */
export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    // 1. Enforce server-side admin authorization
    const authorized = await adminAuth(req, res);
    if (authorized !== true) return;

    try {
        // 2. Fetch users using server-side Supabase Admin API
        const { data, error } = await supabaseAdmin.auth.admin.listUsers();

        if (error) {
            console.error("Supabase listUsers error:", error);
            return res.status(500).json({
                error: "Failed to retrieve users"
            });
        }

        const rawUsers = data?.users || [];

        // 3. For each user, securely calculate chat count from user:<userId>:conversations in Redis
        const users = await Promise.all(
            rawUsers.map(async (u) => {
                let chatCount = 0;
                try {
                    const redisKey = `user:${u.id}:conversations`;
                    const count = await redis.hlen(redisKey);
                    chatCount = typeof count === 'number' ? count : 0;
                } catch (e) {
                    console.warn(`Failed to fetch chat count for user ${u.id}:`, e.message);
                    chatCount = 0;
                }

                return {
                    id: u.id,
                    email: u.email || "No email",
                    createdAt: u.created_at,
                    chatCount
                };
            })
        );

        // Sort users: newest registration first
        users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return res.status(200).json({
            users
        });

    } catch (err) {
        console.error("Admin Users API Error:", err);
        return res.status(500).json({
            error: "Failed to retrieve user data"
        });
    }
}
