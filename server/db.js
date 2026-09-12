import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial DB template with Users and Tokens
const defaultDb = {
  users: [],
  tokens: {},
  sessions: [],
  messages: {},
  settings: {
    provider: 'gemini',
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
    const parsed = JSON.parse(data);
    if (!parsed.users) parsed.users = [];
    if (!parsed.tokens) parsed.tokens = {};
    if (!parsed.messages) parsed.messages = {};
    if (!parsed.sessions) parsed.sessions = [];
    return parsed;
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

// Security & Password Helpers
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, hash, salt) {
  const checkHash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(checkHash, 'hex'));
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, salt, ...safe } = user;
  return safe;
}

export const db = {
  // ==========================================================================
  // User Authentication & Management
  // ==========================================================================
  createUser({ email, password, name, role }) {
    const data = readDb();
    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists
    if (data.users.some(u => u.email.toLowerCase() === cleanEmail)) {
      throw new Error('An account with this email already exists.');
    }

    // First user created automatically becomes 'admin'
    const isFirstUser = data.users.length === 0;
    const finalRole = role ? role : (isFirstUser ? 'admin' : 'user');

    const { salt, hash } = hashPassword(password);
    const userId = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const newUser = {
      id: userId,
      email: cleanEmail,
      name: (name && name.trim()) ? name.trim() : cleanEmail.split('@')[0],
      passwordHash: hash,
      salt: salt,
      role: finalRole,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString()
    };

    data.users.push(newUser);
    writeDb(data);

    return sanitizeUser(newUser);
  },

  authenticateUser(email, password) {
    const data = readDb();
    const cleanEmail = email.trim().toLowerCase();

    const user = data.users.find(u => u.email.toLowerCase() === cleanEmail);
    if (!user) {
      throw new Error('Invalid email or password.');
    }

    const isValid = verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    user.lastLoginAt = new Date().toISOString();

    // Generate session token (valid for 30 days)
    const token = 'tok_' + crypto.randomBytes(32).toString('hex');
    data.tokens[token] = {
      userId: user.id,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
    };

    writeDb(data);
    return { user: sanitizeUser(user), token };
  },

  getUserByToken(token) {
    if (!token) return null;
    const data = readDb();
    const record = data.tokens[token];

    if (!record || record.expiresAt < Date.now()) {
      if (record) {
        delete data.tokens[token];
        writeDb(data);
      }
      return null;
    }

    const user = data.users.find(u => u.id === record.userId);
    return sanitizeUser(user);
  },

  getUserById(userId) {
    const data = readDb();
    const user = data.users.find(u => u.id === userId);
    return sanitizeUser(user);
  },

  revokeToken(token) {
    const data = readDb();
    delete data.tokens[token];
    writeDb(data);
    return true;
  },

  // ==========================================================================
  // Admin Operations
  // ==========================================================================
  getAdminMetrics() {
    const data = readDb();
    const totalUsers = data.users.length;
    const totalSessions = data.sessions.length;

    let totalMessages = 0;
    let totalPrompts = 0;

    Object.values(data.messages).forEach(msgList => {
      if (Array.isArray(msgList)) {
        totalMessages += msgList.length;
        totalPrompts += msgList.filter(m => m.role === 'user').length;
      }
    });

    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const activeToday = data.users.filter(u => new Date(u.lastLoginAt).getTime() > oneDayAgo).length;

    return {
      totalUsers,
      totalSessions,
      totalMessages,
      totalPrompts,
      activeToday
    };
  },

  getAllUsersWithStats() {
    const data = readDb();

    return data.users.map(user => {
      const userSessions = data.sessions.filter(s => s.userId === user.id);
      let userMessagesCount = 0;
      let userPromptsCount = 0;

      userSessions.forEach(s => {
        const msgs = data.messages[s.id] || [];
        userMessagesCount += msgs.length;
        userPromptsCount += msgs.filter(m => m.role === 'user').length;
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        totalSessions: userSessions.length,
        totalMessages: userMessagesCount,
        totalPrompts: userPromptsCount
      };
    }).sort((a, b) => new Date(b.lastLoginAt) - new Date(a.lastLoginAt));
  },

  getUserConversationsWithMessages(userId) {
    const data = readDb();
    const user = data.users.find(u => u.id === userId);
    if (!user) return null;

    const userSessions = data.sessions
      .filter(s => s.userId === userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const conversations = userSessions.map(session => ({
      ...session,
      messages: data.messages[session.id] || []
    }));

    return {
      user: sanitizeUser(user),
      totalSessions: conversations.length,
      conversations
    };
  },

  deleteUser(userId) {
    const data = readDb();
    // Prevent deleting last admin
    const user = data.users.find(u => u.id === userId);
    if (user && user.role === 'admin') {
      const adminCount = data.users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) {
        throw new Error('Cannot delete the only administrator account.');
      }
    }

    // Delete user
    data.users = data.users.filter(u => u.id !== userId);

    // Delete user's active tokens
    for (const [t, rec] of Object.entries(data.tokens)) {
      if (rec.userId === userId) delete data.tokens[t];
    }

    // Delete user's sessions and messages
    const userSessionIds = data.sessions.filter(s => s.userId === userId).map(s => s.id);
    data.sessions = data.sessions.filter(s => s.userId !== userId);
    userSessionIds.forEach(id => delete data.messages[id]);

    writeDb(data);
    return true;
  },

  // ==========================================================================
  // Session & Message Scoping
  // ==========================================================================
  getSessions(userId = null) {
    const data = readDb();
    let sessions = data.sessions;
    if (userId) {
      sessions = sessions.filter(s => s.userId === userId || !s.userId);
    }
    return sessions.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  createSession(title = 'New Chat', systemPrompt = '', model = 'gemini-1.5-flash', provider = 'gemini', userId = null) {
    const data = readDb();
    const id = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const session = {
      id,
      userId: userId || null,
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

    const sessIdx = data.sessions.findIndex(s => s.id === sessionId);
    if (sessIdx !== -1) {
      data.sessions[sessIdx].updatedAt = new Date().toISOString();
      if (role === 'user' && (data.sessions[sessIdx].title === 'New Chat' || !data.sessions[sessIdx].title)) {
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
