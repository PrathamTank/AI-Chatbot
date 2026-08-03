import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static frontend files from the root directory
app.use(express.static(__dirname));

// Route handlers
import chatHandler from './api/chat.js';
import summarizeHandler from './api/summarize.js';
import createChatHandler from './api/create-chat.js';
import getChatsHandler from './api/get-chats.js';
import getChatHandler from './api/get-chat.js';
import deleteChatHandler from './api/delete-chat.js';
import renameChatHandler from './api/rename-chat.js';

app.post('/api/chat', chatHandler);
app.post('/api/summarize', summarizeHandler);
app.post('/api/create-chat', createChatHandler);
app.get('/api/get-chats', getChatsHandler);
app.get('/api/get-chat', getChatHandler);
app.delete('/api/delete-chat', deleteChatHandler);
app.post('/api/delete-chat', deleteChatHandler); // POST fallback for delete
app.post('/api/rename-chat', renameChatHandler);

// Fallback to index.html for undefined routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🤖 AI Chatbot Server is successfully running!`);
    console.log(`🌐 Open http://localhost:${PORT} in your browser.`);
    console.log(`==================================================\n`);
});
