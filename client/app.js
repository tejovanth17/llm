/**
 * AetherAI — Client Application Logic
 * Supports Multi-User Auth, Session Isolation, and Admin Oversight Center
 */

// Persona Presets
const PERSONA_PROMPTS = {
  default: "You are AetherAI, a helpful, brilliant, and articulate AI assistant. Provide thoughtful, well-structured, and accurate responses.",
  coder: "You are an elite Senior Software Engineer and Architect. Provide production-ready, clean, well-commented code, highlight edge cases, and explain trade-offs clearly.",
  writer: "You are a world-class creative copywriter and content strategist. Write engaging, vivid, and polished text with impeccable tone and style.",
  concise: "You are a direct, no-nonsense technical mentor. Answer with high signal-to-noise ratio. Be brief, to-the-point, and avoid unnecessary filler."
};

// Global App State
const state = {
  currentUser: null,
  authToken: localStorage.getItem('aether_auth_token') || null,
  authMode: 'signin', // 'signin' | 'signup'
  adminUsers: [],
  inspectedUser: null,
  inspectedConversations: [],
  activeAuditSessionId: null,

  sessions: [],
  currentSessionId: null,
  currentMessages: [],
  settings: {
    provider: 'gemini',
    apiKey: '',
    apiBaseUrl: '',
    defaultModel: 'gemini-1.5-flash',
    temperature: 0.7,
    ollamaHost: 'http://localhost:11434'
  },
  currentPersona: 'default',
  customSystemPrompt: '',
  isStreaming: false,
  abortController: null,
  autoTTS: false
};

// Helper for authorized headers
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.authToken) {
    headers['Authorization'] = `Bearer ${state.authToken}`;
  }
  return headers;
}

