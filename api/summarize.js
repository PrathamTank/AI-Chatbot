import auth from '../middleware/auth.js';

const GROQ_MODEL = "qwen/qwen3.6-27b";
const CHUNK_CHAR_SIZE = 3500;
const MAX_CHUNKS = 6;

// Helper: split text into natural paragraphs/sentence-friendly chunks
function splitIntoChunks(text, chunkSize = CHUNK_CHAR_SIZE, maxChunks = MAX_CHUNKS) {
    if (!text || text.length <= chunkSize) {
        return [text];
    }

    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = "";

    for (const para of paragraphs) {
        if ((currentChunk.length + para.length + 2) > chunkSize && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = "";
            if (chunks.length >= maxChunks) break;
        }

        // If a single paragraph is larger than chunkSize, break by lines
        if (para.length > chunkSize) {
            const lines = para.split(/\n/);
            for (const line of lines) {
                if ((currentChunk.length + line.length + 1) > chunkSize && currentChunk.length > 0) {
                    chunks.push(currentChunk.trim());
                    currentChunk = "";
                    if (chunks.length >= maxChunks) break;
                }
                currentChunk += (currentChunk ? "\n" : "") + line;
            }
        } else {
            currentChunk += (currentChunk ? "\n\n" : "") + para;
        }

        if (chunks.length >= maxChunks) break;
    }

    if (currentChunk.trim() && chunks.length < maxChunks) {
        chunks.push(currentChunk.trim());
    }

    return chunks.length > 0 ? chunks : [text.slice(0, chunkSize)];
}

