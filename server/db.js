import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB template
const defaultDb = {
  sessions: [],
  messages: {},
  settings: {
    provider: 'mock', // 'gemini' | 'openai' | 'ollama' | 'mock'
    apiKey: '',
    apiBaseUrl: '',
    defaultModel: 'gemini-1.5-flash',
    temperature: 0.7,
    ollamaHost: 'http://localhost:11434'
  }
};

function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf-8');
      return JSON.parse(JSON.stringify(defaultDb));
    }
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return JSON.parse(JSON.stringify(defaultDb));
  }
}

function writeDb(data) {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.error('Error writing db.json:', err);
  }
}

export const db = {
  getSessions() {
    const data = readDb();
    return data.sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  createSession(title = 'New Chat', systemPrompt = '', model = 'mock-llm', provider = 'mock') {
    const data = readDb();
    const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const session = {
      id,
      title,
      systemPrompt,
      model,
      provider,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.sessions.unshift(session);
    data.messages[id] = [];
    writeDb(data);
    return session;
  },

  getSession(id) {
    const data = readDb();
    return data.sessions.find(s => s.id === id) || null;
  },

  updateSession(id, updates) {
    const data = readDb();
    const idx = data.sessions.findIndex(s => s.id === id);
    if (idx !== -1) {
      data.sessions[idx] = {
        ...data.sessions[idx],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      writeDb(data);
      return data.sessions[idx];
    }
    return null;
  },

  deleteSession(id) {
    const data = readDb();
    data.sessions = data.sessions.filter(s => s.id !== id);
    delete data.messages[id];
    writeDb(data);
    return true;
  },

  getMessages(sessionId) {
    const data = readDb();
    return data.messages[sessionId] || [];
  },

  addMessage(sessionId, role, content) {
    const data = readDb();
    if (!data.messages[sessionId]) {
      data.messages[sessionId] = [];
    }
    const message = {
      id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      sessionId,
      role,
      content,
      timestamp: new Date().toISOString()
    };
    data.messages[sessionId].push(message);

    // Update session timestamp and title if first user message
    const sessIdx = data.sessions.findIndex(s => s.id === sessionId);
    if (sessIdx !== -1) {
      data.sessions[sessIdx].updatedAt = new Date().toISOString();
      if (role === 'user' && (data.sessions[sessIdx].title === 'New Chat' || !data.sessions[sessIdx].title)) {
        // Auto-title session based on first message
        data.sessions[sessIdx].title = content.slice(0, 36) + (content.length > 36 ? '...' : '');
      }
    }

    writeDb(data);
    return message;
  },

  getSettings() {
    const data = readDb();
    return data.settings || defaultDb.settings;
  },

  saveSettings(newSettings) {
    const data = readDb();
    data.settings = { ...data.settings, ...newSettings };
    writeDb(data);
    return data.settings;
  }
};
