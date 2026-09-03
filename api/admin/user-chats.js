import adminAuth from '../../middleware/adminAuth.js';
import supabaseAdmin from '../../lib/supabaseAdmin.js';
import redis from '../../lib/redis.js';

/**
 * GET /api/admin/user-chats?userId=<userId>
 *
 * Secure admin endpoint to retrieve all conversations belonging to a specific target user.
 *
 * Security:
 * - Strictly protected by server-side adminAuth middleware.
 * - Requires verified admin Supabase token matching process.env.ADMIN_USER_ID.
 * - Validates target user existence via Supabase Admin API.
 * - Reads conversations exclusively from user:<targetUserId>:conversations in Redis.
 * - Never trusts client-supplied admin claims.
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

    const targetUserId = req.query.userId?.trim();

    if (!targetUserId) {
        return res.status(400).json({
            error: "User ID is required"
        });
    }

    try {
        // 2. Verify target user exists via Supabase Admin API
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(targetUserId);

        if (userError || !userData || !userData.user) {
            return res.status(404).json({
                error: "User not found"
            });
        }

        const targetEmail = userData.user.email || "No email";
        const redisKey = `user:${targetUserId}:conversations`;

        // 3. Read target user's conversations from Redis
        const rawChats = await redis.hgetall(redisKey);
        const chats = [];

        if (rawChats && typeof rawChats === 'object') {
            for (const [id, rawData] of Object.entries(rawChats)) {
                try {
                    const parsed = typeof rawData === 'string'
                        ? JSON.parse(rawData)
                        : rawData;

                    if (parsed && parsed.id) {
                        const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
                        chats.push({
                            id: parsed.id,
                            title: parsed.title || "New Chat",
                            createdAt: parsed.createdAt || null,
                            updatedAt: parsed.updatedAt || parsed.createdAt || null,
                            messageCount: messages.length
                        });
                    }
                } catch (e) {
                    console.warn(`Failed to parse chat ${id} for user ${targetUserId}:`, e.message);
                }
            }
        }

        // Sort chats by updatedAt descending (newest activity first)
        chats.sort((a, b) => {
            const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        return res.status(200).json({
            user: {
                id: targetUserId,
                email: targetEmail
            },
            chats
        });

    } catch (err) {
        console.error("Admin User-Chats API Error:", err);
        return res.status(500).json({
            error: "Failed to retrieve user chats"
        });
    }
}
