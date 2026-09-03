import { apiFetch } from "./js/api.js";
import { supabase } from "./lib/supabase.js";
const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const fileCancelButton = document.querySelector("#file-cancel");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");

// ===============================
// Authentication Elements & State
// ===============================

const authModal = document.getElementById("authModal");
const closeAuth = document.getElementById("closeAuth");

const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");

const authTitle = document.getElementById("authTitle");
const authSubmit = document.getElementById("authSubmit");

const toggleAuth = document.getElementById("toggleAuth");
const toggleText = document.getElementById("toggleText");

let isLogin = true;
let currentUser = null;

// Update Authentication UI in Sidebar Footer
function updateAuthUI(user) {
    const sidebarFooter = document.querySelector(".sidebar-footer");
    if (!sidebarFooter) return;

    if (user) {
        const email = user.email || "User Account";
        sidebarFooter.innerHTML = `
            <div class="user-account-wrapper">
                <div class="user-account-info" title="${escapeHtml(email)}">
                    <span class="material-symbols-rounded">person</span>
                    <span class="user-email">${escapeHtml(email)}</span>
                </div>
                <button id="logoutBtn" class="logout-action-btn" title="Logout">
                    <span class="material-symbols-rounded">logout</span>
                </button>
            </div>
        `;
        const logoutBtn = document.getElementById("logoutBtn");
        logoutBtn?.addEventListener("click", handleLogout);
    } else {
        sidebarFooter.innerHTML = `
            <button id="authBtn" class="auth-btn">
                <span class="material-symbols-rounded">login</span>
                <span>Sign In</span>
            </button>
        `;
        const authBtnEl = document.getElementById("authBtn");
        authBtnEl?.addEventListener("click", () => {
            authModal?.classList.remove("hidden");
        });
    }
}

// Logout handler
async function handleLogout() {
    if (isMobileView()) {
        closeMobileSidebar();
    }
    try {
        await supabase.auth.signOut();
    } catch (err) {
        console.error("Logout error:", err);
    }
    currentUser = null;
    currentChatId = null;
    currentChatTitle = "New Chat";
    updateAuthUI(null);
    resetChatWindow();
    closeChatMenu();
    closeRenameModal();
    const historyContainer = document.querySelector(".chat-history");
    if (historyContainer) historyContainer.innerHTML = "";
}

// Initial modal close handler
closeAuth?.addEventListener("click", () => {
    authModal?.classList.add("hidden");
});

// Close modal on outside click
authModal?.addEventListener("click", (e) => {
    if (e.target === authModal) {
        authModal.classList.add("hidden");
    }
});

// Toggle Login / Register
toggleAuth?.addEventListener("click", (e) => {
    e.preventDefault();
    isLogin = !isLogin;

    if (isLogin) {
        authTitle.textContent = "Sign In";
        authSubmit.textContent = "Sign In";
        toggleText.textContent = "Don't have an account?";
        toggleAuth.textContent = "Register";
    } else {
        authTitle.textContent = "Create Account";
        authSubmit.textContent = "Register";
        toggleText.textContent = "Already have an account?";
        toggleAuth.textContent = "Sign In";
    }
});

// Login / Register Submission
authForm?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
        alert("Please enter both email and password.");
        return;
    }

    authSubmit.disabled = true;
    authSubmit.textContent = isLogin ? "Signing in..." : "Creating account...";

    try {
        if (isLogin) {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            authModal.classList.add("hidden");
            authForm.reset();
        } else {
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            if (data?.session) {
                authModal.classList.add("hidden");
                authForm.reset();
            } else if (data?.user) {
                alert("Account created! Please check your email to confirm your account before logging in.");
                authModal.classList.add("hidden");
                authForm.reset();
            }
        }
    } catch (err) {
        alert(err.message || "Authentication error");
    } finally {
        authSubmit.disabled = false;
        authSubmit.textContent = isLogin ? "Sign In" : "Register";
    }
});

const userData = {
    message: null,
    file: {
        data: null,
        mime_type: null
    }
};

// Global Chat Manager state
let currentChatId = null;
let currentChatTitle = "New Chat";

const initialInputHeight = messageInput.scrollHeight;

// Check for speech synthesis support
if (!('speechSynthesis' in window)) {
    console.warn("Text-to-speech not supported in this browser");
}

// Improved Text-to-Speech Function
function speakText(text) {
    if (!text) return;

    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance();
    utterance.text = text.replace(/[^\w\s.,!?]/g, '');
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = function () {
        document.querySelectorAll('.voice-btn').forEach(btn => {
            if (btn.getAttribute('data-message') === text) {
                btn.innerHTML = '<span class="material-symbols-rounded" style="color:#4a90e2">volume_up</span>';
                btn.setAttribute('data-speaking', 'true');
            }
        });
    };

    utterance.onend = utterance.onerror = function () {
        document.querySelectorAll('.voice-btn').forEach(btn => {
            btn.innerHTML = '<span class="material-symbols-rounded">volume_up</span>';
            btn.removeAttribute('data-speaking');
        });
    };

    window.speechSynthesis.speak(utterance);
}

// Create message element
const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};


// Generate Bot Response
const CHAT_API_URL = "/api/chat";

// Markdown & HTML Rendering Helper Functions
const escapeHtml = (s) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';

// Configure marked.js if present
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

// Enhance code blocks with container, language badge, and dedicated copy button
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

