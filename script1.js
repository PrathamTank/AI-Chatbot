const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const fileCancelButton = document.querySelector("#file-cancel");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");

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

// Markdown & HTML Helper Functions
const escapeHtml = (s) => s ? s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';

const renderMarkdown = (raw) => {
    if (!raw) return '';
    let t = escapeHtml(raw);
    // Code blocks ```...```
    t = t.replace(/```([\s\S]*?)```/g, (m, code) => `<pre><code>${code.replace(/</g,'&lt;')}</code></pre>`);
    // Inline code `...`
    t = t.replace(/`([^`]+?)`/g, (m, code) => `<code>${code}</code>`);
    // Bold + italic ***text***
    t = t.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    // Bold **text** or __text__
    t = t.replace(/(\*\*|__)([\s\S]+?)\1/g, '<strong>$2</strong>');
    // Italic *text* or _text_
    t = t.replace(/(\*|_)([^\*_\n][\s\S]*?)\1/g, '<em>$2</em>');
    // Strikethrough ~~text~~
    t = t.replace(/~~([\s\S]+?)~~/g, '<s>$1</s>');
    // Links [text](url)
    t = t.replace(/\[([^\]]+?)\]\(([^\)]+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Replace remaining line breaks with <br>
    t = t.replace(/\n/g, '<br>');
    return t;
};

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

const generateBotResponse = async (incomingMessageDiv, userMessageText) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    // Ensure we have a active chatId
    if (!currentChatId) {
        try {
            const createRes = await fetch("/api/create-chat", { method: "POST" });
            if (createRes.ok) {
                const createData = await createRes.json();
                currentChatId = createData.chatId;
                currentChatTitle = createData.title || "New Chat";
            }
        } catch (e) {
            console.error("Failed to auto-create chat ID:", e);
        }
    }

    try {
        const response = await fetch(CHAT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                chatId: currentChatId,
                message: userMessageText || userData.message
            })
        });

        if (!response.ok) {
            let errMsg = `Server error: ${response.status} ${response.statusText}`;
            try {
                const errData = await response.json();
                if (errData && errData.error) errMsg = errData.error;
            } catch (_) {}
            throw new Error(errMsg);
        }

        const data = await response.json();
        const apiResponseText = data.reply;

        const rendered = renderMarkdown(apiResponseText);
        messageElement.innerHTML = rendered;

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
        if ((!currentChatTitle || currentChatTitle === "New Chat") && userMessageText) {
            const cleanMsg = userMessageText.trim().replace(/\n/g, ' ');
            const newTitle = cleanMsg.length > 35 ? cleanMsg.slice(0, 35) + "..." : cleanMsg;
            currentChatTitle = newTitle;

            fetch("/api/rename-chat", {
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
        userData.file = {};
        incomingMessageDiv.classList.remove("thinking");
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
};

// Voice Input
function voice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Speech recognition not supported in your browser!");
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-GB";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function (event) {
        document.getElementById("speechToText").value = event.results[0][0].transcript;
    };

    recognition.onerror = function (event) {
        alert("Speech error: " + event.error);
    };

    recognition.start();
}

// Handle outgoing message
const handleOutgoingMessage = (e) => {
    e.preventDefault();
    userData.message = messageInput.value.trim();
    if (!userData.message) return;

    const userMessageText = userData.message;

    messageInput.value = "";
    fileUploadWrapper.classList.remove("file-uploaded");
    messageInput.dispatchEvent(new Event("input"));

    const messageContent = `<div class="message-text"></div>`;
    const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
    outgoingMessageDiv.querySelector(".message-text").innerText = userData.message;
    chatBody.appendChild(outgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    setTimeout(() => {
        const messageContent = `
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

        const incomingMessageDiv = createMessageElement(messageContent, "bot-message", "thinking");
        chatBody.appendChild(incomingMessageDiv);
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
        generateBotResponse(incomingMessageDiv, userMessageText);
    }, 600);
};

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

// File upload handling
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        fileUploadWrapper.querySelector("img").src = e.target.result;
        fileUploadWrapper.classList.add("file-uploaded");
        const base64String = e.target.result.split(",")[1];

        userData.file = {
            data: base64String,
            mime_type: file.type
        };

        fileInput.value = "";
    };
    reader.readAsDataURL(file);
});

fileCancelButton.addEventListener("click", () => {
    userData.file = {};
    fileUploadWrapper.classList.remove("file-uploaded");
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
    picker.style.width = picker.style.width || '420px';
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
    try {
        const res = await fetch("/api/get-chats");
        if (!res.ok) return;
        const chats = await res.json();
        const historyContainer = document.querySelector(".chat-history");
        if (!historyContainer) return;

        historyContainer.innerHTML = "";

        if (chats.length === 0) {
            return;
        }

        chats.forEach(chat => {
            const div = document.createElement("div");
            div.className = `chat-history-item ${chat.id === currentChatId ? 'active' : ''}`;
            div.setAttribute("data-id", chat.id);
            div.innerHTML = `
                <span class="material-symbols-rounded">chat_bubble</span>
                <span class="history-text">${escapeHtml(chat.title || "New Chat")}</span>
                <button class="delete-chat-btn" title="Delete chat">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;

            div.addEventListener("click", (e) => {
                if (e.target.closest(".delete-chat-btn")) {
                    e.stopPropagation();
                    deleteChat(chat.id);
                } else {
                    loadChat(chat.id);
                }
            });

            historyContainer.appendChild(div);
        });
    } catch (err) {
        console.error("Failed to load chat list:", err);
    }
}

// Start a new chat
async function startNewChat(autoSelect = true) {
    try {
        const res = await fetch("/api/create-chat", { method: "POST" });
        if (!res.ok) throw new Error("Failed to create chat");
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
    if (!id) return;
    try {
        const res = await fetch(`/api/get-chat?id=${id}`);
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
                    <div class="message-text">${renderMarkdown(m.content)}</div>
                `, "bot-message");

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
    try {
        const res = await fetch(`/api/delete-chat`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId: id })
        });
        if (!res.ok) throw new Error("Failed to delete chat");

        const isDeletingActive = (currentChatId === id);
        if (isDeletingActive) {
            currentChatId = null;
        }

        const resChats = await fetch("/api/get-chats");
        const remainingChats = await resChats.json();
        if (remainingChats.length > 0) {
            await loadChatList();
            if (isDeletingActive) {
                await loadChat(remainingChats[0].id);
            }
        } else {
            await startNewChat(true);
        }
    } catch (err) {
        console.error("Error deleting chat:", err);
    }
}

// Set default body class & initialize Chat Manager
document.body.classList.add("show-chatbot");

const newChatBtn = document.querySelector(".new-chat-btn");
if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
        startNewChat(true);
    });
}

// Load chats on initial application load
(async function initChatManager() {
    try {
        const res = await fetch("/api/get-chats");
        if (res.ok) {
            const chats = await res.json();
            if (chats.length > 0) {
                await loadChatList();
                await loadChat(chats[0].id);
                return;
            }
        }
        await startNewChat(true);
    } catch (err) {
        console.error("Initialization error:", err);
        await startNewChat(true);
    }
})();