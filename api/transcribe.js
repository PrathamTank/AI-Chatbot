import auth from '../middleware/auth.js';

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
        const { audio, mimeType } = body;

        if (!audio || typeof audio !== 'string') {
            return res.status(400).json({ error: "Audio data is required" });
        }

        if (mimeType && (typeof mimeType !== 'string' || mimeType.length > 50)) {
            return res.status(400).json({ error: "Invalid mimeType (maximum 50 characters)" });
        }

        const audioBuffer = Buffer.from(audio, 'base64');
        const audioMime = mimeType || 'audio/webm';
        let fileExt = 'webm';
        if (audioMime.includes('mp4') || audioMime.includes('m4a')) fileExt = 'm4a';
        else if (audioMime.includes('wav')) fileExt = 'wav';
        else if (audioMime.includes('ogg')) fileExt = 'ogg';

        const audioBlob = new Blob([audioBuffer], { type: audioMime });

        const formData = new FormData();
        formData.append('file', audioBlob, `recording.${fileExt}`);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');

        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: formData
        });

        if (!groqRes.ok) {
            let errMsg = `Whisper transcription error (${groqRes.status})`;
            try {
                const errData = await groqRes.json();
                if (errData?.error?.message) errMsg = errData.error.message;
            } catch (_) {}
            throw new Error(errMsg);
        }

        const data = await groqRes.json();
        return res.status(200).json({ text: data.text || "" });
    } catch (err) {
        console.error("Transcription endpoint error:", err.message);
        return res.status(500).json({ error: err.message || "Failed to transcribe audio" });
    }
}