const stripMarkdown = (raw) => {
    if (!raw) return '';
    return raw
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+?)`/g, '$1')
        .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '$1')
        .replace(/(\*\*|__)([\s\S]+?)\1/g, '$2')
        .replace(/(\*|_)([^\*_\n][\s\S]*?)\1/g, '$2')
        .replace(/~~([\s\S]+?)~~/g, '$1')
        .replace(/\[([^\]]+?)\]\(([^\)]+?)\)/g, '$1')
        .replace(/\n/g, ' ')
        .trim();
};

const generateBotResponse = async (incomingMessageDiv, userMessageText, attachedImage = null) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    if (!currentUser) {
        incomingMessageDiv.classList.remove("thinking");
        messageElement.innerText = "Please sign in to start chatting.";
        authModal?.classList.remove("hidden");
        return;
    }

    // Ensure we have an active chatId
    if (!currentChatId) {
        try {
            const createRes = await apiFetch("/api/create-chat", { method: "POST" });
            if (createRes.ok) {
                const createData = await createRes.json();
                currentChatId = createData.chatId;
                currentChatTitle = createData.title || "New Chat";
            } else if (createRes.status === 401) {
                incomingMessageDiv.classList.remove("thinking");
                messageElement.innerText = "Please sign in to start chatting.";
                authModal?.classList.remove("hidden");
                return;
            }
        } catch (e) {
            console.error("Failed to auto-create chat ID:", e);
        }
    }

    try {
        const payload = {
            chatId: currentChatId,
            message: userMessageText || ""
        };

        const imageToUpload = (attachedImage && attachedImage.data)
            ? attachedImage
            : ((userData.file && userData.file.data) ? userData.file : null);

        if (imageToUpload && imageToUpload.data) {
            payload.image = {
                data: imageToUpload.data,
                mime_type: imageToUpload.mime_type || "image/jpeg"
            };
        }

        const response = await apiFetch(CHAT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            let errMsg = `Server error: ${response.status} ${response.statusText}`;
            try {
                const errData = await response.json();
                if (errData && errData.error) errMsg = errData.error;
            } catch (_) {}
            if (response.status === 401) {
                errMsg = "Please sign in to continue.";
                authModal?.classList.remove("hidden");
            }
            throw new Error(errMsg);
        }

        const data = await response.json();
        const apiResponseText = data.reply;

        // Render actual assistant response
        renderAssistantContent(messageElement, apiResponseText);

        const voiceBtn = document.createElement('button');
        voiceBtn.className = 'voice-btn';
        voiceBtn.setAttribute('data-message', stripMarkdown(apiResponseText));
        voiceBtn.innerHTML = '<span class="material-symbols-rounded">volume_up</span>';
        voiceBtn.onclick = (e) => {
            e.stopPropagation();
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            } else {
                speakText(apiResponseText);
            }
        };
        incomingMessageDiv.appendChild(voiceBtn);

        // Auto-title: If title is "New Chat", rename based on first user message
        if ((!currentChatTitle || currentChatTitle === "New Chat") && (userMessageText || imageToUpload)) {
            const rawTitleText = userMessageText || "Image Analysis";
            const cleanMsg = rawTitleText.trim().replace(/\n/g, ' ');
            const newTitle = cleanMsg.length > 35 ? cleanMsg.slice(0, 35) + "..." : cleanMsg;
            currentChatTitle = newTitle;

            apiFetch("/api/rename-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId: currentChatId, title: newTitle })
            }).then(() => {
                loadChatList();
            }).catch(err => console.error("Error renaming chat:", err));
        }

    } catch (error) {
        console.error(error);
        if (error.message.includes("405") || error.message.includes("Method Not Allowed")) {
            messageElement.innerHTML = "Error: 405 (Method Not Allowed)<br><br>Please start the backend server by running <code>npm start</code> in your terminal, and open <strong>http://localhost:3000</strong> in your browser instead of using Live Server (port 5500) or opening the file directly.";
        } else {
            messageElement.innerText = `Error: ${error.message}`;
        }
        messageElement.style.color = "#ff0000";
    } finally {
        incomingMessageDiv.classList.remove("thinking");
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
};

// Voice Input (Speech to Text with Brave & MediaRecorder Fallback)
function setupVoiceInput() {
    const micBtn = document.getElementById("mic-button");
    if (!micBtn) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    let nativeRecognition = null;
    let isNativeListening = false;
    let mediaRecorder = null;
    let audioStream = null;
    let audioChunks = [];
    let isRecordingFallback = false;
    let isTranscribing = false;
    let preferFallback = false;

    // Detect Brave browser to proactively use the server-side Whisper fallback
    if (navigator.brave && typeof navigator.brave.isBrave === "function") {
        navigator.brave.isBrave().then(brave => {
            if (brave) preferFallback = true;
        }).catch(() => {});
    }

    // Helper: Put transcript into message input
    function insertTranscript(transcript) {
        if (!transcript || !messageInput) return;
        const currentVal = messageInput.value.trim();
        messageInput.value = currentVal ? `${currentVal} ${transcript}` : transcript;
        messageInput.dispatchEvent(new Event("input", { bubbles: true }));
        messageInput.focus();
    }

    // MediaRecorder Fallback for Brave & unsupported/network-blocked environments
    async function startMediaRecorderFallback() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert("Audio recording is not supported in this browser.");
            return;
        }

        try {
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];

            let mimeType = 'audio/webm';
            if (typeof MediaRecorder.isTypeSupported === "function") {
                if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
                else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
                else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
                else mimeType = '';
            }

            mediaRecorder = mimeType ? new MediaRecorder(audioStream, { mimeType }) : new MediaRecorder(audioStream);

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstart = () => {
                isRecordingFallback = true;
                micBtn.classList.add("listening");
                micBtn.style.color = "#ff4757";
                micBtn.title = "Recording... Click again to stop and transcribe";
            };

            mediaRecorder.onstop = async () => {
                isRecordingFallback = false;
                micBtn.classList.remove("listening");
                micBtn.style.color = "";
                micBtn.title = "Voice Input (Speech to Text)";

                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                    audioStream = null;
                }

                if (audioChunks.length === 0) return;

                const recordedBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                audioChunks = [];

                const reader = new FileReader();
                reader.onload = async (ev) => {
                    const base64Audio = ev.target.result.split(",")[1];
                    if (!base64Audio) return;

                    try {
                        isTranscribing = true;
                        micBtn.style.opacity = "0.5";
                        micBtn.title = "Transcribing speech...";

                        const res = await apiFetch("/api/transcribe", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                audio: base64Audio,
                                mimeType: mediaRecorder.mimeType || 'audio/webm'
                            })
                        });

                        if (!res.ok) {
                            let errMsg = `Transcription error (${res.status})`;
                            try {
                                const errData = await res.json();
                                if (errData?.error) errMsg = errData.error;
                            } catch (_) {}
                            throw new Error(errMsg);
                        }

                        const data = await res.json();
                        if (data.text) {
                            insertTranscript(data.text.trim());
                        }
                    } catch (err) {
                        console.error("Transcription error:", err);
                        alert(`Voice transcription failed: ${err.message}`);
                    } finally {
                        isTranscribing = false;
                        micBtn.style.opacity = "";
                        micBtn.title = "Voice Input (Speech to Text)";
                    }
                };
                reader.readAsDataURL(recordedBlob);
            };

            mediaRecorder.start();
        } catch (err) {
            console.warn("Microphone access error:", err);
            isRecordingFallback = false;
            micBtn.classList.remove("listening");
            micBtn.style.color = "";
            if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
                alert("Microphone permission was denied. Please allow microphone access in your browser settings.");
            } else {
                alert(`Could not access microphone: ${err.message}`);
            }
        }
    }

    // Stop MediaRecorder fallback
    function stopMediaRecorderFallback() {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
    }

    // Click handler for mic button
    micBtn.addEventListener("click", () => {
        if (isTranscribing) return;

        // If currently recording via MediaRecorder, stop it to process
        if (isRecordingFallback) {
            stopMediaRecorderFallback();
            return;
        }

        // If currently listening via SpeechRecognition, stop it
        if (isNativeListening && nativeRecognition) {
            nativeRecognition.stop();
            return;
        }

        // If fallback preferred (e.g. Brave or previous network error) or SpeechRecognition unavailable
        if (preferFallback || !SpeechRecognition) {
            startMediaRecorderFallback();
            return;
        }

        // Attempt Chrome Web Speech Recognition
        try {
            nativeRecognition = new SpeechRecognition();
            nativeRecognition.lang = "en-US";
            nativeRecognition.interimResults = false;
            nativeRecognition.maxAlternatives = 1;

            nativeRecognition.onstart = () => {
                isNativeListening = true;
                micBtn.classList.add("listening");
                micBtn.style.color = "#ff4757";
            };

            nativeRecognition.onresult = (event) => {
                const transcript = event.results[0]?.[0]?.transcript;
                if (transcript) {
                    insertTranscript(transcript);
                }
            };

            nativeRecognition.onerror = (event) => {
                console.warn("Speech recognition error:", event.error);
                if (event.error === "network") {
                    // Brave / Google cloud blocked: switch to MediaRecorder fallback!
                    preferFallback = true;
                    isNativeListening = false;
                    micBtn.classList.remove("listening");
                    micBtn.style.color = "";
                    startMediaRecorderFallback();
                    return;
                }

                if (event.error !== "no-speech" && event.error !== "aborted") {
                    alert(`Voice input error: ${event.error}`);
                }
            };

            nativeRecognition.onend = () => {
                isNativeListening = false;
                micBtn.classList.remove("listening");
                micBtn.style.color = "";
            };

            nativeRecognition.start();
        } catch (err) {
            console.error("SpeechRecognition start error:", err);
            isNativeListening = false;
            micBtn.classList.remove("listening");
            micBtn.style.color = "";
            // Fallback immediately
            preferFallback = true;
            startMediaRecorderFallback();
        }
    });
}

// Handle outgoing message
const handleOutgoingMessage = (e) => {
    if (e) e.preventDefault();

    if (!currentUser) {
        authModal?.classList.remove("hidden");
        alert("Please sign in to start chatting.");
        return;
    }

    const textMessage = messageInput.value.trim();
    const currentFile = (userData.file && userData.file.data) ? {
        data: userData.file.data,
        mime_type: userData.file.mime_type || "image/jpeg"
    } : null;

    // If neither text nor image is provided, do nothing
    if (!textMessage && !currentFile) return;

    // Capture message text & attached image data BEFORE resetting state
    const userMessageText = textMessage;
    const attachedImage = currentFile;

    // Reset input field and upload preview immediately
    messageInput.value = "";
    userData.file = { data: null, mime_type: null };
    fileUploadWrapper.classList.remove("file-uploaded");
    const previewImg = fileUploadWrapper.querySelector("img");
    if (previewImg) previewImg.src = "#";
    fileInput.value = "";
    messageInput.dispatchEvent(new Event("input"));

    // Build user message content
    let messageContent = "";
    if (attachedImage) {
        messageContent += `
            <div class="user-msg-attachment">
                <img src="data:${attachedImage.mime_type};base64,${attachedImage.data}" alt="Uploaded image" class="user-msg-img" />
            </div>
        `;
    }
    if (userMessageText) {
        messageContent += `<div class="message-text"></div>`;
    }

    const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
    if (userMessageText) {
        outgoingMessageDiv.querySelector(".message-text").innerText = userMessageText;
    }
    chatBody.appendChild(outgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    setTimeout(() => {
        const botMessageContent = `
            <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
                <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1l166.9-110.6h160c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9z"></path>
            </svg>
            <div class="message-text">
                <div class="thinking-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>`;

        const incomingMessageDiv = createMessageElement(botMessageContent, "bot-message", "thinking");
        chatBody.appendChild(incomingMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        generateBotResponse(incomingMessageDiv, userMessageText, attachedImage);
    }, 600);
};

