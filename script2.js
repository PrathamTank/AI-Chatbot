import { apiFetch } from "./js/api.js";

// Configure PDF.js worker if library is available
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// DOM Elements
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadButton = document.querySelector("#file-upload");
const fileCancelButton = document.querySelector("#file-cancel");
const attachedFileBadge = document.querySelector("#attachedFileBadge");
const attachedFileName = document.querySelector("#attachedFileName");
const attachedFileStatus = document.querySelector("#attachedFileStatus");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");

// Backend Summarize API endpoint (Server-side Groq execution; NO keys in client)
const SUMMARIZE_API_URL = "/api/summarize";

const userData = {
    message: null,
    file: {
        text: null,
        name: null
    }
};

const initialInputHeight = messageInput ? messageInput.scrollHeight : 42;

// Helper: Escape HTML to avoid injection
function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Helper: Clear attached document state
function clearAttachedFile() {
    userData.file = { text: null, name: null };
    if (fileInput) fileInput.value = "";
    if (attachedFileBadge) attachedFileBadge.classList.add("hidden");
    if (fileUploadButton) fileUploadButton.classList.remove("has-file");
}

// Create message element with dynamic classes
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};

// Markdown & HTML Rendering Helper Functions (Identical to main chatbot)
if (typeof marked !== "undefined") {
    marked.setOptions({
        gfm: true,
        breaks: true
    });
}

const renderMarkdown = (raw) => {
    if (!raw) return '';
    let html = '';

    if (typeof marked !== "undefined" && typeof marked.parse === "function") {
        try {
            html = marked.parse(raw);
        } catch (err) {
            console.error("Markdown parse error:", err);
            html = escapeHtml(raw);
        }
    } else {
        html = escapeHtml(raw);
    }

    if (typeof DOMPurify !== "undefined" && typeof DOMPurify.sanitize === "function") {
        html = DOMPurify.sanitize(html, {
            ADD_ATTR: ['target', 'rel']
        });
    }

    return html;
};

// Enhance code blocks with wrapper, language badge, and copy button
function attachCodeBlockEnhancements(container) {
    if (!container) return;
    const preBlocks = container.querySelectorAll("pre");
    preBlocks.forEach((pre) => {
        if (pre.closest(".code-block-wrapper")) return;

        const codeEl = pre.querySelector("code");
        if (!codeEl) return;

        const wrapper = document.createElement("div");
        wrapper.className = "code-block-wrapper";

        const header = document.createElement("div");
        header.className = "code-block-header";

        const langClass = Array.from(codeEl.classList).find(c => c.startsWith("language-"));
        const langName = langClass ? langClass.replace("language-", "") : "code";

        const langSpan = document.createElement("span");
        langSpan.className = "code-block-lang";
        langSpan.textContent = langName;

        const copyBtn = document.createElement("button");
        copyBtn.className = "code-copy-btn";
        copyBtn.type = "button";
        copyBtn.setAttribute("aria-label", "Copy code");
        copyBtn.innerHTML = `
            <span class="material-symbols-rounded copy-icon">content_copy</span>
            <span class="copy-label">Copy</span>
        `;

        copyBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const textToCopy = codeEl.textContent || "";
            try {
                await navigator.clipboard.writeText(textToCopy);
                copyBtn.classList.add("copied");
                copyBtn.innerHTML = `
                    <span class="material-symbols-rounded copy-icon">check</span>
                    <span class="copy-label">Copied!</span>
                `;
                setTimeout(() => {
                    copyBtn.classList.remove("copied");
                    copyBtn.innerHTML = `
                        <span class="material-symbols-rounded copy-icon">content_copy</span>
                        <span class="copy-label">Copy</span>
                    `;
                }, 2000);
            } catch (err) {
                console.error("Failed to copy code to clipboard:", err);
            }
        });

        header.appendChild(langSpan);
        header.appendChild(copyBtn);

        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
    });
}

