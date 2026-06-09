const chatBody = document.querySelector(".chat-body");
const messageInput = document.querySelector(".message-input");
const sendMessageButton = document.querySelector("#send-message");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const fileCancelButton = document.querySelector("#file-cancel");
const chatbotToggler = document.querySelector("#chatbot-toggler");
const closeChatbot = document.querySelector("#close-chatbot");


// Dynamically point to the Express backend.
// If the page is opened via Live Server (port 5500) or file://, direct requests to port 3000.
const BACKEND_URL = window.location.origin.includes("localhost:3000") || window.location.origin.includes("127.0.0.1:3000") ? "" : "http://localhost:3000";
const SUMMARIZE_API_URL = `${BACKEND_URL}/api/summarize`;

const userData = {
    message: null,
    file: {
        text: null,
        name: null
    }
}

const chatHistory = [];
const initialInputHeight = messageInput.scrollHeight;

//Create message element with dynamic classes and return it

const createMessageElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML =  content;
    return div;
}

//Generate Bot Response using Groq AI directly
const generateBotResponse = async (incomingMessageDiv) => {
    const messageElement = incomingMessageDiv.querySelector(".message-text");

    // Build prompt — append file text if a document was uploaded
    let prompt = userData.message || "Summarize this document";
    if (userData.file?.text) {
        prompt += `\n\nDocument Content:\n${userData.file.text}`;
    }

    try {
        // Send only the assembled prompt to our backend — no API key in this request
        const response = await fetch(SUMMARIZE_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ prompt })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "API error");

        // Backend returns { reply: "..." }
        const apiResponseText = data.reply;
        messageElement.innerText = apiResponseText;

    } catch (error) {
        console.log(error);
        messageElement.innerText = "Error getting response.";
        messageElement.style.color = "#ff0000";

    } finally {
        userData.file = {};
        incomingMessageDiv.classList.remove("thinking");
        chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });
    }
}

//Handles outgoing user messages
const handleOutgoingMessage = (e) => {
    e.preventDefault();
    userData.message = messageInput.value.trim();
    //messageInput.value = "";
    messageInput.placeholder = "Summarize this document";
    fileUploadWrapper.classList.remove("file-uploaded");
    messageInput.dispatchEvent(new Event("input"));


    //Create and display user message
    const messageContent = `<div class="message-text"></div>
                            ${userData.file.data ? `<img src="data:${userData.file.mime_type};base64,${userData.file.data}" class="attachment" />` : "" }`;

    const outgoingMessageDiv = createMessageElement(messageContent, "user-message");
    outgoingMessageDiv.querySelector(".message-text").innerText = userData.message;
    chatBody.appendChild(outgoingMessageDiv);
    chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: "smooth" });

    //Simulate bot response with thinking indicator after a delay
    setTimeout(() => {
        const messageContent = `<svg class="bot-avatar" xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 1024 1024">
                    <path d="M738.3 287.6H285.7c-59 0-106.8 47.8-106.8 106.8v303.1c0 59 47.8 106.8 106.8 106.8h81.5v111.1c0 .7.8 1.1 1.4.7l166.9-110.6 41.8-.8h117.4l43.6-.4c59 0 106.8-47.8 106.8-106.8V394.5c0-59-47.8-106.9-106.8-106.9zM351.7 448.2c0-29.5 23.9-53.5 53.5-53.5s53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5-53.5-23.9-53.5-53.5zm157.9 267.1c-67.8 0-123.8-47.5-132.3-109h264.6c-8.6 61.5-64.5 109-132.3 109zm110-213.7c-29.5 0-53.5-23.9-53.5-53.5s23.9-53.5 53.5-53.5 53.5 23.9 53.5 53.5-23.9 53.5-53.5 53.5zM867.2 644.5V453.1h26.5c19.4 0 35.1 15.7 35.1 35.1v121.1c0 19.4-15.7 35.1-35.1 35.1h-26.5zM95.2 609.4V488.2c0-19.4 15.7-35.1 35.1-35.1h26.5v191.3h-26.5c-19.4 0-35.1-15.7-35.1-35.1zM561.5 149.6c0 23.4-15.6 43.3-36.9 49.7v44.9h-30v-44.9c-21.4-6.5-36.9-26.3-36.9-49.7 0-28.6 23.3-51.9 51.9-51.9s51.9 23.3 51.9 51.9z"></path>
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
}

//Handle Enter key press for sending messages
messageInput.addEventListener("keydown", (e) => {
    const userMessage = e.target.value.trim();

    if(e.key === "Enter" && !e.shiftKey && window.innerWidth > 768) {
        handleOutgoingMessage(e);
    }
});

//Adjust input field height dynamically
messageInput.addEventListener("input", () => {
    messageInput.style.height = `${initialInputHeight}px`
    messageInput.style.height = `${messageInput.scrollHeight}px`
    document.querySelector(".chat-form").style.borderRadius = messageInput.scrollHeight > initialInputHeight ? "15px" : "32px";
});

// Handle file input change
// Handle file upload
fileInput.addEventListener("change", async () => {

    const file = fileInput.files[0];
    if (!file) return;

    userData.file = {
        text: null,
        name: file.name
    };

    const fileType = file.type;

    try {

        // TXT FILES
        if (fileType === "text/plain") {

            const text = await file.text();
            userData.file.text = text;
        }

        // PDF FILES
        else if (fileType === "application/pdf") {

            const arrayBuffer = await file.arrayBuffer();

            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            let fullText = "";

            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

                const page = await pdf.getPage(pageNum);

                const textContent = await page.getTextContent();

                const pageText = textContent.items
                    .map(item => item.str)
                    .join(" ");

                fullText += pageText + "\n";
            }

            userData.file.text = fullText;
        }

        // DOCX FILES
        else if (
            fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {

            const arrayBuffer = await file.arrayBuffer();

            const result = await mammoth.extractRawText({
                arrayBuffer: arrayBuffer
            });

            userData.file.text = result.value;
        }

        else {
            alert("Unsupported file type!");
            return;
        }

        fileUploadWrapper.classList.add("file-uploaded");

    } catch (error) {

        console.error(error);
        alert("Error reading file.");
    }
});

//Cancel File Upload
fileCancelButton.addEventListener("click", () => {
    userData.file = {};
    fileUploadWrapper.classList.remove("file-uploaded");
});

//Initialize emoji picker and handle emoji selection
const picker = new EmojiMart.Picker({
   theme: "light",
   skinTonePosition: "none",
   previewPosition: "none",
   onEmojiSelect: (emoji) => {
    const { selectionStart: start, selectionEnd: end } = messageInput;
    messageInput.setRangeText(emoji.native, start, end, "end");
    messageInput.focus();
   },
   onClickOutside: (e) => {
    if(e.target.id === "emoji-picker") {
        document.body.classList.toggle("show-emoji-picker");
    } else {
        document.body.classList.remove("show-emoji-picker");
    }
   }
});

document.querySelector(".chat-form").appendChild(picker);

sendMessageButton.addEventListener("click", (e) => handleOutgoingMessage(e));
document.querySelector("#file-upload").addEventListener("click", () => fileInput.click());
chatbotToggler.addEventListener("click", () => document.body.classList.toggle("show-chatbot"));
closeChatbot.addEventListener("click", () => document.body.classList.remove("show-chatbot"));