// Initialize voice input event listener
setupVoiceInput();

// Event listeners
const chatForm = document.querySelector(".chat-form");
if (chatForm) {
    chatForm.addEventListener("submit", (e) => {
        e.preventDefault();
        handleOutgoingMessage(e);
    });
}

messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleOutgoingMessage(e);
    }
});

messageInput.addEventListener("input", () => {
    messageInput.style.height = `${initialInputHeight}px`;
    messageInput.style.height = `${messageInput.scrollHeight}px`;
});

sendMessageButton.addEventListener("click", (e) => {
    e.preventDefault();
    handleOutgoingMessage(e);
});
chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
closeChatbot.addEventListener("click", () => document.body.classList.remove("show-chatbot"));

// Compress and resize image using browser Canvas API
function compressImage(file, maxDimension = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = (e) => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                let { width, height } = img;

                // Only resize if exceeds maximum dimension
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    const rawBase64 = e.target.result.split(",")[1];
                    return resolve({
                        dataUrl: e.target.result,
                        base64: rawBase64,
                        mimeType: file.type || "image/jpeg"
                    });
                }

                // Preserve transparency for PNG if small, otherwise use white background for JPEG
                const isPng = file.type === "image/png";
                if (!isPng) {
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, width, height);
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Determine appropriate output MIME format
                let outputMime = file.type || "image/jpeg";
                // If it's a huge PNG or resized, JPEG offers 10x smaller payload
                if (outputMime === "image/png" && (file.size > 1024 * 1024 || img.width > maxDimension || img.height > maxDimension)) {
                    outputMime = "image/jpeg";
                }

                const compressedDataUrl = canvas.toDataURL(outputMime, quality);
                const compressedBase64 = compressedDataUrl.split(",")[1];

                resolve({
                    dataUrl: compressedDataUrl,
                    base64: compressedBase64,
                    mimeType: outputMime
                });
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// File upload handling with automatic compression
fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (!file.type.match("image.*")) {
        alert("Please select a valid image file (PNG, JPEG, WebP, etc.).");
        fileInput.value = "";
        return;
    }

    try {
        const compressed = await compressImage(file, 1600, 0.8);
        const previewImg = fileUploadWrapper.querySelector("img");
        if (previewImg) previewImg.src = compressed.dataUrl;
        fileUploadWrapper.classList.add("file-uploaded");

        userData.file = {
            data: compressed.base64,
            mime_type: compressed.mimeType
        };
    } catch (err) {
        console.error("Image compression error:", err);
        // Fallback to direct read if canvas fails
        const reader = new FileReader();
        reader.onload = (e) => {
            const previewImg = fileUploadWrapper.querySelector("img");
            if (previewImg) previewImg.src = e.target.result;
            fileUploadWrapper.classList.add("file-uploaded");
            userData.file = {
                data: e.target.result.split(",")[1],
                mime_type: file.type || "image/jpeg"
            };
        };
        reader.readAsDataURL(file);
    } finally {
        fileInput.value = "";
    }
});

