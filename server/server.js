import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db } from './db.js';
import { streamCompletion } from './llmService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ============================================================================
// Authentication Middlewares
// ============================================================================
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    req.user = db.getUserByToken(token);
    req.token = token;
  } else {
    req.user = null;
    req.token = null;
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Administrator privileges required.' });
  }
  next();
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// ============================================================================
// Authentication Routes
// ============================================================================
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, adminSecret } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const role = (adminSecret && adminSecret === ADMIN_SECRET) ? 'admin' : undefined;
    const user = db.createUser({ email, password, name, role });
    const { token } = db.authenticateUser(email, password);

    res.status(201).json({ user, token });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { user, token } = db.authenticateUser(email, password);
    res.json({ user, token });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.user });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.token) {
    db.revokeToken(req.token);
  }
  res.json({ success: true });
});

// ============================================================================
// Admin Routes (Require Administrator Role)
// ============================================================================
app.get('/api/admin/metrics', requireAdmin, (req, res) => {
  try {
    const metrics = db.getAdminMetrics();
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  try {
    const users = db.getAllUsersWithStats();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/users/:userId/chats', requireAdmin, (req, res) => {
  try {
    const userAudit = db.getUserConversationsWithMessages(req.params.userId);
    if (!userAudit) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(userAudit);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:userId', requireAdmin, (req, res) => {
  try {
    db.deleteUser(req.params.userId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// Settings endpoints
// ============================================================================
app.get('/api/settings', (req, res) => {
  const settings = db.getSettings();
  res.json({
    ...settings,
    hasApiKey: Boolean(settings.apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY),
    apiKeyMasked: settings.apiKey ? `${settings.apiKey.slice(0, 4)}...${settings.apiKey.slice(-4)}` : ''
  });
});

app.post('/api/settings', (req, res) => {
  const { provider, apiKey, apiBaseUrl, defaultModel, temperature, ollamaHost } = req.body;
  const updates = {};
  if (provider !== undefined) updates.provider = provider;
  if (apiKey !== undefined && apiKey !== '***') updates.apiKey = apiKey;
  if (apiBaseUrl !== undefined) updates.apiBaseUrl = apiBaseUrl;
  if (defaultModel !== undefined) updates.defaultModel = defaultModel;
  if (temperature !== undefined) updates.temperature = temperature;
  if (ollamaHost !== undefined) updates.ollamaHost = ollamaHost;

  const saved = db.saveSettings(updates);
  res.json({ success: true, settings: saved });
});

// ============================================================================
// Sessions endpoints (Tenant-Scoped)
// ============================================================================
app.get('/api/sessions', (req, res) => {
  const userId = req.user ? req.user.id : null;
  const sessions = db.getSessions(userId);
  res.json(sessions);
});

app.post('/api/sessions', (req, res) => {
  const { title, systemPrompt, model, provider } = req.body;
  const settings = db.getSettings();
  const userId = req.user ? req.user.id : null;

  const session = db.createSession(
    title || 'New Chat',
    systemPrompt || '',
    model || settings.defaultModel,
    provider || settings.provider,
    userId
  );
  res.status(201).json(session);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Verify access: owner or admin or guest session
  if (session.userId && req.user && session.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied to this conversation' });
  }

  const messages = db.getMessages(req.params.id);
  res.json({ session, messages });
});

app.patch('/api/sessions/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.userId && req.user && session.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const updated = db.updateSession(req.params.id, req.body);
  res.json(updated);
});

app.delete('/api/sessions/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.userId && req.user && session.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied' });
  }

  const success = db.deleteSession(req.params.id);
  res.json({ success });
});

// ============================================================================
// Chat Streaming endpoint via Server-Sent Events (SSE)
// ============================================================================
app.post('/api/chat/stream', async (req, res) => {
  const { sessionId, message, provider, model, systemPrompt, temperature, apiKey: clientApiKey } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message cannot be empty' });
  }

  let session = db.getSession(sessionId);
  if (!session) {
    const userId = req.user ? req.user.id : null;
    session = db.createSession('New Chat', '', model, provider, userId);
  }

  // Persist user message
  const userMsg = db.addMessage(sessionId, 'user', message.trim());

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Send acknowledgement event with message id
  res.write(`data: ${JSON.stringify({ type: 'start', userMessage: userMsg })}\n\n`);

  const settings = db.getSettings();
  const activeProvider = provider || session.provider || settings.provider || 'gemini';
  const activeModel = model || session.model || settings.defaultModel;
  const activeSystemPrompt = systemPrompt !== undefined ? systemPrompt : (session.systemPrompt || '');
  const activeTemp = temperature !== undefined ? temperature : (settings.temperature || 0.7);

  // Determine API key: client-provided -> server settings -> environment variables
  let apiKey = clientApiKey || settings.apiKey;
  if (!apiKey) {
    if (activeProvider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
    else if (activeProvider === 'openai') apiKey = process.env.OPENAI_API_KEY;
  }

  const history = db.getMessages(sessionId);
  const contextMessages = history.slice(-15);

  let assistantContent = '';

  try {
    await streamCompletion({
      provider: activeProvider,
      apiKey,
      apiBaseUrl: settings.apiBaseUrl,
      ollamaHost: settings.ollamaHost,
      model: activeModel,
      messages: contextMessages,
      systemPrompt: activeSystemPrompt,
      temperature: activeTemp,
      onChunk: (chunk) => {
        assistantContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`);
      },
      onDone: () => {
        const assistantMsg = db.addMessage(sessionId, 'assistant', assistantContent);
        res.write(`data: ${JSON.stringify({ type: 'done', assistantMessage: assistantMsg })}\n\n`);
        res.end();
      },
      onError: (err) => {
        console.error('LLM streaming error:', err);
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Stream processing failed' })}\n\n`);
        res.end();
      }
    });
  } catch (err) {
    console.error('Unhandled streaming error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', error: err.message || 'Streaming failed' })}\n\n`);
    res.end();
  }
});

// ============================================================================
// Serve static client assets in production
// ============================================================================
const clientDistPath = path.join(__dirname, '../client/dist');
const publicPath = path.join(__dirname, 'public');

const staticDir = fs.existsSync(publicPath)
  ? publicPath
  : (fs.existsSync(clientDistPath) ? clientDistPath : null);

if (staticDir) {
  console.log(`[Static Files] Serving frontend assets from: ${staticDir}`);
  app.use(express.static(staticDir));

  // Wildcard fallback for SPA routing
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[LLM Chatbot Server] running on http://localhost:${PORT}`);
});