// Wrap tables in responsive container and ensure safe links
function attachContentEnhancements(container) {
    if (!container) return;

    // Responsive tables
    container.querySelectorAll("table").forEach((table) => {
        if (table.closest(".table-responsive-wrapper")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "table-responsive-wrapper";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });

    // Safe external links
    container.querySelectorAll("a").forEach((a) => {
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
    });
}

// Master assistant renderer: parses markdown once, inserts to DOM, and attaches enhancements
function renderAssistantContent(targetElement, rawContent) {
    if (!targetElement) return;
    targetElement.innerHTML = renderMarkdown(rawContent);
    attachCodeBlockEnhancements(targetElement);
    attachContentEnhancements(targetElement);
}

// Rate limit countdown notice helper
function showRateLimitNotice(targetElement, seconds) {
    let remaining = Math.max(1, parseInt(seconds) || 25);
    targetElement.style.color = "";
    targetElement.innerHTML = `
        <div class="rate-limit-notice">
            <span class="rate-limit-icon">⏳</span>
            <div class="rate-limit-text">
                DocSum is processing a large document. We've reached the AI service's temporary rate limit. Please wait about <strong class="rate-limit-countdown">${remaining}</strong> seconds and try again.
            </div>
        </div>
    `;

    const timerSpan = targetElement.querySelector(".rate-limit-countdown");
    const interval = setInterval(() => {
        remaining -= 1;
        if (timerSpan) timerSpan.textContent = remaining;
        if (remaining <= 0) {
            clearInterval(interval);
            targetElement.innerHTML = `
                <div class="rate-limit-notice ready">
                    <span class="rate-limit-icon">✅</span>
                    <div class="rate-limit-text">
                        Rate limit window cleared. You can now re-submit your document.
                    </div>
                </div>
            `;
        }
    }, 1000);
}

const MAX_FRONTEND_RETRIES = 3;

// Post-Output Rate Limit Cooldown State & Management
let isCooldownActive = false;
let cooldownIntervalId = null;

function startPostOutputCooldown(durationSeconds = 20) {
    if (cooldownIntervalId) clearInterval(cooldownIntervalId);

    isCooldownActive = true;
    let remaining = Math.max(1, parseInt(durationSeconds) || 20);

    const banner = document.getElementById("cooldownStatusBanner");
    const sendBtn = document.getElementById("send-message");

    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.classList.add("btn-cooldown");
        sendBtn.title = "Rate limit cooldown active. Please wait.";
    }

    if (banner) {
        banner.classList.remove("hidden", "ready");
        banner.innerHTML = `
            <span class="cooldown-icon">⏳</span>
            <span class="cooldown-msg">You can submit another document in <strong class="cooldown-timer">${remaining}</strong> seconds.</span>
        `;
    }

    cooldownIntervalId = setInterval(() => {
        remaining -= 1;
        const timerEl = banner ? banner.querySelector(".cooldown-timer") : null;
        if (timerEl) timerEl.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(cooldownIntervalId);
            cooldownIntervalId = null;
            isCooldownActive = false;

            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.classList.remove("btn-cooldown");
                sendBtn.title = "Generate Summary";
            }

            if (banner) {
                banner.classList.add("ready");
                banner.innerHTML = `
                    <span class="cooldown-icon">✅</span>
                    <span class="cooldown-msg">Ready for another document.</span>
                `;
                setTimeout(() => {
                    if (!isCooldownActive && banner) {
                        banner.classList.add("hidden");
                    }
                }, 3000);
            }
        }
    }, 1000);
}