fileCancelButton.addEventListener("click", () => {
    userData.file = { data: null, mime_type: null };
    fileUploadWrapper.classList.remove("file-uploaded");
    const previewImg = fileUploadWrapper.querySelector("img");
    if (previewImg) previewImg.src = "#";
    fileInput.value = "";
});

document.querySelector("#file-upload")
    .addEventListener("click", () => fileInput.click());


// ===============================
// Emoji Picker Setup
// ===============================

const picker = new EmojiMart.Picker({
    onEmojiSelect: (emoji) => {

        const start = messageInput.selectionStart;
        const end = messageInput.selectionEnd;

        messageInput.setRangeText(
            emoji.native,
            start,
            end,
            "end"
        );

        messageInput.focus();
    },

    theme: "light",
    previewPosition: "none",
    skinTonePosition: "none"
});

// Add class for styling
picker.classList.add("EmojiMartPicker");

// Append picker to the document body so positioning isn't clipped
document.body.appendChild(picker);
// Hide initially and use fixed positioning so we can place it above the input
picker.style.display = 'none';
picker.style.position = 'fixed';
picker.style.zIndex = '9999';

// Ensure internal lists are scrollable and categories work — some emoji-mart builds differ in class names
function adjustPickerLayout() {
    const root = picker.shadowRoot || picker;
    const scrollSelectors = [
        '.emoji-mart-scroll',
        '.emoji-mart-body',
        '.emojis',
        '.emoji-mart-list',
        '.emoji-list',
        '.emoji-mart-scroll-wrapper',
        '.emoji-mart-anchors'
    ];

    scrollSelectors.forEach(sel => {
        root.querySelectorAll(sel).forEach(el => {
            el.style.maxHeight = el.style.maxHeight || '260px';
            el.style.overflowY = 'auto';
            el.style.webkitOverflowScrolling = 'touch';
        });
    });

    // Category nav horizontal scrolling
    const catNavSelectors = ['.emoji-mart-category-list', '.emoji-mart-categories', '.emoji-mart-anchors', '.emoji-mart-nav'];
    catNavSelectors.forEach(sel => {
        root.querySelectorAll(sel).forEach(nav => {
            nav.style.display = 'flex';
            nav.style.gap = nav.style.gap || '6px';
            nav.style.overflowX = 'auto';
            nav.style.whiteSpace = 'nowrap';
            nav.style.padding = nav.style.padding || '6px';
        });
    });

    // Ensure interactive elements are enabled
    root.querySelectorAll('button, a').forEach(el => {
        el.style.pointerEvents = 'auto';
    });

}

