/**
 * AetherAI — Client Application Logic
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
  sessions: [],
  currentSessionId: null,
  currentMessages: [],
  settings: {
    provider: 'mock',
    apiKey: '',
    apiBaseUrl: '',
    defaultModel: 'mock-llm',
    temperature: 0.7,
    ollamaHost: 'http://localhost:11434'
  },
  currentPersona: 'default',
  customSystemPrompt: '',
  isStreaming: false,
  abortController: null,
  autoTTS: false
};

// DOM Elements
const elements = {
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
// Settings & Config
// ============================================================================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error('Failed to load settings');
    const data = await res.json();
    state.settings = { ...state.settings, ...data };
    updateSettingsUI();
    updateFooterBadge();
  } catch (err) {
    console.error('Error loading settings:', err);
    showToast('Failed to load settings from server', 'error');
  }
}

function updateSettingsUI() {
  const { provider, apiKey, apiBaseUrl, defaultModel, temperature, ollamaHost } = state.settings;

  elements.providerSelect.value = provider || 'mock';
  elements.apiKeyInput.value = apiKey || '';
  elements.apiBaseUrlInput.value = apiBaseUrl || '';
  elements.ollamaHostInput.value = ollamaHost || 'http://localhost:11434';
  elements.modelInput.value = defaultModel || 'gemini-1.5-flash';
  elements.tempRange.value = temperature ?? 0.7;
  elements.tempVal.textContent = temperature ?? 0.7;

  // Toggle input visibility based on provider
  toggleProviderFieldVisibility(elements.providerSelect.value);

  // Sync header model selector
  const optionVal = `${provider}:${defaultModel}`;
  const found = Array.from(elements.headerModelSelector.options).some(o => o.value === optionVal);
  if (found) {
    elements.headerModelSelector.value = optionVal;
  }
}

function updateFooterBadge() {
  const providerNames = {
    mock: 'Mock Simulator',
    gemini: 'Google Gemini',
    openai: 'OpenAI / Compat',
    ollama: 'Ollama Local'
  };
  elements.footerProviderName.textContent = providerNames[state.settings.provider] || state.settings.provider;
  elements.footerModelName.textContent = state.settings.defaultModel || 'Ready';
}

function toggleProviderFieldVisibility(provider) {
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
    const res = await fetch('/api/sessions');
    if (!res.ok) throw new Error('Failed to load sessions');
    state.sessions = await res.json();

    renderSessionList();

    if (state.sessions.length > 0) {
      // Pick first session by default
      await switchSession(state.sessions[0].id);
    } else {
      // Create an initial session
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
    elements.sessionList.innerHTML = `<div style="color:var(--text-muted);font-size:0.8rem;padding:0.5rem;text-align:center;">No chats found</div>`;
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

    // Click on session to switch
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
      headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`/api/sessions/${sessionId}`);
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
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
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
      headers: { 'Content-Type': 'application/json' },
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

function appendMessageDOM(msg, isStreaming = false) {
  const isUser = msg.role === 'user';
  const item = document.createElement('div');
  item.className = `message-item ${isUser ? 'user' : 'assistant'}`;
  item.dataset.id = msg.id || 'temp';

  const avatarContent = isUser
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;

  const authorName = isUser ? 'You' : 'AetherAI';
  const timeFormatted = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now';

  let bodyHtml = '';
  if (isUser) {
    bodyHtml = escapeHtml(msg.content);
  } else {
    bodyHtml = renderMarkdownWithCodeBlocks(msg.content);
  }

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

  // Bind toolbar actions
  const copyBtn = item.querySelector('.copy-msg-btn');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(msg.content);
    showToast('Message copied to clipboard', 'info');
  });

  const speakBtn = item.querySelector('.speak-msg-btn');
  speakBtn.addEventListener('click', () => {
    speakText(msg.content);
  });

  // Code copy buttons & syntax highlighting
  enhanceCodeBlocks(item);

  elements.messagesList.appendChild(item);
  return item;
}

function renderMarkdownWithCodeBlocks(content) {
  if (!window.marked) {
    return escapeHtml(content);
  }
  return window.marked.parse(content || '');
}

function enhanceCodeBlocks(container) {
  const pres = container.querySelectorAll('pre');
  pres.forEach(pre => {
    // If already wrapped, skip
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

  // Clear input
  elements.chatTextarea.value = '';
  elements.chatTextarea.style.height = 'auto';
  elements.charCount.textContent = '0 / 4000';

  // Make sure welcome is hidden
  elements.welcomeContainer.classList.add('hidden');
  elements.messagesList.classList.remove('hidden');

  // 1. Append User Message
  const userMsg = {
    id: 'user_' + Date.now(),
    role: 'user',
    content: text,
    timestamp: new Date().toISOString()
  };
  state.currentMessages.push(userMsg);
  appendMessageDOM(userMsg);
  scrollToBottom();

  // 2. Prepare Assistant Bubble
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
  const assistantBubble = appendMessageDOM(assistantMsg, true);
  const contentEl = assistantBubble.querySelector('.message-content');

  // Determine provider & model
  const [activeProvider, activeModel] = elements.headerModelSelector.value.split(':');
  const systemPrompt = getActiveSystemPrompt();

  try {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: state.abortController.signal,
      body: JSON.stringify({
        sessionId: state.currentSessionId,
        message: text,
        provider: activeProvider,
        model: activeModel,
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
          } catch (jsonErr) {
            // Ignore partial SSE lines
          }
        }
      }
    }

    // Finished streaming
    elements.typingIndicator.classList.add('hidden');
    elements.stopControlBar.classList.add('hidden');
    state.isStreaming = false;
    elements.sendMessageBtn.disabled = false;

    // Enhance code blocks and syntax highlighting
    enhanceCodeBlocks(assistantBubble);
    state.currentMessages.push(assistantMsg);

    // Refresh session title in sidebar
    await refreshSessionList();

    // Text to Speech if enabled
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
    const res = await fetch('/api/sessions');
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

  // Update pills UI
  document.querySelectorAll('.persona-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.persona === personaKey);
  });

  // Update footer indicator
  const titles = {
    default: 'General Assistant',
    coder: 'Senior Developer',
    writer: 'Creative Copywriter',
    concise: 'Concise Mentor',
    custom: 'Custom Persona'
  };
  elements.activePersonaIndicator.textContent = `Persona: ${titles[personaKey] || 'General'}`;

  // Update modal system prompt input
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
  window.speechSynthesis.cancel(); // cancel any active utterance
  // Strip markdown tags and code snippets for clean speech
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
    // Markdown format
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

  showToast(`Conversation exported as .${format}`, 'success');
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
  // Re-create or reset current session
  try {
    await fetch(`/api/sessions/${state.currentSessionId}`, { method: 'DELETE' });
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
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  if (provider === 'mock') {
    elements.modalFeedback.className = 'modal-status-feedback success';
    elements.modalFeedback.textContent = '✅ Mock Simulator is ready and active immediately!';
    return;
  }

  if (provider === 'gemini' && !apiKey) {
    elements.modalFeedback.className = 'modal-status-feedback error';
    elements.modalFeedback.textContent = '⚠️ Gemini API Key is required. Please paste your key.';
    return;
  }

  if (provider === 'openai' && !apiKey && !apiBaseUrl.includes('localhost')) {
    elements.modalFeedback.className = 'modal-status-feedback error';
    elements.modalFeedback.textContent = '⚠️ OpenAI API Key is required.';
    return;
  }

  try {
    // Quick probe request
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: state.currentSessionId || 'test_probe',
        message: 'Ping test',
        provider,
        model,
        temperature: 0.5
      })
    });

    if (res.ok) {
      elements.modalFeedback.className = 'modal-status-feedback success';
      elements.modalFeedback.textContent = `✅ Successfully connected to ${provider.toUpperCase()}!`;
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

  // New Chat
  elements.newChatBtn.addEventListener('click', createNewSession);

  // Keyboard shortcut Ctrl+K or Ctrl+N for new chat
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
    showToast(`Switched model to ${model}`, 'info');
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
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
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

  // System prompt change
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

// Run app
document.addEventListener('DOMContentLoaded', initApp);
