# AI Chatbot Application

A modern, feature-rich AI-powered chatbot application built with vanilla JavaScript, HTML5, and CSS3. The chatbot leverages the Groq API with Llama 3.1 model for intelligent conversations and document summarization.

## 🎯 Features

### Core Chatbot Features
- **Interactive Chat Interface**: Real-time messaging with a clean, modern UI
- **Voice Input (Speech-to-Text)**: Microphone support for hands-free messaging
- **Voice Output (Text-to-Speech)**: Listen to chatbot responses
- **Emoji Picker**: Add emojis to your messages
- **File Upload Support**: Share images and ZIP files with the chatbot
- **Background Video**: Animated video background for enhanced UI
- **Responsive Design**: Works seamlessly on desktop and mobile devices

### Advanced Features
- **Text Extraction from Images**: OCR-like functionality to extract text from image files
- **Document Summarization**: AI-powered document summarization capabilities
- **Minimizable Chat Window**: Collapsible chatbot interface with smooth animations
- **Message History**: Chat messages persist during the session
- **Real-time Response**: Instant AI responses powered by Groq API

## 📋 Project Structure

```
AI CHATBOT/
├── index.html              # Main chatbot interface
├── TextExtract.html        # Image text extraction page
├── DocSum.html             # Document summarization page
├── script1.js              # Main chatbot logic and interactions
├── script2.js              # Additional utility scripts
├── style1.css              # Main styling for chatbot
├── style2.css              # Additional styles
├── package.json            # Project dependencies
├── api/
│   ├── chat.js             # Vercel serverless function for chat
│   └── summarize.js        # Vercel serverless function for summarization
└── bg.mp4                  # Background video file
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Groq API Key (Get it from [https://console.groq.com](https://console.groq.com))
- Modern web browser with JavaScript enabled

### Installation

1. **Clone/Download the project**
   ```bash
   git clone <repository-url>
   cd AI\ CHATBOT
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the project root:
   ```
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. **Run the application**
   - For local development:
     ```bash
     npm start
     ```
   - Open `http://localhost:3000` in your browser.
     This local development server correctly executes serverless functions under `api/` and serves the frontend assets together.

### Deployment (Vercel)

1. Push your code to GitHub
2. Connect your GitHub repository to Vercel
3. Add environment variables in Vercel settings:
   - `GROQ_API_KEY`: Your Groq API key
4. Deploy

## 💻 API Endpoints

### Chat Endpoint (`/api/chat.js`)
**POST Request:**
```json
{
  "message": "Your message here"
}
```
**Response:**
```json
{
  "reply": "AI generated response"
}
```

### Summarization Endpoint (`/api/summarize.js`)
**POST Request:**
```json
{
  "prompt": "Text to summarize"
}
```
**Response:**
```json
{
  "reply": "Summarized text"
}
```

## 🛠️ Technology Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript
- **Backend**: Node.js with Vercel Serverless Functions
- **AI Model**: Groq API (Llama 3.1 8B Instant)
- **APIs & Libraries**:
  - Speech Recognition API (Web Speech API)
  - Speech Synthesis API (Text-to-Speech)
  - Fetch API for HTTP requests
  - Material Design Symbols for icons

## 📱 Usage

### Starting a Chat
1. Click the chatbot toggle button (💬)
2. Type your message or use the microphone button for voice input
3. Press Enter or click the send button
4. Listen to the response with the volume button or read it on screen

### Additional Features
- **Extract Text from Image**: Click "Extract Text from Image" button to upload images and extract text
- **Summarize Documents**: Use the document summarization feature for quick content summaries
- **Emoji Support**: Click the emoji button to add emojis to your messages
- **File Uploads**: Attach images or ZIP files (file upload handler required)

## ⚙️ Configuration

### Environment Variables
```env
GROQ_API_KEY=sk_live_your_key_here    # Required for API calls
```

### Customization
- Modify `style1.css` for UI customization
- Adjust AI model in `api/chat.js` and `api/summarize.js` (currently using `llama-3.1-8b-instant`)
- Update system prompts for different chatbot personalities

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Method not allowed" error | Ensure POST requests are being made, not GET |
| API key errors | Verify `GROQ_API_KEY` is correctly set in environment |
| Voice features not working | Check browser compatibility; ensure HTTPS for production |
| File upload not working | Implement file handling in backend API |
| Chat not responding | Check network connection and API rate limits |

## 📚 Browser Support

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

*Note: Voice features (Speech-to-Text, Text-to-Speech) require browser support for Web Speech API and Speech Synthesis API*

## 🔐 Security Considerations

- Never commit `.env` files to version control
- Keep API keys secure and rotate them regularly
- Validate and sanitize user inputs on both frontend and backend
- Use HTTPS in production
- Implement rate limiting on backend API endpoints

## 🚧 Future Enhancements

- [ ] User authentication and session management
- [ ] Chat history persistence (database integration)
- [ ] Multiple AI model selection
- [ ] Advanced file upload handling with virus scanning
- [ ] Real-time collaborative chat
- [ ] Dark mode toggle
- [ ] Multi-language support
- [ ] Performance optimization with lazy loading

## 📝 License

This project is proprietary and created as part of an internship project.

## 👤 Author

**Pratham Tank**

Created as an internship project to demonstrate AI integration and web development skills.

## 📧 Support

For questions or issues, please contact the development team or refer to the API documentation.

---

**Last Updated**: June 2026
**Version**: 1.0.0
