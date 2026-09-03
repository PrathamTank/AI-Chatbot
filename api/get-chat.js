import redis from '../lib/redis.js';
import auth from '../middleware/auth.js';

export default async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    const chatId = req.query.id || req.query.chatId;

    if (!chatId) {
        return res.status(400).json({ error: "Chat ID is required" });
    }

    try {
        const userId = req.user.id;
        const redisKey = `user:${userId}:conversations`;

        // Only search inside the logged-in user's chats
        const rawChat = await redis.hget(redisKey, chatId);

        if (!rawChat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        const chat = typeof rawChat === 'string'
            ? JSON.parse(rawChat)
            : rawChat;

        return res.status(200).json(chat);

    } catch (err) {
        console.error("Get Chat Error:", err);

        return res.status(500).json({
            error: err.message || "Failed to fetch chat"
        });
    }
}