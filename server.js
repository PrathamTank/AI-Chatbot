// Load environment variables from .env FIRST — before any other imports
require("dotenv").config();

const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// ─── Startup guard ────────────────────────────────────────────────────────────
if (!GROQ_API_KEY) {
    console.error("❌  GROQ_API_KEY is not set. Create a .env file with your key.");
    process.exit(1);
}

// ─── Middleware ────────────────────────────────────────────────────────────────
// Enable CORS for frontend applications running on other ports (e.g., Live Server on 5500)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// Parse JSON request bodies
app.use(express.json());

// Serve ALL static frontend files (HTML, CSS, JS, videos, etc.) from this folder
app.use(express.static(path.join(__dirname)));

// ─── POST /api/chat ───────────────────────────────────────────────────────────
// Used by: script1.js (main chatbot on index.html)
// Receives: { message: string }
// Returns:  { reply: string }
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;

    if (!message || typeof message !== "string" || message.trim() === "") {
        return res.status(400).json({ error: "message is required and must be a non-empty string." });
    }

    try {
        const groqResponse = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // API key stays on the server — never sent to the browser
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful chatbot."
                    },
                    {
                        role: "user",
                        content: message.trim()
                    }
                ]
            })
        });

        const data = await groqResponse.json();

        if (!groqResponse.ok) {
            console.error("[/api/chat] Groq error:", data);
            return res.status(groqResponse.status).json({ error: data.error?.message || "Groq API error" });
        }

        const reply = data.choices[0].message.content.trim();
        return res.json({ reply });

    } catch (err) {
        console.error("[/api/chat] Server error:", err);
        return res.status(500).json({ error: "Internal server error. Please try again." });
    }
});

// ─── POST /api/summarize ──────────────────────────────────────────────────────
// Used by: script2.js (document summarizer on DocSum.html)
// Receives: { prompt: string }  — the user message + extracted document text
// Returns:  { reply: string }
app.post("/api/summarize", async (req, res) => {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
        return res.status(400).json({ error: "prompt is required and must be a non-empty string." });
    }

    try {
        const groqResponse = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [
                    {
                        role: "system",
                        content: "You are an expert assistant specialized in document summarization. Summarize the provided document content clearly and concisely, focusing on key points."
                    },
                    {
                        role: "user",
                        content: prompt.trim()
                    }
                ]
            })
        });

        const data = await groqResponse.json();

        if (!groqResponse.ok) {
            console.error("[/api/summarize] Groq error:", data);
            return res.status(groqResponse.status).json({ error: data.error?.message || "Groq API error" });
        }

        const reply = data.choices[0].message.content.trim();
        return res.json({ reply });

    } catch (err) {
        console.error("[/api/summarize] Server error:", err);
        return res.status(500).json({ error: "Internal server error. Please try again." });
    }
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅  AI Chatbot server running at http://localhost:${PORT}`);
    console.log(`   Main chatbot  → http://localhost:${PORT}/`);
    console.log(`   Doc Summarizer→ http://localhost:${PORT}/DocSum.html`);
    console.log(`   Text Extractor→ http://localhost:${PORT}/TextExtract.html`);
});