// DOM Elements
const elements = {
  // Sidebar
  sidebar: document.getElementById('sidebar'),
  sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
  sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  sessionList: document.getElementById('sessionList'),
  searchChatsInput: document.getElementById('searchChatsInput'),
  currentSessionTitle: document.getElementById('currentSessionTitle'),
  renameSessionBtn: document.getElementById('renameSessionBtn'),
  headerModelSelector: document.getElementById('headerModelSelector'),
  ttsToggleBtn: document.getElementById('ttsToggleBtn'),
  ttsIconOff: document.getElementById('ttsIconOff'),
  ttsIconOn: document.getElementById('ttsIconOn'),
  exportMenuBtn: document.getElementById('exportMenuBtn'),
  exportDropdown: document.getElementById('exportDropdown'),
  exportMdBtn: document.getElementById('exportMdBtn'),
  exportJsonBtn: document.getElementById('exportJsonBtn'),
  clearChatBtn: document.getElementById('clearChatBtn'),
  chatViewport: document.getElementById('chatViewport'),
  welcomeContainer: document.getElementById('welcomeContainer'),
  messagesList: document.getElementById('messagesList'),
  typingIndicator: document.getElementById('typingIndicator'),
  stopControlBar: document.getElementById('stopControlBar'),
  stopGenerationBtn: document.getElementById('stopGenerationBtn'),
  chatTextarea: document.getElementById('chatTextarea'),
  sendMessageBtn: document.getElementById('sendMessageBtn'),
  charCount: document.getElementById('charCount'),
  activePersonaIndicator: document.getElementById('activePersonaIndicator'),
  personaPills: document.getElementById('personaPills'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  providerBadge: document.getElementById('providerBadge'),
  footerProviderName: document.getElementById('footerProviderName'),
  footerModelName: document.getElementById('footerModelName'),

  // User Profile & Auth
  userProfileCard: document.getElementById('userProfileCard'),
  openAuthModalBtn: document.getElementById('openAuthModalBtn'),
  userAvatar: document.getElementById('userAvatar'),
  userName: document.getElementById('userName'),
  userRoleBadge: document.getElementById('userRoleBadge'),
  adminPortalSidebarBtn: document.getElementById('adminPortalSidebarBtn'),
  adminPortalHeaderBtn: document.getElementById('adminPortalHeaderBtn'),
  logoutBtn: document.getElementById('logoutBtn'),

  // Auth Modal
  authModal: document.getElementById('authModal'),
  closeAuthBtn: document.getElementById('closeAuthBtn'),
  tabSignInBtn: document.getElementById('tabSignInBtn'),
  tabSignUpBtn: document.getElementById('tabSignUpBtn'),
  authForm: document.getElementById('authForm'),
  authModalTitle: document.getElementById('authModalTitle'),
  nameGroup: document.getElementById('nameGroup'),
  adminSecretGroup: document.getElementById('adminSecretGroup'),
  authNameInput: document.getElementById('authNameInput'),
  authEmailInput: document.getElementById('authEmailInput'),
  authPasswordInput: document.getElementById('authPasswordInput'),
  authAdminSecretInput: document.getElementById('authAdminSecretInput'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  authFeedback: document.getElementById('authFeedback'),

  // Admin Modal
  adminModal: document.getElementById('adminModal'),
  closeAdminBtn: document.getElementById('closeAdminBtn'),
  adminStatUsers: document.getElementById('adminStatUsers'),
  adminStatSessions: document.getElementById('adminStatSessions'),
  adminStatPrompts: document.getElementById('adminStatPrompts'),
  adminStatActive: document.getElementById('adminStatActive'),
  adminUsersView: document.getElementById('adminUsersView'),
  adminAuditView: document.getElementById('adminAuditView'),
  adminSearchUsersInput: document.getElementById('adminSearchUsersInput'),
  refreshAdminBtn: document.getElementById('refreshAdminBtn'),
  adminUsersTableBody: document.getElementById('adminUsersTableBody'),
  backToUsersBtn: document.getElementById('backToUsersBtn'),
  auditUserDisplayName: document.getElementById('auditUserDisplayName'),
  auditUserEmail: document.getElementById('auditUserEmail'),
  auditSessionCount: document.getElementById('auditSessionCount'),
  auditSessionsList: document.getElementById('auditSessionsList'),
  auditActiveSessionTitle: document.getElementById('auditActiveSessionTitle'),
  auditActiveSessionMeta: document.getElementById('auditActiveSessionMeta'),
  auditTranscriptMessages: document.getElementById('auditTranscriptMessages'),

  // Settings Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  cancelSettingsBtn: document.getElementById('cancelSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  modalFeedback: document.getElementById('modalFeedback'),
  providerSelect: document.getElementById('providerSelect'),
  apiKeyGroup: document.getElementById('apiKeyGroup'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleKeyVisibility: document.getElementById('toggleKeyVisibility'),
  apiBaseUrlGroup: document.getElementById('apiBaseUrlGroup'),
  apiBaseUrlInput: document.getElementById('apiBaseUrlInput'),
  ollamaHostGroup: document.getElementById('ollamaHostGroup'),
  ollamaHostInput: document.getElementById('ollamaHostInput'),
  modelInput: document.getElementById('modelInput'),
  tempRange: document.getElementById('tempRange'),
  tempVal: document.getElementById('tempVal'),
  systemPromptTemplate: document.getElementById('systemPromptTemplate'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  toastContainer: document.getElementById('toastContainer')
};

// ============================================================================
// Initialization
// ============================================================================
async function initApp() {
  setupEventListeners();
  setupMarked();
  await loadSettings();
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) {
    // Show auth modal on first load so users have personal profiles
    openAuthModal('signin');
  }
  await loadSessions();
}

function setupMarked() {
  if (window.marked) {
    window.marked.setOptions({
      breaks: true,
      gfm: true
    });
  }
}

// ============================================================================
// User Authentication System
// ============================================================================
async function checkAuth() {
  if (!state.authToken) {
    updateUserProfileUI(null);
    return false;
  }

  try {
    const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      state.currentUser = data.user;
      updateUserProfileUI(data.user);
      return true;
    } else {
      state.authToken = null;
      state.currentUser = null;
      localStorage.removeItem('aether_auth_token');
      updateUserProfileUI(null);
      return false;
    }
  } catch (err) {
    console.error('Auth verification error:', err);
    updateUserProfileUI(null);
    return false;
  }
}

function updateUserProfileUI(user) {
  if (user) {
    elements.userProfileCard.classList.remove('hidden');
    elements.openAuthModalBtn.classList.add('hidden');

    // Initials
    const initial = (user.name || user.email || 'U')[0].toUpperCase();
    elements.userAvatar.textContent = initial;
    elements.userName.textContent = user.name || user.email;
    elements.userRoleBadge.textContent = user.role.toUpperCase();

    if (user.role === 'admin') {
      elements.userRoleBadge.classList.add('admin');
      elements.adminPortalSidebarBtn.classList.remove('hidden');
      elements.adminPortalHeaderBtn.classList.remove('hidden');
    } else {
      elements.userRoleBadge.classList.remove('admin');
      elements.adminPortalSidebarBtn.classList.add('hidden');
      elements.adminPortalHeaderBtn.classList.add('hidden');
    }
  } else {
    elements.userProfileCard.classList.add('hidden');
    elements.openAuthModalBtn.classList.remove('hidden');
    elements.adminPortalSidebarBtn.classList.add('hidden');
    elements.adminPortalHeaderBtn.classList.add('hidden');
  }
}

function openAuthModal(mode = 'signin') {
  state.authMode = mode;
  setAuthTab(mode);
  elements.authFeedback.className = 'modal-status-feedback hidden';
  elements.authFeedback.textContent = '';
  elements.authModal.classList.remove('hidden');
}

function closeAuthModal() {
  elements.authModal.classList.add('hidden');
}

function setAuthTab(mode) {
  state.authMode = mode;
  if (mode === 'signin') {
    elements.tabSignInBtn.classList.add('active');
    elements.tabSignUpBtn.classList.remove('active');
    elements.authModalTitle.textContent = 'Sign in to AetherAI';
    elements.nameGroup.classList.add('hidden');
    elements.adminSecretGroup.classList.add('hidden');
    elements.authSubmitBtn.textContent = 'Sign In';
  } else {
    elements.tabSignInBtn.classList.remove('active');
    elements.tabSignUpBtn.classList.add('active');
    elements.authModalTitle.textContent = 'Create your Personal Profile';
    elements.nameGroup.classList.remove('hidden');
    elements.adminSecretGroup.classList.remove('hidden');
    elements.authSubmitBtn.textContent = 'Create Account';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = elements.authEmailInput.value.trim();
  const password = elements.authPasswordInput.value;
  const name = elements.authNameInput.value.trim();
  const adminSecret = elements.authAdminSecretInput.value.trim();

  elements.authFeedback.className = 'modal-status-feedback';
  elements.authFeedback.textContent = 'Authenticating...';
  elements.authFeedback.classList.remove('hidden');

  try {
    const endpoint = state.authMode === 'signin' ? '/api/auth/login' : '/api/auth/register';
    const payload = state.authMode === 'signin'
      ? { email, password }
      : { email, password, name, adminSecret };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    // Save token
    state.authToken = data.token;
    state.currentUser = data.user;
    localStorage.setItem('aether_auth_token', data.token);

    updateUserProfileUI(data.user);
    closeAuthModal();

    showToast(`Welcome, ${data.user.name || data.user.email}!`, 'success');

    // Reload sessions scoped to this user
    await loadSessions();
  } catch (err) {
    elements.authFeedback.className = 'modal-status-feedback error';
    elements.authFeedback.textContent = err.message;
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders()
    });
  } catch (e) {}

  state.authToken = null;
  state.currentUser = null;
  localStorage.removeItem('aether_auth_token');
  updateUserProfileUI(null);

  showToast('Logged out successfully', 'info');
  openAuthModal('signin');
  await loadSessions();
}

// ============================================================================
// Administrator Oversight Center
// ============================================================================
async function openAdminPortal() {
  if (!state.currentUser || state.currentUser.role !== 'admin') {
    showToast('Administrator privileges required.', 'error');
    return;
  }

  elements.adminModal.classList.remove('hidden');
  elements.adminUsersView.classList.remove('hidden');
  elements.adminAuditView.classList.add('hidden');

  await loadAdminData();
}

function closeAdminPortal() {
  elements.adminModal.classList.add('hidden');
}

async function loadAdminData() {
  try {
    // 1. Fetch system metrics
    const metricsRes = await fetch('/api/admin/metrics', { headers: getAuthHeaders() });
    if (metricsRes.ok) {
      const m = await metricsRes.json();
      elements.adminStatUsers.textContent = m.totalUsers || 0;
      elements.adminStatSessions.textContent = m.totalSessions || 0;
      elements.adminStatPrompts.textContent = m.totalPrompts || 0;
      elements.adminStatActive.textContent = m.activeToday || 0;
    }

    // 2. Fetch users directory
    const usersRes = await fetch('/api/admin/users', { headers: getAuthHeaders() });
    if (usersRes.ok) {
      state.adminUsers = await usersRes.json();
      renderAdminUsersTable(elements.adminSearchUsersInput.value);
    }
  } catch (err) {
    console.error('Admin data load error:', err);
    showToast('Failed to load admin metrics', 'error');
  }
}

function renderAdminUsersTable(filter = '') {
  elements.adminUsersTableBody.innerHTML = '';

  const filtered = state.adminUsers.filter(u =>
    (u.email || '').toLowerCase().includes(filter.toLowerCase()) ||
    (u.name || '').toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    elements.adminUsersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:2rem;">No user profiles match your filter.</td></tr>`;
    return;
  }

  filtered.forEach(user => {
    const tr = document.createElement('tr');

    const joinDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
    const roleBadge = `<span class="badge-role ${user.role}">${user.role}</span>`;

    tr.innerHTML = `
      <td>
        <div class="table-user-cell">
          <span class="table-user-name">${escapeHtml(user.name || 'Anonymous')}</span>
          <span class="table-user-email">${escapeHtml(user.email)}</span>
        </div>
      </td>
      <td>${roleBadge}</td>
      <td><strong>${user.totalSessions || 0}</strong> chats</td>
      <td><span style="color:#818cf8;font-weight:600;">${user.totalPrompts || 0}</span> prompts</td>
      <td style="color:var(--text-muted);font-size:0.78rem;">${joinDate}</td>
      <td>
        <div style="display:flex; gap:0.4rem;">
          <button class="table-action-btn inspect-user-btn" data-id="${user.id}" title="Inspect prompts and conversations">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>Inspect Chats</span>
          </button>
          ${user.role !== 'admin' ? `
            <button class="table-action-btn delete-btn delete-user-btn" data-id="${user.id}" title="Delete user">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>
      </td>
    `;

    // Bind inspect button
    tr.querySelector('.inspect-user-btn').addEventListener('click', () => {
      inspectUserConversations(user.id);
    });

    // Bind delete button if present
    const delBtn = tr.querySelector('.delete-user-btn');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        deleteAdminUser(user.id, user.name || user.email);
      });
    }

    elements.adminUsersTableBody.appendChild(tr);
  });
}

async function inspectUserConversations(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/chats`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to retrieve user conversation audit');

    const auditData = await res.json();
    state.inspectedUser = auditData.user;
    state.inspectedConversations = auditData.conversations || [];

    // Switch view
    elements.adminUsersView.classList.add('hidden');
    elements.adminAuditView.classList.remove('hidden');

    elements.auditUserDisplayName.textContent = auditData.user.name || 'Anonymous User';
    elements.auditUserEmail.textContent = `(${auditData.user.email})`;
    elements.auditSessionCount.textContent = state.inspectedConversations.length;

    renderAuditSessionsList();

    if (state.inspectedConversations.length > 0) {
      renderAuditTranscript(state.inspectedConversations[0].id);
    } else {
      elements.auditActiveSessionTitle.textContent = 'No conversations created yet';
      elements.auditActiveSessionMeta.textContent = '';
      elements.auditTranscriptMessages.innerHTML = `<div class="empty-transcript-hint">This individual has not started any conversations yet.</div>`;
    }
  } catch (err) {
    console.error('Inspect error:', err);
    showToast('Failed to inspect user chats', 'error');
  }
}

function renderAuditSessionsList() {
  elements.auditSessionsList.innerHTML = '';

  if (state.inspectedConversations.length === 0) {
    elements.auditSessionsList.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem;">No chats</div>`;
    return;
  }

  state.inspectedConversations.forEach((sess, idx) => {
    const item = document.createElement('div');
    item.className = `audit-session-item ${idx === 0 ? 'active' : ''}`;
    item.dataset.id = sess.id;

    const promptCount = (sess.messages || []).filter(m => m.role === 'user').length;
    item.innerHTML = `
      <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(sess.title || 'Untitled Chat')}</div>
      <div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem;">${promptCount} prompts · ${new Date(sess.updatedAt).toLocaleDateString()}</div>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.audit-session-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      renderAuditTranscript(sess.id);
    });

    elements.auditSessionsList.appendChild(item);
  });
}

function renderAuditTranscript(sessionId) {
  state.activeAuditSessionId = sessionId;
  const session = state.inspectedConversations.find(s => s.id === sessionId);
  if (!session) return;

  elements.auditActiveSessionTitle.textContent = session.title || 'Untitled Conversation';
  elements.auditActiveSessionMeta.textContent = `Model: ${session.model || 'default'} | Updated: ${new Date(session.updatedAt).toLocaleString()}`;
  elements.auditTranscriptMessages.innerHTML = '';

  const messages = session.messages || [];
  if (messages.length === 0) {
    elements.auditTranscriptMessages.innerHTML = `<div class="empty-transcript-hint">No messages in this chat.</div>`;
    return;
  }

  messages.forEach(msg => {
    const bubble = document.createElement('div');
    bubble.className = `audit-msg-bubble ${msg.role === 'user' ? 'user' : 'assistant'}`;

    const label = msg.role === 'user'
      ? `👤 User Prompt (${new Date(msg.timestamp).toLocaleTimeString()})`
      : `✨ Assistant Response (${new Date(msg.timestamp).toLocaleTimeString()})`;

    let contentHtml = msg.role === 'user'
      ? escapeHtml(msg.content)
      : (window.marked ? window.marked.parse(msg.content) : escapeHtml(msg.content));

    bubble.innerHTML = `
      <div class="audit-msg-label">${label}</div>
      <div class="markdown-body">${contentHtml}</div>
    `;

    elements.auditTranscriptMessages.appendChild(bubble);
  });
}

async function deleteAdminUser(userId, name) {
  if (!confirm(`Are you sure you want to permanently delete the profile of "${name}" and all their conversations?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to delete user');
    }

    showToast(`User profile deleted`, 'info');
    await loadAdminData();
  } catch (err) {
    console.error('Delete user error:', err);
    showToast(err.message, 'error');
  }
}

// ============================================================================
// Settings & Config
// ============================================================================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load settings');
    const data = await res.json();
    state.settings = { ...state.settings, ...data };
    updateSettingsUI();
    updateFooterBadge();
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

function updateSettingsUI() {
  const { provider, apiKey, apiBaseUrl, defaultModel, temperature, ollamaHost } = state.settings;

  elements.providerSelect.value = provider || 'gemini';
  elements.apiKeyInput.value = apiKey || '';
  elements.apiBaseUrlInput.value = apiBaseUrl || '';
  elements.ollamaHostInput.value = ollamaHost || 'http://localhost:11434';
  elements.modelInput.value = defaultModel || 'gemini-1.5-flash';
  elements.tempRange.value = temperature ?? 0.7;
  elements.tempVal.textContent = temperature ?? 0.7;

  toggleProviderFieldVisibility(elements.providerSelect.value);

  const optionVal = `${provider}:${defaultModel}`;
  const found = Array.from(elements.headerModelSelector.options).some(o => o.value === optionVal);
  if (found) {
    elements.headerModelSelector.value = optionVal;
  }
}

function updateFooterBadge() {
  const providerNames = {
    mock: 'Demo Mode',
    gemini: 'Google Gemini',
    openai: 'OpenAI GPT',
    ollama: 'Ollama Local'
  };
  elements.footerProviderName.textContent = providerNames[state.settings.provider] || state.settings.provider;
  elements.footerModelName.textContent = state.settings.defaultModel || 'Ready';
}

function toggleProviderFieldVisibility(provider) {
  const geminiLink = document.getElementById('geminiKeyLink');
  const openaiLink = document.getElementById('openaiKeyLink');
  if (geminiLink) geminiLink.classList.toggle('hidden', provider !== 'gemini');
  if (openaiLink) openaiLink.classList.toggle('hidden', provider !== 'openai');

  if (provider === 'gemini') {
    elements.apiKeyInput.value = localStorage.getItem('aether_gemini_key') || state.settings.apiKey || '';
  } else if (provider === 'openai') {
    elements.apiKeyInput.value = localStorage.getItem('aether_openai_key') || state.settings.apiKey || '';
  }

  if (provider === 'mock') {
    elements.apiKeyGroup.classList.add('hidden');
    elements.apiBaseUrlGroup.classList.add('hidden');
    elements.ollamaHostGroup.classList.add('hidden');
  } else if (provider === 'ollama') {
    elements.apiKeyGroup.classList.add('hidden');
    elements.apiBaseUrlGroup.classList.add('hidden');
    elements.ollamaHostGroup.classList.remove('hidden');
  } else if (provider === 'openai') {
    elements.apiKeyGroup.classList.remove('hidden');
    elements.apiBaseUrlGroup.classList.remove('hidden');
    elements.ollamaHostGroup.classList.add('hidden');
  } else if (provider === 'gemini') {
    elements.apiKeyGroup.classList.remove('hidden');
    elements.apiBaseUrlGroup.classList.add('hidden');
    elements.ollamaHostGroup.classList.add('hidden');
  }
}

// ============================================================================
// Sessions & Messages
// ============================================================================
async function loadSessions() {
  try {
    const res = await fetch('/api/sessions', { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to load sessions');
    state.sessions = await res.json();

    renderSessionList();

    if (state.sessions.length > 0) {
      await switchSession(state.sessions[0].id);
    } else {
      await createNewSession();
    }
  } catch (err) {
    console.error('Error loading sessions:', err);
    showToast('Failed to load sessions', 'error');
  }
}

function renderSessionList(filter = '') {
  elements.sessionList.innerHTML = '';

  const filtered = state.sessions.filter(s =>
    (s.title || 'New Chat').toLowerCase().includes(filter.toLowerCase())
  );

  if (filtered.length === 0) {
    elements.sessionList.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem;text-align:center;">No conversations found</div>`;
    return;
  }

  filtered.forEach(session => {
    const item = document.createElement('div');
    item.className = `session-item ${session.id === state.currentSessionId ? 'active' : ''}`;
    item.dataset.id = session.id;

    item.innerHTML = `
      <div class="session-item-content">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        <span class="session-item-title" title="${escapeHtml(session.title)}">${escapeHtml(session.title || 'New Chat')}</span>
      </div>
      <div class="session-actions">
        <button class="session-delete-btn" title="Delete chat" aria-label="Delete chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.closest('.session-delete-btn')) {
        e.stopPropagation();
        deleteSession(session.id);
        return;
      }
      switchSession(session.id);
      if (window.innerWidth <= 820) {
        elements.sidebar.classList.remove('open');
      }
    });

    elements.sessionList.appendChild(item);
  });
}

async function createNewSession() {
  try {
    const prompt = getActiveSystemPrompt();
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        title: 'New Chat',
        systemPrompt: prompt,
        model: state.settings.defaultModel,
        provider: state.settings.provider
      })
    });

    if (!res.ok) throw new Error('Failed to create session');
    const newSession = await res.json();
    state.sessions.unshift(newSession);
    renderSessionList();
    await switchSession(newSession.id);
  } catch (err) {
    console.error('Error creating new session:', err);
    showToast('Failed to create new session', 'error');
  }
}

async function switchSession(sessionId) {
  if (state.isStreaming) {
    showToast('Please wait or stop current generation before switching.', 'warning');
    return;
  }

  state.currentSessionId = sessionId;
  renderSessionList(elements.searchChatsInput.value);

  const activeSession = state.sessions.find(s => s.id === sessionId);
  if (activeSession) {
    elements.currentSessionTitle.textContent = activeSession.title || 'New Chat';
  }

  try {
    const res = await fetch(`/api/sessions/${sessionId}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Session not found');
    const data = await res.json();
    state.currentMessages = data.messages || [];
    renderMessages();
  } catch (err) {
    console.error('Error loading session messages:', err);
    showToast('Error loading messages', 'error');
  }
}

async function deleteSession(sessionId) {
  if (!confirm('Are you sure you want to delete this conversation?')) return;

  try {
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete');

    state.sessions = state.sessions.filter(s => s.id !== sessionId);

    if (state.currentSessionId === sessionId) {
      if (state.sessions.length > 0) {
        await switchSession(state.sessions[0].id);
      } else {
        await createNewSession();
      }
    } else {
      renderSessionList(elements.searchChatsInput.value);
    }

    showToast('Conversation deleted', 'info');
  } catch (err) {
    console.error('Error deleting session:', err);
    showToast('Failed to delete session', 'error');
  }
}

async function renameSession() {
  const currentTitle = elements.currentSessionTitle.textContent.trim();
  const newTitle = prompt('Enter a new title for this conversation:', currentTitle);
  if (!newTitle || newTitle.trim() === '' || newTitle.trim() === currentTitle) return;

  try {
    const res = await fetch(`/api/sessions/${state.currentSessionId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title: newTitle.trim() })
    });

    if (!res.ok) throw new Error('Rename failed');
    const updated = await res.json();

    elements.currentSessionTitle.textContent = updated.title;
    const item = state.sessions.find(s => s.id === state.currentSessionId);
    if (item) item.title = updated.title;
    renderSessionList(elements.searchChatsInput.value);
    showToast('Title updated', 'success');
  } catch (err) {
    console.error('Rename error:', err);
    showToast('Could not rename chat', 'error');
  }
}

// ============================================================================
// Message Rendering
// ============================================================================
function renderMessages() {
  if (!state.currentMessages || state.currentMessages.length === 0) {
    elements.welcomeContainer.classList.remove('hidden');
    elements.messagesList.classList.add('hidden');
    elements.messagesList.innerHTML = '';
    return;
  }

  elements.welcomeContainer.classList.add('hidden');
  elements.messagesList.classList.remove('hidden');
  elements.messagesList.innerHTML = '';

  state.currentMessages.forEach(msg => {
    appendMessageDOM(msg);
  });

  scrollToBottom();
}

function appendMessageDOM(msg) {
  const isUser = msg.role === 'user';
  const item = document.createElement('div');
  item.className = `message-item ${isUser ? 'user' : 'assistant'}`;
  item.dataset.id = msg.id || 'temp';

  const avatarContent = isUser
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

  const authorName = isUser ? (state.currentUser?.name || 'You') : 'AetherAI';
  const timeFormatted = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

  let bodyHtml = isUser ? escapeHtml(msg.content) : renderMarkdownWithCodeBlocks(msg.content);

  item.innerHTML = `
    <div class="message-avatar">${avatarContent}</div>
    <div class="message-body">
      <div class="message-header">
        <span class="message-author">${authorName}</span>
        <span class="message-time">${timeFormatted}</span>
      </div>
      <div class="message-content markdown-body">${bodyHtml}</div>
      <div class="message-toolbar">
        <button class="toolbar-btn copy-msg-btn" title="Copy response text">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy</span>
        </button>
        <button class="toolbar-btn speak-msg-btn" title="Read message aloud">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
          <span>Speak</span>
        </button>
      </div>
    </div>
  `;

  item.querySelector('.copy-msg-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(msg.content);
    showToast('Copied to clipboard', 'info');
  });

  item.querySelector('.speak-msg-btn').addEventListener('click', () => {
    speakText(msg.content);
  });

  enhanceCodeBlocks(item);
  elements.messagesList.appendChild(item);
  return item;
}

function renderMarkdownWithCodeBlocks(content) {
  if (!window.marked) return escapeHtml(content);
  return window.marked.parse(content || '');
}

function enhanceCodeBlocks(container) {
  const pres = container.querySelectorAll('pre');
  pres.forEach(pre => {
    if (pre.parentElement.classList.contains('code-block-container')) return;

    const code = pre.querySelector('code');
    const langClass = code ? Array.from(code.classList).find(c => c.startsWith('language-')) : null;
    const lang = langClass ? langClass.replace('language-', '') : 'code';

    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-container';

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span>${lang}</span>
      <button class="copy-code-btn" type="button">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        <span>Copy Code</span>
      </button>
    `;

    const copyBtn = header.querySelector('.copy-code-btn');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const codeText = code ? code.innerText : pre.innerText;
      navigator.clipboard.writeText(codeText);
      copyBtn.innerHTML = `<span>Copied!</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span>Copy Code</span>
        `;
      }, 1800);
    });

    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(header);
    wrapper.appendChild(pre);

    if (window.Prism && code) {
      window.Prism.highlightElement(code);
    }
  });
}

function scrollToBottom() {
  elements.chatViewport.scrollTo({
    top: elements.chatViewport.scrollHeight,
    behavior: 'smooth'
  });
}

// ============================================================================
// Sending & Streaming Messages
// ============================================================================
async function sendMessage() {
  const text = elements.chatTextarea.value.trim();
  if (!text || state.isStreaming) return;

  if (!state.currentSessionId) {
    await createNewSession();
  }

  elements.chatTextarea.value = '';
  elements.chatTextarea.style.height = 'auto';
  elements.charCount.textContent = '0 / 4000';

  elements.welcomeContainer.classList.add('hidden');
  elements.messagesList.classList.remove('hidden');

  // 1. User Message
  const userMsg = {
    id: 'user_' + Date.now(),
    role: 'user',
    content: text,
    timestamp: new Date().toISOString()
  };
  state.currentMessages.push(userMsg);
  appendMessageDOM(userMsg);
  scrollToBottom();

  // 2. Assistant Bubble
  state.isStreaming = true;
  state.abortController = new AbortController();
  elements.typingIndicator.classList.remove('hidden');
  elements.stopControlBar.classList.remove('hidden');
  elements.sendMessageBtn.disabled = true;

  const assistantMsg = {
    id: 'asst_' + Date.now(),
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString()
  };
  const assistantBubble = appendMessageDOM(assistantMsg);
  const contentEl = assistantBubble.querySelector('.message-content');

  const [activeProvider, activeModel] = elements.headerModelSelector.value.split(':');
  const systemPrompt = getActiveSystemPrompt();

  const clientKey = activeProvider === 'gemini'
    ? (localStorage.getItem('aether_gemini_key') || state.settings.apiKey || '')
    : (activeProvider === 'openai' ? (localStorage.getItem('aether_openai_key') || state.settings.apiKey || '') : '');

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: getAuthHeaders(),
      signal: state.abortController.signal,
      body: JSON.stringify({
        sessionId: state.currentSessionId,
        message: text,
        provider: activeProvider,
        model: activeModel,
        apiKey: clientKey,
        systemPrompt,
        temperature: parseFloat(state.settings.temperature) || 0.7
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Server error during stream');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          try {
            const event = JSON.parse(trimmed.substring(6));

            if (event.type === 'start') {
              elements.typingIndicator.classList.add('hidden');
            } else if (event.type === 'chunk') {
              elements.typingIndicator.classList.add('hidden');
              accumulatedText += event.text;
              assistantMsg.content = accumulatedText;
              contentEl.innerHTML = renderMarkdownWithCodeBlocks(accumulatedText);
              scrollToBottom();
            } else if (event.type === 'done') {
              assistantMsg.content = accumulatedText;
              if (event.assistantMessage) {
                assistantMsg.id = event.assistantMessage.id;
              }
            } else if (event.type === 'error') {
              throw new Error(event.error);
            }
          } catch (jsonErr) {}
        }
      }
    }

    elements.typingIndicator.classList.add('hidden');
    elements.stopControlBar.classList.add('hidden');
    state.isStreaming = false;
    elements.sendMessageBtn.disabled = false;

    enhanceCodeBlocks(assistantBubble);
    state.currentMessages.push(assistantMsg);

    await refreshSessionList();

    if (state.autoTTS && accumulatedText) {
      speakText(accumulatedText);
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      contentEl.innerHTML += '<p style="color:var(--text-muted);font-style:italic;margin-top:0.5rem;">[Generation stopped by user]</p>';
    } else {
      console.error('Chat stream error:', err);
      contentEl.innerHTML += `<p style="color:var(--error);font-weight:600;margin-top:0.5rem;">⚠️ Error: ${escapeHtml(err.message)}</p>`;
      showToast(err.message, 'error');
    }
  } finally {
    state.isStreaming = false;
    state.abortController = null;
    elements.typingIndicator.classList.add('hidden');
    elements.stopControlBar.classList.add('hidden');
    elements.sendMessageBtn.disabled = false;
    scrollToBottom();
  }
}

