import redis from './redis.js';

export default async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const chatId = req.query.id || req.query.chatId;
    if (!chatId) {
        return res.status(400).json({ error: "Chat ID is required" });
    }

    try {
        const rawChat = await redis.hget('conversations', chatId);
        if (!rawChat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        const chat = typeof rawChat === 'string' ? JSON.parse(rawChat) : rawChat;
        return res.status(200).json(chat);
    } catch (err) {
        console.error("Get Chat Error:", err);
        return res.status(500).json({ error: err.message || "Failed to fetch chat" });
    }
}