// Generate Bot Response via secure backend endpoint (/api/summarize) with automatic retry on rate limit
const generateBotResponse = async (incomingMessageDiv, documentPayload, attemptCount = 0) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    // Build prompt — append file text if a document was provided
    let prompt = documentPayload.message || "Summarize this document";
    if (documentPayload.fileText) {
        prompt += `\n\nDocument Content (${documentPayload.fileName || 'Attached'}):\n${documentPayload.fileText}`;
    }

    try {
        // Send structured payload to our secure backend with authenticated session token
        const response = await apiFetch(SUMMARIZE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt,
                fileText: documentPayload.fileText || null,
                fileName: documentPayload.fileName || null,
                message: documentPayload.message || null
            })
        });

        if (!response.ok) {
            let errData = null;
            try {
                errData = await response.json();
            } catch (_) {}

            // Handle 401 Unauthorized (missing, expired, or invalid login session)
            if (response.status === 401) {
                incomingMessageDiv.classList.remove("thinking");
                messageElement.style.color = "";
                messageElement.innerHTML = `
                    <div class="rate-limit-notice error">
                        <span class="rate-limit-icon">🔒</span>
                        <div class="rate-limit-text">
                            Please log in to use Document Summarizer.
                        </div>
                    </div>
                `;
                return;
            }

            // Handle temporary rate limit with automatic retry continuation
            if (response.status === 429 || (errData && errData.error === "RATE_LIMITED")) {
                const retrySecs = Math.max(1, parseInt(errData?.retryAfter) || 15);

                if (attemptCount < MAX_FRONTEND_RETRIES) {
                    let currentSeconds = retrySecs;
                    incomingMessageDiv.classList.add("thinking");

                    messageElement.style.color = "";
                    messageElement.innerHTML = `
                        <div class="rate-limit-notice">
                            <span class="rate-limit-icon">⏳</span>
                            <div class="rate-limit-text">
                                AI service rate limit reached. Retrying in <strong class="rate-limit-countdown">${currentSeconds}</strong> seconds...
                            </div>
                        </div>
                    `;

                    const timer = setInterval(() => {
                        currentSeconds -= 1;
                        const countdownEl = messageElement.querySelector(".rate-limit-countdown");
                        if (countdownEl) countdownEl.textContent = currentSeconds;

                        if (currentSeconds <= 0) {
                            clearInterval(timer);
                            messageElement.innerHTML = `
                                <div class="rate-limit-notice">
                                    <span class="rate-limit-icon">🔄</span>
                                    <div class="rate-limit-text">
                                        Retrying document summarization...
                                    </div>
                                </div>
                            `;
                            // Automatically retry to continue the summarization workflow
                            generateBotResponse(incomingMessageDiv, documentPayload, attemptCount + 1);
                        }
                    }, 1000);

                    return;
                } else {
                    // Maximum retries reached
                    incomingMessageDiv.classList.remove("thinking");
                    messageElement.innerHTML = `
                        <div class="rate-limit-notice error">
                            <span class="rate-limit-icon">⚠️</span>
                            <div class="rate-limit-text">
                                DocSum couldn't complete because the AI service remained rate-limited. Please try again in a few minutes.
                            </div>
                        </div>
                    `;
                    return;
                }
            }

            let errMsg = `Server error: ${response.status} ${response.statusText}`;
            if (errData && errData.error) errMsg = errData.error;
            throw new Error(errMsg);
        }

        const data = await response.json();
        const apiResponseText = data.reply || "No summary was generated.";
        incomingMessageDiv.classList.remove("thinking");
        renderAssistantContent(messageElement, apiResponseText);

        // Start post-output rate-limit cooldown ONLY after complete successful output has been rendered
        startPostOutputCooldown(20);

    } catch (error) {
        incomingMessageDiv.classList.remove("thinking");
        console.error("Summarize Error:", error.message || error);
        if (error.message && (error.message.includes("405") || error.message.includes("Method Not Allowed"))) {
            messageElement.innerHTML = "Error: 405 (Method Not Allowed)<br><br>Please start the backend server by running <code>npm start</code> in your terminal and access the site via <strong>http://localhost:3000</strong>.";
        } else if (error.message && (error.message.includes("401") || error.message.includes("Authorization") || error.message.includes("token") || error.message.includes("Please log in"))) {
            messageElement.innerHTML = `
                <div class="rate-limit-notice error">
                    <span class="rate-limit-icon">🔒</span>
                    <div class="rate-limit-text">
                        Please log in to use Document Summarizer.
                    </div>
                </div>
            `;
        } else {
            messageElement.innerText = `Error: ${error.message}`;
            messageElement.style.color = "#ff4757";
        }

    } finally {
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
};

// Handles outgoing user messages
const handleOutgoingMessage = (e) => {
    if (e) e.preventDefault();

    // Prevent submission while post-output cooldown is active
    if (isCooldownActive) {
        return;
    }

    const textInputVal = messageInput.value.trim();
    const hasDoc = Boolean(userData.file?.text);

    if (!textInputVal && !hasDoc) {
        alert("Please attach a document (PDF, Word, TXT) or enter instructions to summarize.");
        return;
    }

    userData.message = textInputVal || "Summarize this document";

    // Capture document data before clearing UI
    const documentPayload = {
        message: userData.message,
        fileText: userData.file?.text || null,
        fileName: userData.file?.name || null
    };

    // Build user message element
    let messageContent = `<div class="message-text">${escapeHtml(userData.message)}</div>`;
    if (documentPayload.fileName) {
        messageContent += `
            <div class="msg-doc-pill">
                <span class="material-symbols-rounded">description</span>
                <span>${escapeHtml(documentPayload.fileName)}</span>
            </div>
        `;
    }

    const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
    chatBody.appendChild(outgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    // Clear document badge and input for next request
    clearAttachedFile();
    messageInput.value = "Summarize this document";
    messageInput.placeholder = "Summarize this document";
    messageInput.dispatchEvent(new Event("input"));

    // Simulate bot response with thinking indicator
    setTimeout(() => {
        const botContent = `
            <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
                <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
            </svg>
            <div class="message-text">
                <div class="thinking-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        `;

        const incomingMessageDiv = createMessageElement(botContent, "bot-message", "thinking");
        chatBody.appendChild(incomingMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        generateBotResponse(incomingMessageDiv, documentPayload);
    }, 600);
};

// Handle Enter key press
messageInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) {
        handleOutgoingMessage(e);
    }
});