// Inject stronger CSS into the picker to override internal styles (uses !important)
function injectPickerCSS() {
    if (picker._injectedStyle) return;
    const css = `
        .EmojiMartPicker { max-width:420px !important; max-height:360px !important; }
        .EmojiMartPicker *, .EmojiMartPicker *::before, .EmojiMartPicker *::after { box-sizing: border-box !important; }
        .EmojiMartPicker .emoji-mart-scroll, .EmojiMartPicker .emoji-mart-body, .EmojiMartPicker .emojis, .EmojiMartPicker .emoji-mart-list, .EmojiMartPicker .emoji-list { max-height:260px !important; overflow-y:auto !important; }
        .EmojiMartPicker .emoji-mart-category-list, .EmojiMartPicker .emoji-mart-categories, .EmojiMartPicker .emoji-mart-anchors, .EmojiMartPicker .emoji-mart-nav { display:flex !important; gap:6px !important; overflow-x:auto !important; white-space:nowrap !important; }
        .EmojiMartPicker button, .EmojiMartPicker a { pointer-events:auto !important; }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    const root = picker.shadowRoot || picker;
    // append to shadow root if open so styles reach internal elements
    try { root.appendChild(style); } catch (e) { picker.appendChild(style); }
    picker._injectedStyle = style;
}

// Find the main scroll container used by the picker
function getPickerScrollContainer() {
    const candidates = ['.emoji-mart-scroll', '.emoji-mart-body', '.emoji-mart-list', '.emojis', '.emoji-list', '.emoji-mart-scroll-wrapper'];
    const root = picker.shadowRoot || picker;
    for (const sel of candidates) {
        const el = root.querySelector(sel);
        if (el) return el;
    }
    // fallback to picker itself
    return picker;
}

// Robust category nav fallback: click on nav child -> scroll container to matching group
function setupCategoryFallback() {
    const root = picker.shadowRoot || picker;
    // prefer the concrete nav used by this build
    const nav = root.querySelector('#nav') || root.querySelector('.emoji-mart-anchors, .emoji-mart-categories, .emoji-mart-category-list, .emoji-mart-nav');
    // the main scroll area in the pasted DOM is '.scroll'
    const scrollContainer = root.querySelector('.scroll') || getPickerScrollContainer();
    if (!nav || !scrollContainer) return;

    if (nav.__fallbackAttached) return;

    nav.addEventListener('click', (ev) => {
        let target = ev.target;
        // climb to the immediate button child inside nav
        while (target && target !== nav && target.tagName !== 'BUTTON' && target.tagName !== 'A') {
            target = target.parentElement;
        }
        if (!target || target === nav) return;

        const buttons = Array.from(nav.querySelectorAll('button, a')).filter(n => n.offsetParent !== null);
        const idx = buttons.indexOf(target);
        if (idx === -1) return;

        // find category blocks in the scroll area
        const groups = Array.from(root.querySelectorAll('.category'))
            .filter(n => n.offsetParent !== null);
        const group = groups[idx] || groups.find(g => (g.getAttribute('data-id')||'').toLowerCase().includes((target.getAttribute('aria-label')||target.textContent||'').trim().toLowerCase()));
        if (!group) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const groupRect = group.getBoundingClientRect();
        const offset = groupRect.top - containerRect.top + scrollContainer.scrollTop - 8;
        scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
        ev.preventDefault();
    });

    nav.__fallbackAttached = true;
}

// Try to wire category buttons to scroll to matching sections as a fallback
function setupCategoryHandlers() {
    const root = picker.shadowRoot || picker;
    const navCandidates = Array.from(root.querySelectorAll('button, a, [role="tab"]'));
    if (navCandidates.length === 0) return;

    // Collect possible section elements
    const sectionCandidates = Array.from(root.querySelectorAll('[data-category], [data-name], .emoji-group, .emoji-mart-group, .emoji-mart-category'));

    navCandidates.forEach(btn => {
        // avoid attaching duplicate handlers
        if (btn.__emojiNavHandlerAttached) return;

        btn.addEventListener('click', (ev) => {
            // allow normal behavior first — some builds will handle it
            // but also provide fallback: try to scroll to a matching section
            const text = (btn.textContent || '').trim();
            if (!text) return;

            // First try aria-controls / href
            const aria = btn.getAttribute('aria-controls') || btn.getAttribute('href');
            if (aria) {
                const id = aria.replace(/^#/, '');
                const target = picker.querySelector(`#${CSS.escape(id)}`) || document.getElementById(id);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    ev.preventDefault();
                    return;
                }
            }

            // Fallback: match by text content to section headings
            const match = sectionCandidates.find(sec => (sec.textContent || '').toLowerCase().includes(text.toLowerCase()));
            if (match) {
                match.scrollIntoView({ behavior: 'smooth', block: 'start' });
                ev.preventDefault();
            }
        });

        btn.__emojiNavHandlerAttached = true;
    });
}

// Run once and attach a MutationObserver to reapply if the picker renders later
adjustPickerLayout();
injectPickerCSS();
setupCategoryHandlers();
setupCategoryFallback();

const pickerObserver = new MutationObserver((mutations) => {
    // reapply overrides when internal structure changes
    adjustPickerLayout();
    injectPickerCSS();
    setupCategoryHandlers();
    setupCategoryFallback();
});