async function refreshSessionList() {
  try {
    const res = await fetch('/api/sessions', { headers: getAuthHeaders() });
    if (res.ok) {
      state.sessions = await res.json();
      renderSessionList(elements.searchChatsInput.value);
      const cur = state.sessions.find(s => s.id === state.currentSessionId);
      if (cur) elements.currentSessionTitle.textContent = cur.title;
    }
  } catch (e) {}
}

function stopGeneration() {
  if (state.isStreaming && state.abortController) {
    state.abortController.abort();
    state.isStreaming = false;
    elements.typingIndicator.classList.add('hidden');
    elements.stopControlBar.classList.add('hidden');
    elements.sendMessageBtn.disabled = false;
    showToast('Generation halted', 'info');
  }
}

// ============================================================================
// Personas & System Prompts
// ============================================================================
function getActiveSystemPrompt() {
  if (state.currentPersona === 'custom') {
    return state.customSystemPrompt || PERSONA_PROMPTS.default;
  }
  return PERSONA_PROMPTS[state.currentPersona] || PERSONA_PROMPTS.default;
}

function setPersona(personaKey) {
  state.currentPersona = personaKey;

  document.querySelectorAll('.persona-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.persona === personaKey);
  });

  const titles = {
    default: 'General Assistant',
    coder: 'Senior Developer',
    writer: 'Creative Copywriter',
    concise: 'Concise Mentor',
    custom: 'Custom Persona'
  };
  elements.activePersonaIndicator.textContent = `Persona: ${titles[personaKey] || 'General'}`;

  if (personaKey !== 'custom') {
    elements.systemPromptInput.value = PERSONA_PROMPTS[personaKey];
    elements.systemPromptTemplate.value = personaKey;
  }
}