// Adjust input field height dynamically
messageInput?.addEventListener("input", () => {
    messageInput.style.height = `${initialInputHeight}px`;
    messageInput.style.height = `${messageInput.scrollHeight}px`;
    const formEl = document.querySelector(".chat-form");
    if (formEl) {
        formEl.style.borderRadius = messageInput.scrollHeight > initialInputHeight ? "15px" : "32px";
    }
});

// Handle Document Selection & Client-Side Text Extraction
fileInput?.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();

    // Show attachment badge in loading state
    if (attachedFileBadge) {
        attachedFileBadge.classList.remove("hidden");
        if (attachedFileName) attachedFileName.textContent = file.name;
        if (attachedFileStatus) {
            attachedFileStatus.textContent = "Extracting document text...";
            attachedFileStatus.style.color = "#5350C4";
        }
    }
    if (fileUploadButton) fileUploadButton.classList.add("has-file");

    try {
        let extractedText = "";

        // 1. Plain Text (.txt)
        if (ext === "txt" || file.type === "text/plain") {
            extractedText = await file.text();
            if (!extractedText.trim()) {
                throw new Error("The uploaded text file is empty.");
            }
        }
        // 2. PDF Documents (.pdf) — Proper binary parsing via PDF.js
        else if (ext === "pdf" || file.type === "application/pdf") {
            if (typeof pdfjsLib === "undefined") {
                throw new Error("PDF processing engine is loading. Please try again.");
            }

            if (attachedFileStatus) attachedFileStatus.textContent = "Reading PDF pages...";
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
            const pdf = await loadingTask.promise;

            let fullText = "";
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items
                    .map(item => ('str' in item ? item.str : ''))
                    .join(" ");

                if (pageText.trim()) {
                    fullText += `--- Page ${pageNum} ---\n${pageText.trim()}\n\n`;
                }
            }

            if (!fullText.trim()) {
                throw new Error("This PDF contains no selectable text (it may be a scanned document). Please use our Text Extract tool to run OCR on image scans.");
            }
            extractedText = fullText;
        }
        // 3. Word Documents (.docx) — Proper binary parsing via Mammoth.js
        else if (
            ext === "docx" ||
            file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
            if (typeof mammoth === "undefined") {
                throw new Error("Word processing engine is loading. Please try again.");
            }

            if (attachedFileStatus) attachedFileStatus.textContent = "Extracting Word content...";
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            const text = result.value ? result.value.trim() : "";

            if (!text) {
                throw new Error("This Word document (.docx) contains no extractable text.");
            }
            extractedText = text;
        }
        // 4. Legacy Word Documents (.doc)
        else if (ext === "doc" || file.type === "application/msword") {
            throw new Error("Legacy .doc (Word 97-2003) is a proprietary binary format that cannot be parsed in the browser. Please save or convert your file to .docx or .pdf to summarize it.");
        }
        // 5. Unsupported file types
        else {
            throw new Error(`Unsupported format (.${ext}). Supported formats: PDF (.pdf), Word (.docx), and Plain Text (.txt).`);
        }

        // Store extracted text in state
        userData.file = {
            text: extractedText,
            name: file.name
        };

        const wordCount = extractedText.split(/\s+/).filter(Boolean).length;
        if (attachedFileStatus) {
            attachedFileStatus.textContent = `Extracted ${wordCount.toLocaleString()} words • Ready to summarize`;
            attachedFileStatus.style.color = "#2ed573";
        }

    } catch (error) {
        console.error("Document extraction error:", error);
        alert(error.message || "Failed to read document.");
        clearAttachedFile();
    }
});

// Remove Attached File Button
fileCancelButton?.addEventListener("click", clearAttachedFile);

// Attach Button Click Trigger
fileUploadButton?.addEventListener("click", () => {
    if (fileInput) fileInput.click();
});

// Send Message Button Click Trigger
sendMessageButton?.addEventListener("click", (e) => handleOutgoingMessage(e));

// Toggler compatibility (kept for JS safety)
chatbotToggler?.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
closeChatbot?.addEventListener("click", () => document.body.classList.remove("show-chatbot"));