pickerObserver.observe(picker, { childList: true, subtree: true });
// Single toggle handler (prevent duplicate/conflicting listeners)
const emojiBtn = document.querySelector("#emoji-picker");
emojiBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    // Toggle hide
    if (picker.style.display === 'block') {
        picker.style.display = 'none';
        return;
    }

    // Show and position centered above the input box
    // ensure overrides and handlers are in place before showing
    injectPickerCSS();
    adjustPickerLayout();
    setupCategoryHandlers();
    setupCategoryFallback();

    // force host sizing so shadow DOM layout can compute (some builds rely on host size)
    picker.style.display = 'block';
    picker.style.width = `${Math.min(400, window.innerWidth - 16)}px`;
    picker.style.height = picker.style.height || '360px';

    // also ensure the internal scroll container has a usable height
    const rootForOpen = picker.shadowRoot || picker;
    const scrollForOpen = rootForOpen.querySelector('.scroll') || getPickerScrollContainer();
    if (scrollForOpen) {
        scrollForOpen.style.maxHeight = scrollForOpen.style.maxHeight || '260px';
        scrollForOpen.style.height = scrollForOpen.style.height || '260px';
        scrollForOpen.style.overflowY = 'auto';
    }

    // Ensure measurable before positioning
    picker.style.left = '0px';
    picker.style.top = '0px';

    requestAnimationFrame(() => {
        const pRect = picker.getBoundingClientRect();
        const inputRect = messageInput.getBoundingClientRect();

        let left = inputRect.left + inputRect.width / 2 - pRect.width / 2;
        let top = inputRect.top - pRect.height - 8; // 8px gap above input

        // If not enough space above, place below input
        if (top < 8) top = inputRect.bottom + 8;

        // Keep inside viewport horizontally
        left = Math.max(8, Math.min(left, window.innerWidth - pRect.width - 8));

        picker.style.left = `${left}px`;
        picker.style.top = `${top}px`;
    });
});

// Close picker when clicking outside
document.addEventListener("click", (e) => {
    if (!picker.contains(e.target) && !emojiBtn.contains(e.target)) {
        picker.style.display = "none";
    }
});

// Voice button handler
document.addEventListener('click', (e) => {
    const voiceBtn = e.target.closest('.voice-btn');
    if (voiceBtn) {
        const message = voiceBtn.getAttribute('data-message');
        window.speechSynthesis.speaking
            ? window.speechSynthesis.cancel()
            : speakText(message);
    }
});

// (Removed duplicate handlers above — consolidated behavior already defined)

// --- SPRINT 3: CHAT MANAGER (REDIS CONVERSATION PERSISTENCE) ---
const defaultWelcomeHTML = `
    <div class="message bot-message">
        <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
            <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
        </svg>
        <div class="message-text">Hey there 👋 <br /> How can I help you today?</div>
        <button class="voice-btn" data-message="Hey there 👋 How can I help you today?">
            <span class="material-symbols-rounded">volume_up</span>
        </button>
    </div>
`;

function resetChatWindow() {
    chatBody.innerHTML = defaultWelcomeHTML;
}

// Fetch & render sidebar chat list
async function loadChatList() {
    closeChatMenu();

    if (!currentUser) {
        const historyContainer = document.querySelector(".chat-history");
        if (historyContainer) historyContainer.innerHTML = "";
        return;
    }

    try {
        const res = await apiFetch("/api/get-chats");
        if (!res.ok) {
            if (res.status === 401) {
                const historyContainer = document.querySelector(".chat-history");
                if (historyContainer) historyContainer.innerHTML = "";
            }
            return;
        }
        const chats = await res.json();
        const historyContainer = document.querySelector(".chat-history");
        if (!historyContainer) return;

        historyContainer.innerHTML = "";

        if (!Array.isArray(chats) || chats.length === 0) {
            return;
        }

        chats.forEach(chat => {
            const div = document.createElement("div");
            div.className = `chat-history-item ${chat.id === currentChatId ? 'active' : ''}`;
            div.setAttribute("data-id", chat.id);
            div.innerHTML = `
                <span class="material-symbols-rounded">chat_bubble</span>
                <span class="history-text">${escapeHtml(chat.title || "New Chat")}</span>
                <button class="chat-menu-btn" title="Chat options" aria-label="Chat options" type="button">
                    <span class="material-symbols-rounded">more_vert</span>
                </button>
            `;

            const menuBtn = div.querySelector(".chat-menu-btn");
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleChatMenu(chat.id, chat.title || "New Chat", menuBtn);
            });

            div.addEventListener("click", () => {
                closeChatMenu();
                loadChat(chat.id);
            });

            historyContainer.appendChild(div);
        });
    } catch (err) {
        console.error("Failed to load chat list:", err);
    }
}

// Start a new chat
async function startNewChat(autoSelect = true) {
    if (isMobileView()) {
        closeMobileSidebar();
    }

    if (!currentUser) {
        authModal?.classList.remove("hidden");
        return;
    }

    try {
        const res = await apiFetch("/api/create-chat", { method: "POST" });
        if (!res.ok) {
            if (res.status === 401) {
                authModal?.classList.remove("hidden");
                return;
            }
            throw new Error("Failed to create chat");
        }
        const data = await res.json();
        currentChatId = data.chatId;
        currentChatTitle = data.title || "New Chat";

        resetChatWindow();

        if (autoSelect) {
            await loadChatList();
        }
    } catch (err) {
        console.error("Error starting new chat:", err);
    }
}

// Load a specific chat and render its messages
async function loadChat(id) {
    if (isMobileView()) {
        closeMobileSidebar();
    }

    if (!id || !currentUser) return;
    try {
        const res = await apiFetch(`/api/get-chat?id=${id}`);
        if (!res.ok) throw new Error("Failed to fetch chat");
        const chat = await res.json();

        currentChatId = chat.id;
        currentChatTitle = chat.title || "New Chat";

        // Highlight active chat item in sidebar
        document.querySelectorAll(".chat-history-item").forEach(item => {
            if (item.getAttribute("data-id") === id) {
                item.classList.add("active");
            } else {
                item.classList.remove("active");
            }
        });

        // Replay messages
        chatBody.innerHTML = "";
        if (!chat.messages || chat.messages.length === 0) {
            resetChatWindow();
            return;
        }

        chat.messages.forEach(m => {
            if (m.role === "user") {
                const userDiv = createMessageElement('<div class="message-text"></div>', "user-message");
                userDiv.querySelector(".message-text").innerText = m.content;
                chatBody.appendChild(userDiv);
            } else if (m.role === "assistant") {
                const botDiv = createMessageElement(`
                    <svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
                        <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
                    </svg>
                    <div class="message-text"></div>
                `, "bot-message");

                renderAssistantContent(botDiv.querySelector(".message-text"), m.content);

                const voiceBtn = document.createElement('button');
                voiceBtn.className = 'voice-btn';
                voiceBtn.setAttribute('data-message', stripMarkdown(m.content));
                voiceBtn.innerHTML = '<span class="material-symbols-rounded">volume_up</span>';
                voiceBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (window.speechSynthesis.speaking) {
                        window.speechSynthesis.cancel();
                    } else {
                        speakText(m.content);
                    }
                };
                botDiv.appendChild(voiceBtn);
                chatBody.appendChild(botDiv);
            }
        });

        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    } catch (err) {
        console.error("Error loading chat:", err);
    }
}

