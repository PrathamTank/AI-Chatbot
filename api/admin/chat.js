import adminAuth from '../../middleware/adminAuth.js';
import supabaseAdmin from '../../lib/supabaseAdmin.js';
import redis from '../../lib/redis.js';

/**
 * GET /api/admin/chat?userId=<userId>&chatId=<chatId>
 *
 * Secure admin endpoint to retrieve full conversation messages for a specific chat.
 *
 * Security:
 * - Strictly protected by server-side adminAuth middleware.
 * - Requires verified admin Supabase token matching process.env.ADMIN_USER_ID.
 * - Verifies target user existence via Supabase Admin API.
 * - Verifies chat ownership by strictly scoping Redis lookup to user:<targetUserId>:conversations.
 * - Never returns another user's chat even if a client supplies a foreign chatId.
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
    const targetChatId = req.query.chatId?.trim();

    if (!targetUserId || !targetChatId) {
        return res.status(400).json({
            error: "Both userId and chatId are required"
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

        // 3. Read specific chat strictly from the target user's Redis hash (enforces ownership)
        const rawChat = await redis.hget(redisKey, targetChatId);

        if (!rawChat) {
            return res.status(404).json({
                error: "Chat not found for the specified user"
            });
        }

        const parsed = typeof rawChat === 'string'
            ? JSON.parse(rawChat)
            : rawChat;

        if (!parsed || !parsed.id) {
            return res.status(404).json({
                error: "Chat data is invalid or corrupted"
            });
        }

        return res.status(200).json({
            user: {
                id: targetUserId,
                email: targetEmail
            },
            chat: {
                id: parsed.id,
                title: parsed.title || "New Chat",
                createdAt: parsed.createdAt || null,
                updatedAt: parsed.updatedAt || parsed.createdAt || null,
                messages: Array.isArray(parsed.messages) ? parsed.messages : []
            }
        });

    } catch (err) {
        console.error("Admin Chat API Error:", err);
        return res.status(500).json({
            error: "Failed to retrieve conversation"
        });
    }
}
