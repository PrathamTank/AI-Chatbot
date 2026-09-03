import redis from '../lib/redis.js';
import auth from '../middleware/auth.js';

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

    const { chatId, id, title } = body;
    const targetId = chatId || id;

    if (!targetId || typeof targetId !== 'string' || !targetId.trim() || targetId.length > 100) {
        return res.status(400).json({
            error: "Valid chat ID is required (maximum 100 characters)"
        });
    }

    if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
            error: "Chat title is required"
        });
    }

    if (title.trim().length > 100) {
        return res.status(400).json({
            error: "Chat title is too long (maximum 100 characters)"
        });
    }

    try {
        const userId = req.user.id;
        const redisKey = `user:${userId}:conversations`;

        // Only access chats belonging to the logged-in user
        const rawChat = await redis.hget(redisKey, targetId);

        if (!rawChat) {
            return res.status(404).json({
                error: "Chat not found"
            });
        }

        const chat = typeof rawChat === 'string'
            ? JSON.parse(rawChat)
            : rawChat;

        chat.title = title.trim();
        chat.updatedAt = new Date().toISOString();

        await redis.hset(redisKey, {
            [targetId]: JSON.stringify(chat)
        });

        return res.status(200).json({
            success: true,
            title: chat.title
        });

    } catch (err) {
        console.error("Rename Chat Error:", err);

        return res.status(500).json({
            error: err.message || "Failed to rename chat"
        });
    }
}