// Delete chat
async function deleteChat(id) {
    if (!currentUser) return;

    try {
        const res = await apiFetch(`/api/delete-chat`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId: id })
        });
        if (!res.ok) throw new Error("Failed to delete chat");

        const isDeletingActive = (currentChatId === id);
        if (isDeletingActive) {
            currentChatId = null;
        }

        const resChats = await apiFetch("/api/get-chats");
        if (resChats.ok) {
            const remainingChats = await resChats.json();
            if (Array.isArray(remainingChats) && remainingChats.length > 0) {
                await loadChatList();
                if (isDeletingActive) {
                    await loadChat(remainingChats[0].id);
                }
            } else {
                currentChatId = null;
                currentChatTitle = "New Chat";
                resetChatWindow();
                const historyContainer = document.querySelector(".chat-history");
                if (historyContainer) historyContainer.innerHTML = "";
            }
        }
    } catch (err) {
        console.error("Error deleting chat:", err);
    }
}

// ===============================
// Chat Context Menu & Rename Operations
// ===============================
let activeMenuChatId = null;
let activeMenuChatTitle = "";
let renameTargetChatId = null;
let renameOriginalTitle = "";

const chatContextMenu = document.getElementById("chatContextMenu");
const menuRenameBtn = document.getElementById("menuRenameBtn");
const menuDeleteBtn = document.getElementById("menuDeleteBtn");

const renameModal = document.getElementById("renameModal");
const renameForm = document.getElementById("renameForm");
const renameInput = document.getElementById("renameInput");
const renameError = document.getElementById("renameError");
const renameCancelBtn = document.getElementById("renameCancelBtn");
const renameSaveBtn = document.getElementById("renameSaveBtn");

function closeChatMenu() {
    if (!chatContextMenu) return;
    chatContextMenu.classList.add("hidden");
    document.querySelectorAll(".chat-history-item.menu-open").forEach(item => {
        item.classList.remove("menu-open");
    });
    activeMenuChatId = null;
    activeMenuChatTitle = "";
}

function toggleChatMenu(chatId, title, buttonEl) {
    if (!chatContextMenu) return;

    if (activeMenuChatId === chatId && !chatContextMenu.classList.contains("hidden")) {
        closeChatMenu();
        return;
    }

    closeChatMenu();

    activeMenuChatId = chatId;
    activeMenuChatTitle = title;

    const parentItem = buttonEl.closest(".chat-history-item");
    if (parentItem) {
        parentItem.classList.add("menu-open");
    }

    chatContextMenu.classList.remove("hidden");
    const menuWidth = chatContextMenu.offsetWidth || 135;
    const menuHeight = chatContextMenu.offsetHeight || 80;

    const rect = buttonEl.getBoundingClientRect();

    // Position horizontally: align with right edge of button, clamped in viewport
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
        left = window.innerWidth - menuWidth - 8;
    }

    // Position vertically: below button, or above if close to bottom
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuHeight - 4);
    }

    chatContextMenu.style.top = `${top}px`;
    chatContextMenu.style.left = `${left}px`;
}

function openRenameModal(chatId, currentTitle) {
    if (!renameModal || !renameInput) return;

    renameTargetChatId = chatId;
    renameOriginalTitle = (currentTitle || "New Chat").trim();

    renameInput.value = renameOriginalTitle;
    if (renameError) {
        renameError.textContent = "";
        renameError.style.display = "none";
    }
    if (renameSaveBtn) {
        renameSaveBtn.disabled = false;
        renameSaveBtn.textContent = "Save";
    }

    renameModal.classList.remove("hidden");
    setTimeout(() => {
        renameInput.focus();
        renameInput.select();
    }, 50);
}

function closeRenameModal() {
    if (renameModal) {
        renameModal.classList.add("hidden");
    }
    if (renameError) {
        renameError.textContent = "";
        renameError.style.display = "none";
    }
    renameTargetChatId = null;
    renameOriginalTitle = "";
}

async function handleRenameSubmit(e) {
    if (e) e.preventDefault();

    if (!renameInput || !renameTargetChatId) return;

    const newTitle = renameInput.value.trim();

    // Validation
    if (!newTitle) {
        if (renameError) {
            renameError.textContent = "Title cannot be empty";
            renameError.style.display = "block";
        }
        renameInput.focus();
        return;
    }

    if (newTitle.length > 100) {
        if (renameError) {
            renameError.textContent = "Title must be 100 characters or less";
            renameError.style.display = "block";
        }
        renameInput.focus();
        return;
    }

    // If unchanged, simply cancel/close
    if (newTitle === renameOriginalTitle) {
        closeRenameModal();
        return;
    }

    try {
        if (renameSaveBtn) {
            renameSaveBtn.disabled = true;
            renameSaveBtn.textContent = "Saving...";
        }

        const res = await apiFetch("/api/rename-chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chatId: renameTargetChatId,
                title: newTitle
            })
        });

        if (!res.ok) {
            let errorMsg = "Failed to rename chat";
            try {
                const errData = await res.json();
                if (errData && errData.error) errorMsg = errData.error;
            } catch (_) {}
            throw new Error(errorMsg);
        }

        const data = await res.json();
        const finalTitle = data.title || newTitle;

        // Immediately update DOM title
        const itemText = document.querySelector(`.chat-history-item[data-id="${renameTargetChatId}"] .history-text`);
        if (itemText) {
            itemText.textContent = finalTitle;
        }

        // If the renamed chat is the currently active chat, update currentChatTitle
        if (currentChatId === renameTargetChatId) {
            currentChatTitle = finalTitle;
        }

        closeRenameModal();
        await loadChatList();
    } catch (err) {
        console.error("Error renaming chat:", err);
        if (renameError) {
            renameError.textContent = err.message || "Failed to rename chat";
            renameError.style.display = "block";
        }
        if (renameSaveBtn) {
            renameSaveBtn.disabled = false;
            renameSaveBtn.textContent = "Save";
        }
    }
}