// ============================================================================
// Text to Speech (TTS)
// ============================================================================
function toggleTTS() {
  state.autoTTS = !state.autoTTS;
  elements.ttsIconOff.classList.toggle('hidden', state.autoTTS);
  elements.ttsIconOn.classList.toggle('hidden', !state.autoTTS);
  showToast(state.autoTTS ? 'Auto Read-Aloud enabled' : 'Auto Read-Aloud disabled', 'info');
}

function speakText(text) {
  if (!window.speechSynthesis) {
    showToast('Speech synthesis is not supported in this browser.', 'warning');
    return;
  }
  window.speechSynthesis.cancel();
  const cleaned = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[#*_`~\[\]()]/g, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleaned.slice(0, 1000));
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ============================================================================
// Export Chat
// ============================================================================
function exportChat(format) {
  elements.exportDropdown.classList.add('hidden');
  if (!state.currentMessages || state.currentMessages.length === 0) {
    showToast('No messages to export.', 'warning');
    return;
  }

  const session = state.sessions.find(s => s.id === state.currentSessionId) || { title: 'chat' };
  const safeTitle = (session.title || 'chat').replace(/[^a-z0-9_-]/gi, '_');

  if (format === 'json') {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.currentMessages, null, 2));
    downloadFile(dataStr, `${safeTitle}.json`);
  } else {
    let md = `# ${session.title || 'Chat Conversation'}\n\n`;
    md += `*Exported on ${new Date().toLocaleString()}*\n\n---\n\n`;

    state.currentMessages.forEach(m => {
      const role = m.role === 'user' ? '👤 **You**' : '✨ **AetherAI**';
      md += `### ${role} (${new Date(m.timestamp).toLocaleTimeString()})\n\n`;
      md += `${m.content}\n\n---\n\n`;
    });

    const dataStr = "data:text/markdown;charset=utf-8," + encodeURIComponent(md);
    downloadFile(dataStr, `${safeTitle}.md`);
  }

  showToast(`Exported as .${format}`, 'success');
}

