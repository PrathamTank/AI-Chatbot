import redis from './redis.js';

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const { chatId, message } = req.body;

    if (!message || !message.trim()) {
        return res.status(400).json({ error: "Message cannot be empty" });
    }

    if (!chatId) {
        return res.status(400).json({ error: "chatId is required" });
    }

    try {
        const now = new Date().toISOString();
        let chat = null;

        // Try to load existing chat from Redis
        const rawChat = await redis.hget('conversations', chatId);
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

        // 1. Append user message to conversation history
        const userMsg = { role: "user", content: message.trim() };
        chat.messages.push(userMsg);

        // 2. Prepare payload for Groq (System prompt + last 25 messages)
        const recentMessages = chat.messages.slice(-25).map(m => ({
            role: m.role,
            content: m.content
        }));

        const groqMessages = [
            { role: "system", content: "You are a helpful chatbot." },
            ...recentMessages
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
                    model: "llama-3.1-8b-instant",
                    messages: groqMessages
                })
            }
        );

        if (!response.ok) {
            let errMsg = `Groq API Error (${response.status})`;
            try {
                const errData = await response.json();
                if (errData?.error?.message) errMsg = errData.error.message;
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
        await redis.hset('conversations', { [chatId]: JSON.stringify(chat) });

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