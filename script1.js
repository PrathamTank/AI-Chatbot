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


// Generate Bot Response (Direct Groq API)
const CHAT_API_URL = "/api/chat";

const generateBotResponse = async (incomingMessageDiv) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    try {
        // Send only the user message to our backend — no API key in this request
        const response = await fetch(CHAT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: userData.message
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "API error");

        // Backend returns { reply: "..." }
        const apiResponseText = data.reply;

        // Render markdown-like formatting (basic): code blocks, inline code, bold, italic, links, strike
        const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

    } catch (error) {
        console.error(error);
        messageElement.innerText = "Error getting response.";
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
        generateBotResponse(incomingMessageDiv);
    }, 600);
};

// Event listeners
messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) {
        handleOutgoingMessage(e);
    }
});

messageInput.addEventListener("input", () => {
    messageInput.style.height = `${initialInputHeight}px`;
    messageInput.style.height = `${messageInput.scrollHeight}px`;
});

sendMessageButton.addEventListener("click", handleOutgoingMessage);
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