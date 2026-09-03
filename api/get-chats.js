import redis from './redis.js';
import auth from '../middleware/auth.js';

export default async function handler(req, res) {

    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    try {
        const userId = req.user.id;
        const redisKey = `user:${userId}:conversations`;

        // Only retrieve chats belonging to the logged-in user
        const rawChats = await redis.hgetall(redisKey);

        if (!rawChats) {
            return res.status(200).json([]);
        }

        const chats = [];

        for (const [id, rawData] of Object.entries(rawChats)) {
            try {
                const parsed = typeof rawData === 'string'
                    ? JSON.parse(rawData)
                    : rawData;

                if (parsed && parsed.id) {
                    chats.push({
                        id: parsed.id,
                        title: parsed.title || "New Chat",
                        updatedAt: parsed.updatedAt ||
                            parsed.createdAt ||
                            new Date().toISOString()
                    });
                }

            } catch (e) {
                console.error(`Failed to parse chat ${id}:`, e);
            }
        }

        // Sort by updatedAt descending
        chats.sort(
            (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        return res.status(200).json(chats);

    } catch (err) {
        console.error("Get Chats Error:", err);

        return res.status(500).json({
            error: err.message || "Failed to fetch chats"
        });
    }
}