import redis from './redis.js';

export default async function handler(req, res) {
    if (req.method !== "DELETE" && req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const chatId = body.chatId || body.id || req.query?.id || req.query?.chatId;
    if (!chatId) {
        return res.status(400).json({ error: "Chat ID is required" });
    }

    try {
        await redis.hdel('conversations', chatId);
        return res.status(200).json({ success: true, message: "Chat deleted successfully" });
    } catch (err) {
        console.error("Delete Chat Error:", err);
        return res.status(500).json({ error: err.message || "Failed to delete chat" });
    }
}
