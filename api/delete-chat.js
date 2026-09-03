import redis from '../lib/redis.js';
import auth from '../middleware/auth.js';

export default async function handler(req, res) {
    if (req.method !== "DELETE" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

    const chatId =
        body.chatId ||
        body.id ||
        req.query?.id ||
        req.query?.chatId;

    if (!chatId) {
        return res.status(400).json({ error: "Chat ID is required" });
    }

    try {
        const userId = req.user.id;
        const redisKey = `user:${userId}:conversations`;

        // Delete only from the logged-in user's chats
        await redis.hdel(redisKey, chatId);

        return res.status(200).json({
            success: true,
            message: "Chat deleted successfully"
        });

    } catch (err) {
        console.error("Delete Chat Error:", err);

        return res.status(500).json({
            error: err.message || "Failed to delete chat"
        });
    }
}