// Menu button event listeners
menuRenameBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = activeMenuChatId;
    const title = activeMenuChatTitle;
    closeChatMenu();
    if (id) {
        openRenameModal(id, title);
    }
});

menuDeleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = activeMenuChatId;
    closeChatMenu();
    if (id) {
        deleteChat(id);
    }
});

// Close menu when clicking outside
document.addEventListener("click", (e) => {
    if (!e.target.closest("#chatContextMenu") && !e.target.closest(".chat-menu-btn")) {
        closeChatMenu();
    }
});

// Close menu on scroll or resize
window.addEventListener("resize", closeChatMenu);
document.querySelector(".chat-history")?.addEventListener("scroll", closeChatMenu);

// Rename modal event listeners
renameForm?.addEventListener("submit", handleRenameSubmit);
renameCancelBtn?.addEventListener("click", closeRenameModal);

renameModal?.addEventListener("click", (e) => {
    if (e.target === renameModal) {
        closeRenameModal();
    }
});

// Global Escape listener
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        if (chatContextMenu && !chatContextMenu.classList.contains("hidden")) {
            closeChatMenu();
        } else if (renameModal && !renameModal.classList.contains("hidden")) {
            closeRenameModal();
        }
    }
});

// Sync chats for the current authenticated user
async function syncUserChats() {
    if (!currentUser) return;
    try {
        const res = await apiFetch("/api/get-chats");
        if (res.ok) {
            const chats = await res.json();
            if (Array.isArray(chats) && chats.length > 0) {
                await loadChatList();
                await loadChat(chats[0].id);
                return;
            }
        }
        currentChatId = null;
        currentChatTitle = "New Chat";
        resetChatWindow();
        const historyContainer = document.querySelector(".chat-history");
        if (historyContainer) historyContainer.innerHTML = "";
    } catch (err) {
        console.error("Error syncing chats:", err);
    }
}

// Set default body class
document.body.classList.add("show-chatbot");

const newChatBtn = document.querySelector(".new-chat-btn");
if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
        startNewChat(true);
    });
}

// Listen for auth state changes from Supabase
supabase.auth.onAuthStateChange(async (event, session) => {
    const user = session?.user || null;
    const prevUserId = currentUser?.id;
    currentUser = user;
    updateAuthUI(user);

    if (user) {
        if (prevUserId !== user.id) {
            await syncUserChats();
        }
    } else {
        currentChatId = null;
        currentChatTitle = "New Chat";
        resetChatWindow();
        const historyContainer = document.querySelector(".chat-history");
        if (historyContainer) historyContainer.innerHTML = "";
    }
});

// Initialize session and chats on load
(async function initAuthAndChats() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user || null;
        updateAuthUI(currentUser);

        if (currentUser) {
            await syncUserChats();
        } else {
            resetChatWindow();
            const historyContainer = document.querySelector(".chat-history");
            if (historyContainer) historyContainer.innerHTML = "";
        }
    } catch (e) {
        console.error("Init auth error:", e);
        updateAuthUI(null);
        resetChatWindow();
    }
})();

// ===============================
// Mobile Sidebar Drawer Management
// ===============================

const hamburgerMenu = document.getElementById("hamburger-menu");
const sidebarOverlay = document.getElementById("sidebar-overlay");

function isMobileView() {
    return window.innerWidth <= 768;
}

function openMobileSidebar() {
    document.body.classList.add("sidebar-open");
    hamburgerMenu?.setAttribute("aria-expanded", "true");
    const icon = hamburgerMenu?.querySelector(".material-symbols-rounded");
    if (icon) icon.textContent = "close";
}

function closeMobileSidebar() {
    document.body.classList.remove("sidebar-open");
    hamburgerMenu?.setAttribute("aria-expanded", "false");
    const icon = hamburgerMenu?.querySelector(".material-symbols-rounded");
    if (icon) icon.textContent = "menu";
}

function toggleMobileSidebar() {
    if (document.body.classList.contains("sidebar-open")) {
        closeMobileSidebar();
    } else {
        openMobileSidebar();
    }
}

// Hamburger button click handler
hamburgerMenu?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMobileSidebar();
});

// Close button inside sidebar header
const closeSidebarBtn = document.getElementById("closeSidebar");
closeSidebarBtn?.addEventListener("click", () => {
    closeMobileSidebar();
});

// Overlay click handler
sidebarOverlay?.addEventListener("click", () => {
    closeMobileSidebar();
});

// Escape key to close mobile drawer
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && document.body.classList.contains("sidebar-open")) {
        closeMobileSidebar();
    }
});

// Close mobile sidebar on resizing back to desktop view
window.addEventListener("resize", () => {
    if (!isMobileView() && document.body.classList.contains("sidebar-open")) {
        closeMobileSidebar();
    }
});

// Close mobile drawer when clicking sidebar tool links
document.querySelectorAll(".sidebar-tool-link").forEach(link => {
    link.addEventListener("click", () => {
        if (isMobileView()) {
            closeMobileSidebar();
        }
    });
});