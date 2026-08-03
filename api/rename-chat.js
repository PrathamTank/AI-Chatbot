import redis from './redis.js';

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { chatId, id, title } = req.body;
    const targetId = chatId || id;

    if (!targetId || !title) {
        return res.status(400).json({ error: "Chat ID and title are required" });
    }

    try {
        const rawChat = await redis.hget('conversations', targetId);
        if (!rawChat) {
            return res.status(404).json({ error: "Chat not found" });
        }

        const chat = typeof rawChat === 'string' ? JSON.parse(rawChat) : rawChat;
        chat.title = title.trim();
        chat.updatedAt = new Date().toISOString();

        await redis.hset('conversations', { [targetId]: JSON.stringify(chat) });

        return res.status(200).json({ success: true, title: chat.title });
    } catch (err) {
        console.error("Rename Chat Error:", err);
        return res.status(500).json({ error: err.message || "Failed to rename chat" });
    }
}
