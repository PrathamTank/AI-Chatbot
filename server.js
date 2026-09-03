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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP Security Headers Middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Security Middleware: Prevent static exposure of .git, backend source code, and internal config files
app.use((req, res, next) => {
    let urlPath = '';
    try {
        urlPath = decodeURIComponent(req.path);
    } catch (_) {
        return res.status(400).json({ error: 'Malformed request path' });
    }

    // Normalize path: replace backslashes and collapse multiple consecutive slashes
    const normalizedPath = urlPath.replace(/\\/g, '/').replace(/\/+/g, '/');

    // 1. Block dotfiles, hidden paths, and traversal (e.g. /.git, /.env, /..)
    if (/(?:^|\/)\.[^\/]+/i.test(normalizedPath) || normalizedPath.includes('..')) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // 2. Block direct static access to backend source files under /api/ (*.js), /middleware/, and /node_modules/
    if (
        /^\/api\/.*\.js$/i.test(normalizedPath) ||
        /^\/middleware(?:\/|$)/i.test(normalizedPath) ||
        /^\/node_modules(?:\/|$)/i.test(normalizedPath)
    ) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // 3. Block sensitive backend files in /lib/ (supabaseAdmin.js, redis.js)
    if (/^\/lib\/(?:supabaseAdmin|redis)\.js$/i.test(normalizedPath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    // 4. Block root server files, manifests, and repository documentation
    if (/^\/(?:server\.js|package(?:-lock)?\.json|vercel\.json|.*\.md)$/i.test(normalizedPath)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    next();
});

// Route handlers
import chatHandler from './api/chat.js';
import summarizeHandler from './api/summarize.js';
import transcribeHandler from './api/transcribe.js';
import createChatHandler from './api/create-chat.js';
import getChatsHandler from './api/get-chats.js';
import getChatHandler from './api/get-chat.js';
import deleteChatHandler from './api/delete-chat.js';
import renameChatHandler from './api/rename-chat.js';
import adminCheckHandler from './api/admin/check.js';
import adminUsersHandler from './api/admin/users.js';
import adminUserChatsHandler from './api/admin/user-chats.js';
import adminChatHandler from './api/admin/chat.js';

app.post('/api/chat', chatHandler);
app.post('/api/summarize', summarizeHandler);
app.post('/api/transcribe', transcribeHandler);
app.post('/api/create-chat', createChatHandler);
app.get('/api/get-chats', getChatsHandler);
app.get('/api/get-chat', getChatHandler);
app.delete('/api/delete-chat', deleteChatHandler);
app.post('/api/delete-chat', deleteChatHandler); // POST fallback for delete
app.post('/api/rename-chat', renameChatHandler);
app.all('/api/admin/check', adminCheckHandler);
app.all('/api/admin/users', adminUsersHandler);
app.all('/api/admin/user-chats', adminUserChatsHandler);
app.all('/api/admin/chat', adminChatHandler);

// Serve allowed static frontend files from the root directory with dotfiles denied
app.use(express.static(__dirname, { dotfiles: 'deny' }));

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
