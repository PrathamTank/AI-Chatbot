import redis from './redis.js';
import auth from '../middleware/auth.js';

export default async function handler(req, res) {


    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const authenticated = await auth(req, res);
if (authenticated !== true) return;

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { chatId, message, image } = body;
    const userId = req.user.id;
    const redisKey = `user:${userId}:conversations`;

    const hasText = Boolean(message && typeof message === 'string' && message.trim());
    const hasImage = Boolean(image && image.data);

    if (!hasText && !hasImage) {
        return res.status(400).json({ error: "Message or image cannot be empty" });
    }

    if (!chatId || typeof chatId !== 'string' || !chatId.trim() || chatId.length > 100) {
        return res.status(400).json({ error: "Valid chatId is required (maximum 100 characters)" });
    }

    if (hasText && message.length > 8000) {
        return res.status(400).json({ error: "Message is too long (maximum 8,000 characters)" });
    }

    if (hasImage && image.mime_type && (typeof image.mime_type !== 'string' || image.mime_type.length > 50)) {
        return res.status(400).json({ error: "Invalid image mime_type" });
    }

    try {
        const now = new Date().toISOString();
        let chat = null;

        // Try to load existing chat from Redis
        const rawChat = await redis.hget(redisKey, chatId);
        if (rawChat) {
            chat = typeof rawChat === 'string' ? JSON.parse(rawChat) : rawChat;
        } else {
            // If chat does not exist yet in Redis, initialize it
            chat = {
                id: chatId,
                title: "New Chat",
                createdAt: now,
                updatedAt: now,
                messages: []
            };
        }

        // 1. Append user message to conversation history in Redis (lightweight text)
        const userText = hasText ? message.trim() : "[Attached Image]";
        const userMsg = { role: "user", content: userText };
        chat.messages.push(userMsg);

        // 2. Prepare payload for Groq
        // Prior conversation history (text-only from Redis)
        const previousHistory = chat.messages.slice(0, -1).slice(-24).map(m => ({
            role: m.role,
            content: m.content
        }));

        // Current message: multimodal if image is present, text string otherwise
        let currentUserGroqMsg;
        if (hasImage) {
            const mime = image.mime_type || "image/jpeg";
            const imageUrl = `data:${mime};base64,${image.data}`;
            const textPrompt = hasText ? message.trim() : "What is in this image?";
            currentUserGroqMsg = {
                role: "user",
                content: [
                    { type: "text", text: textPrompt },
                    { type: "image_url", image_url: { url: imageUrl } }
                ]
            };
        } else {
            currentUserGroqMsg = {
                role: "user",
                content: message.trim()
            };
        }

        const groqMessages = [
            { role: "system", content: "You are a helpful chatbot." },
            ...previousHistory,
            currentUserGroqMsg
        ];

        // 3. Call Groq API
        const response = await fetch(
            "https://api.groq.com/openai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "qwen/qwen3.6-27b",
                    messages: groqMessages,
                    reasoning_format: "hidden"
                })
            }
        );

        if (!response.ok) {
            let errMsg = `Groq API Error (${response.status})`;
            try {
                const errData = await response.json();
                if (errData?.error?.message) {
                    errMsg = errData.error.message;
                }
            } catch (_) {}
            throw new Error(errMsg);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;

        // 4. Append assistant message to conversation history
        const assistantMsg = { role: "assistant", content: reply };
        chat.messages.push(assistantMsg);
        chat.updatedAt = new Date().toISOString();

        // 5. Save updated conversation back to Redis
        await redis.hset(redisKey, { [chatId]: JSON.stringify(chat) });

        // 6. Return response
        return res.status(200).json({
            reply,
            chatId
        });

    } catch (err) {
        console.error("Chat API Error:", err);
        return res.status(500).json({
            error: err.message || "Failed to process chat message"
        });
    }
}