import crypto from 'crypto';
import redis from '../lib/redis.js';
import auth from '../middleware/auth.js';

export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    try {
        const userId = req.user.id;
        const redisKey = `user:${userId}:conversations`;

        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const newChat = {
            id,
            title: "New Chat",
            createdAt: now,
            updatedAt: now,
            messages: []
        };

        // Store chat under the logged-in user's Redis key
        await redis.hset(redisKey, {
            [id]: JSON.stringify(newChat)
        });

        return res.status(200).json({
            chatId: id,
            title: newChat.title
        });

    } catch (err) {
        console.error("Create Chat Error:", err);

        return res.status(500).json({
            error: err.message || "Failed to create chat"
        });
    }
}