// Helper: Call Groq API with automatic retry on temporary 429 rate limit
async function callGroq(messages, maxTokens = 1200, maxRetries = 2) {
    let attempt = 0;

    while (attempt <= maxRetries) {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages,
                max_tokens: maxTokens,
                reasoning_effort: "none",
                reasoning_format: "hidden"
            })
        });

        if (!response.ok) {
            let errMsg = `Groq API Error (${response.status})`;
            let errData = null;
            try {
                errData = await response.json();
                if (errData?.error?.message) errMsg = errData.error.message;
            } catch (_) {}

            // Rate limit check (429 or TPM error)
            if (response.status === 429 || (errMsg && errMsg.toLowerCase().includes("rate limit"))) {
                let retryAfter = 15;
                const retryHeader = response.headers.get("retry-after");
                if (retryHeader && !isNaN(parseFloat(retryHeader))) {
                    retryAfter = Math.ceil(parseFloat(retryHeader));
                } else if (errMsg) {
                    const match = errMsg.match(/try again in ([\d\.]+)s/i);
                    if (match && match[1]) {
                        retryAfter = Math.ceil(parseFloat(match[1]));
                    }
                }

                // If bounded retries remain, wait for the required window and retry the SAME chunk
                if (attempt < maxRetries) {
                    attempt++;
                    console.log(`[DocSum] Rate limit reached. Waiting ${retryAfter}s before retrying chunk (attempt ${attempt}/${maxRetries})...`);
                    await new Promise(r => setTimeout(r, (retryAfter + 1) * 1000));
                    continue;
                }

                const rateErr = new Error("RATE_LIMITED");
                rateErr.isRateLimit = true;
                rateErr.retryAfter = retryAfter;
                throw rateErr;
            }

            throw new Error(errMsg);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
    }
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const authenticated = await auth(req, res);
    if (authenticated !== true) return;

    const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});

    // Read payload: support both combined prompt and structured document fields
    const rawPrompt = body.prompt || "";
    const rawFileText = body.fileText || "";
    const fileName = body.fileName || "Document";
    const userInstruction = body.message || "Provide a comprehensive, well-structured summary of this document.";

    const textToSummarize = rawFileText.trim() || rawPrompt.trim();

    if (!textToSummarize) {
        return res.status(400).json({ error: "Document content or prompt is required" });
    }

    if (fileName && (typeof fileName !== 'string' || fileName.length > 255)) {
        return res.status(400).json({ error: "File name is too long (maximum 255 characters)" });
    }

    if (userInstruction && (typeof userInstruction !== 'string' || userInstruction.length > 2000)) {
        return res.status(400).json({ error: "User instruction is too long (maximum 2,000 characters)" });
    }

    if (textToSummarize.length > 150000) {
        return res.status(400).json({ error: "Document content is too large (maximum 150,000 characters)" });
    }

    try {
        // Case 1: Short document (<= 4000 chars) -> Direct single pass
        if (textToSummarize.length <= CHUNK_CHAR_SIZE) {
            const reply = await callGroq([
                {
                    role: "system",
                    content: "You are an expert document summarization assistant. Provide a clear, comprehensive, and well-structured summary using Markdown headings (##, ###), bullet lists, bold text, and tables where appropriate."
                },
                {
                    role: "user",
                    content: `Document: ${fileName}\n\nInstructions: ${userInstruction}\n\nContent:\n${textToSummarize}`
                }
            ], 1800);

            return res.status(200).json({ reply });
        }

        // Case 2: Large document -> Map-Reduce chunking pipeline
        const chunks = splitIntoChunks(textToSummarize, CHUNK_CHAR_SIZE, MAX_CHUNKS);
        const intermediateSummaries = [];

        // Map phase: Summarize each chunk sequentially with order preservation
        for (let i = 0; i < chunks.length; i++) {
            const chunkText = chunks[i];
            const sectionSummary = await callGroq([
                {
                    role: "system",
                    content: "You are an expert assistant analyzing a section of a document. Extract the main facts, key data, arguments, and takeaways concisely in 3-5 bullet points. Do not include conversational filler."
                },
                {
                    role: "user",
                    content: `Section ${i + 1} of ${chunks.length}:\n\n${chunkText}`
                }
            ], 1000);

            if (sectionSummary && sectionSummary.trim()) {
                intermediateSummaries.push(`### Section ${i + 1}\n${sectionSummary.trim()}`);
            } else {
                // If section summary is empty, provide a clean fallback excerpt of the chunk so data is never lost
                console.warn(`[DocSum] Section ${i + 1} empty summary, using excerpt fallback`);
                const fallbackExcerpt = chunkText.slice(0, 500).replace(/\s+/g, ' ');
                intermediateSummaries.push(`### Section ${i + 1}\n- ${fallbackExcerpt}...`);
            }

            // Brief delay between chunk calls to respect TPM limits
            if (i < chunks.length - 1) {
                await new Promise(r => setTimeout(r, 350));
            }
        }

        // Reduce phase: Synthesize section summaries into a final cohesive response
        const combinedSections = intermediateSummaries.join("\n\n");
        const finalSummary = await callGroq([
            {
                role: "system",
                content: "You are an expert document summarization assistant. Synthesize the section summaries into a unified, comprehensive final summary. Use clear Markdown headings (##, ###), bullet lists, bold text, and tables where appropriate. Ensure the summary is cohesive, well-organized, and captures all key details."
            },
            {
                role: "user",
                content: `Document Name: ${fileName}\n\nUser Request: ${userInstruction}\n\nBelow are the extracted key summaries from each section of the document:\n\n${combinedSections}\n\nPlease provide the final, complete summary based on the section content above.`
            }
        ], 2000);

        return res.status(200).json({
            reply: finalSummary || combinedSections || "Unable to generate summary."
        });

    } catch (err) {
        if (err.isRateLimit) {
            return res.status(429).json({
                error: "RATE_LIMITED",
                retryAfter: err.retryAfter || 25,
                message: `DocSum is processing a large document. We've reached the AI service's temporary rate limit. Please wait about ${err.retryAfter || 25} seconds and try again.`
            });
        }

        console.error("Summarize Error:", err.message);
        return res.status(500).json({
            error: "Failed to generate document summary. Please try again."
        });
    }
}