function downloadFile(dataUri, filename) {
  const a = document.createElement('a');
  a.setAttribute('href', dataUri);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ============================================================================
// Clear Current Messages
// ============================================================================
async function clearCurrentChat() {
  if (!confirm('Are you sure you want to clear messages in this chat?')) return;
  try {
    await fetch(`/api/sessions/${state.currentSessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    await createNewSession();
    showToast('Chat cleared', 'info');
  } catch (err) {
    showToast('Error clearing chat', 'error');
  }
}

// ============================================================================
// Settings Modal Actions
// ============================================================================
function openSettingsModal() {
  updateSettingsUI();
  elements.settingsModal.classList.remove('hidden');
  elements.modalFeedback.className = 'modal-status-feedback hidden';
  elements.modalFeedback.textContent = '';
}

function closeSettingsModal() {
  elements.settingsModal.classList.add('hidden');
}

async function saveSettings() {
  const updates = {
    provider: elements.providerSelect.value,
    apiKey: elements.apiKeyInput.value.trim(),
    apiBaseUrl: elements.apiBaseUrlInput.value.trim(),
    ollamaHost: elements.ollamaHostInput.value.trim(),
    defaultModel: elements.modelInput.value.trim() || 'gemini-1.5-flash',
    temperature: parseFloat(elements.tempRange.value)
  };

  try {
    if (updates.provider === 'gemini' && updates.apiKey) {
      localStorage.setItem('aether_gemini_key', updates.apiKey);
    } else if (updates.provider === 'openai' && updates.apiKey) {
      localStorage.setItem('aether_openai_key', updates.apiKey);
    }

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });

    if (!res.ok) throw new Error('Failed to save settings');
    const data = await res.json();
    state.settings = { ...state.settings, ...data.settings };
    updateFooterBadge();
    closeSettingsModal();
    showToast('Settings saved successfully', 'success');
  } catch (err) {
    console.error('Settings save error:', err);
    showToast('Failed to save settings', 'error');
  }
}

async function testConnection() {
  elements.modalFeedback.className = 'modal-status-feedback';
  elements.modalFeedback.innerHTML = 'Testing connection...';
  elements.modalFeedback.classList.remove('hidden');

  const provider = elements.providerSelect.value;
  const apiKey = elements.apiKeyInput.value.trim();
  const apiBaseUrl = elements.apiBaseUrlInput.value.trim();
  const model = elements.modelInput.value.trim();
  const ollamaHost = elements.ollamaHostInput.value.trim();

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        sessionId: state.currentSessionId || 'test_probe',
        message: 'Ping test',
        provider,
        model,
        apiKey,
        temperature: 0.5
      })
    });

    if (res.ok) {
      elements.modalFeedback.className = 'modal-status-feedback success';
      elements.modalFeedback.textContent = `✅ Successfully connected to ${provider.toUpperCase()} (${model})!`;
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Connection failed');
    }
  } catch (err) {
    elements.modalFeedback.className = 'modal-status-feedback error';
    elements.modalFeedback.textContent = `❌ Connection error: ${err.message}`;
  }
}

// ============================================================================
// Event Listeners Setup
// ============================================================================
function setupEventListeners() {
  // Mobile Sidebar Toggle
  elements.sidebarToggleBtn.addEventListener('click', () => {
    elements.sidebar.classList.toggle('open');
  });
  elements.sidebarCloseBtn.addEventListener('click', () => {
    elements.sidebar.classList.remove('open');
  });

  // Auth Modal Triggers
  elements.openAuthModalBtn.addEventListener('click', () => openAuthModal('signin'));
  elements.closeAuthBtn.addEventListener('click', closeAuthModal);
  elements.tabSignInBtn.addEventListener('click', () => setAuthTab('signin'));
  elements.tabSignUpBtn.addEventListener('click', () => setAuthTab('signup'));
  elements.authForm.addEventListener('submit', handleAuthSubmit);
  elements.logoutBtn.addEventListener('click', logout);

  // Admin Portal Triggers
  elements.adminPortalSidebarBtn.addEventListener('click', openAdminPortal);
  elements.adminPortalHeaderBtn.addEventListener('click', openAdminPortal);
  elements.closeAdminBtn.addEventListener('click', closeAdminPortal);
  elements.refreshAdminBtn.addEventListener('click', loadAdminData);
  elements.backToUsersBtn.addEventListener('click', () => {
    elements.adminAuditView.classList.add('hidden');
    elements.adminUsersView.classList.remove('hidden');
  });
  elements.adminSearchUsersInput.addEventListener('input', (e) => {
    renderAdminUsersTable(e.target.value);
  });

  // New Chat
  elements.newChatBtn.addEventListener('click', createNewSession);

  // Keyboard shortcut Ctrl+K
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      createNewSession();
    }
  });

  // Rename Session
  elements.renameSessionBtn.addEventListener('click', renameSession);
  elements.currentSessionTitle.addEventListener('click', renameSession);

  // Search chats
  elements.searchChatsInput.addEventListener('input', (e) => {
    renderSessionList(e.target.value);
  });

  // Persona Pills
  elements.personaPills.addEventListener('click', (e) => {
    const pill = e.target.closest('.persona-pill');
    if (pill) {
      setPersona(pill.dataset.persona);
    }
  });

  // Starter Cards Click
  document.querySelectorAll('.starter-card').forEach(card => {
    card.addEventListener('click', () => {
      elements.chatTextarea.value = card.dataset.prompt;
      sendMessage();
    });
  });

  // Send message button & Enter key
  elements.sendMessageBtn.addEventListener('click', sendMessage);
  elements.chatTextarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Textarea auto-height and character count
  elements.chatTextarea.addEventListener('input', () => {
    elements.chatTextarea.style.height = 'auto';
    elements.chatTextarea.style.height = Math.min(elements.chatTextarea.scrollHeight, 160) + 'px';
    elements.charCount.textContent = `${elements.chatTextarea.value.length} / 4000`;
  });

  // Stop generation
  elements.stopGenerationBtn.addEventListener('click', stopGeneration);

  // TTS Toggle
  elements.ttsToggleBtn.addEventListener('click', toggleTTS);

  // Export Menu
  elements.exportMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.exportDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    elements.exportDropdown.classList.add('hidden');
  });
  elements.exportMdBtn.addEventListener('click', () => exportChat('md'));
  elements.exportJsonBtn.addEventListener('click', () => exportChat('json'));

  // Clear Chat
  elements.clearChatBtn.addEventListener('click', clearCurrentChat);

  // Header quick model switch
  elements.headerModelSelector.addEventListener('change', (e) => {
    const [provider, model] = e.target.value.split(':');
    state.settings.provider = provider;
    state.settings.defaultModel = model;
    updateFooterBadge();
    showToast(`Active model switched to ${model}`, 'info');
  });

  // Open / Close Settings Modal
  elements.openSettingsBtn.addEventListener('click', openSettingsModal);
  elements.providerBadge.addEventListener('click', openSettingsModal);
  elements.closeSettingsBtn.addEventListener('click', closeSettingsModal);
  elements.cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  elements.saveSettingsBtn.addEventListener('click', saveSettings);
  elements.testConnectionBtn.addEventListener('click', testConnection);

  // Settings Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // If not auth tab
      if (btn.id === 'tabSignInBtn' || btn.id === 'tabSignUpBtn') return;
      document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.id !== 'tabSignInBtn' && b.id !== 'tabSignUpBtn') b.classList.remove('active');
      });
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.remove('hidden');
    });
  });

  // Provider Select in Settings
  elements.providerSelect.addEventListener('change', (e) => {
    toggleProviderFieldVisibility(e.target.value);
    if (e.target.value === 'gemini') elements.modelInput.value = 'gemini-1.5-flash';
    else if (e.target.value === 'openai') elements.modelInput.value = 'gpt-4o-mini';
    else if (e.target.value === 'ollama') elements.modelInput.value = 'llama3.2';
    else elements.modelInput.value = 'mock-llm';
  });

  // Toggle API Key visibility
  elements.toggleKeyVisibility.addEventListener('click', () => {
    const isPassword = elements.apiKeyInput.type === 'password';
    elements.apiKeyInput.type = isPassword ? 'text' : 'password';
    elements.toggleKeyVisibility.textContent = isPassword ? 'Hide' : 'Show';
  });

  // Temperature slider
  elements.tempRange.addEventListener('input', (e) => {
    elements.tempVal.textContent = e.target.value;
  });

  // Quick model chips
  document.querySelectorAll('.quick-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      elements.modelInput.value = chip.dataset.val;
    });
  });

  // Persona template selector in modal
  elements.systemPromptTemplate.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val !== 'custom' && PERSONA_PROMPTS[val]) {
      elements.systemPromptInput.value = PERSONA_PROMPTS[val];
    }
  });

  elements.systemPromptInput.addEventListener('input', (e) => {
    state.customSystemPrompt = e.target.value;
    state.currentPersona = 'custom';
    elements.systemPromptTemplate.value = 'custom';
    elements.activePersonaIndicator.textContent = 'Persona: Custom';
  });
}

// ============================================================================
// Helpers
// ============================================================================
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };

  toast.innerHTML = `<span>${iconMap[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Start application
document.addEventListener('DOMContentLoaded', initApp);
