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

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Settings endpoints
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

// Sessions endpoints
app.get('/api/sessions', (req, res) => {
  const sessions = db.getSessions();
  res.json(sessions);
});

app.post('/api/sessions', (req, res) => {
  const { title, systemPrompt, model, provider } = req.body;
  const settings = db.getSettings();
  const session = db.createSession(
    title || 'New Chat',
    systemPrompt || '',
    model || settings.defaultModel,
    provider || settings.provider
  );
  res.status(201).json(session);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = db.getSession(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  const messages = db.getMessages(req.params.id);
  res.json({ session, messages });
});

app.patch('/api/sessions/:id', (req, res) => {
  const updated = db.updateSession(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(updated);
});

app.delete('/api/sessions/:id', (req, res) => {
  const success = db.deleteSession(req.params.id);
  res.json({ success });
});

// Chat Streaming endpoint via Server-Sent Events (SSE)
app.post('/api/chat/stream', async (req, res) => {
  const { sessionId, message, provider, model, systemPrompt, temperature } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message cannot be empty' });
  }

  let session = db.getSession(sessionId);
  if (!session) {
    session = db.createSession('New Chat');
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
  const activeProvider = provider || session.provider || settings.provider || 'mock';
  const activeModel = model || session.model || settings.defaultModel;
  const activeSystemPrompt = systemPrompt !== undefined ? systemPrompt : (session.systemPrompt || '');
  const activeTemp = temperature !== undefined ? temperature : (settings.temperature || 0.7);

  // Determine API key
  let apiKey = settings.apiKey;
  if (!apiKey) {
    if (activeProvider === 'gemini') apiKey = process.env.GEMINI_API_KEY;
    else if (activeProvider === 'openai') apiKey = process.env.OPENAI_API_KEY;
  }

  const history = db.getMessages(sessionId);
  // Exclude current pending assistant turn from history
  const contextMessages = history.slice(-15); // keep last 15 messages for context window

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
        // Save assistant message to db
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

// Serve static client assets in production
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

