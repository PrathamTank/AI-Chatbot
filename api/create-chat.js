import crypto from 'crypto';
import redis from './redis.js';

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const newChat = {
            id,
            title: "New Chat",
            createdAt: now,
            updatedAt: now,
            messages: []
        };

        await redis.hset('conversations', { [id]: JSON.stringify(newChat) });

        return res.status(200).json({ chatId: id, title: newChat.title });
    } catch (err) {
        console.error("Create Chat Error:", err);
        return res.status(500).json({ error: err.message || "Failed to create chat" });
    }
}
