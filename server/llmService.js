// Multi-provider streaming LLM service

/**
 * Streams response from Gemini API
 */
async function streamGemini({ apiKey, model, messages, systemPrompt, temperature, onChunk, onDone, onError }) {
  if (!apiKey) {
    throw new Error('Gemini API key is required. Please set it in Settings.');
  }

  const geminiModel = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

  // Format messages for Gemini API ensuring strict alternating turns
  const contents = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + m.content;
    } else {
      contents.push({
        role,
        parts: [{ text: m.content }]
      });
    }
  }

  // Gemini requires the first turn to be 'user'
  while (contents.length > 0 && contents[0].role !== 'user') {
    contents.shift();
  }

  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  const payload = {
    contents,
    generationConfig: {
      temperature: parseFloat(temperature) || 0.7
    }
  };

  if (systemPrompt && systemPrompt.trim()) {
    payload.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMessage = errorText;
    try {
      const errJson = JSON.parse(errorText);
      parsedMessage = errJson.error?.message || errorText;
    } catch {}
    throw new Error(`Gemini API error (${response.status}): ${parsedMessage}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
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
        const jsonStr = trimmed.substring(6);
        try {
          const data = JSON.parse(jsonStr);
          const candidates = data.candidates || [];
          if (candidates.length > 0) {
            const parts = candidates[0].content?.parts || [];
            for (const part of parts) {
              if (part.text) {
                onChunk(part.text);
              }
            }
          }
        } catch (e) {
          // ignore incomplete lines
        }
      }
    }
  }

  onDone();
}

/**
 * Streams response from OpenAI or any OpenAI-compatible API
 */
async function streamOpenAI({ apiKey, apiBaseUrl, model, messages, systemPrompt, temperature, onChunk, onDone, onError }) {
  if (!apiKey && !apiBaseUrl?.includes('localhost')) {
    throw new Error('OpenAI / API key is required. Please set it in Settings.');
  }

  const baseUrl = (apiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const url = `${baseUrl}/chat/completions`;

  const formattedMessages = [];
  if (systemPrompt && systemPrompt.trim()) {
    formattedMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    formattedMessages.push({
      role: m.role,
      content: m.content
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey || 'dummy-key'}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: formattedMessages,
      temperature: parseFloat(temperature) || 0.7,
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedMessage = errorText;
    try {
      const errJson = JSON.parse(errorText);
      parsedMessage = errJson.error?.message || errorText;
    } catch {}
    throw new Error(`OpenAI API error (${response.status}): ${parsedMessage}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.substring(6);
        try {
          const data = JSON.parse(jsonStr);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            onChunk(delta);
          }
        } catch (e) {
          // ignore incomplete lines
        }
      }
    }
  }

  onDone();
}

/**
 * Streams response from local Ollama instance
 */
async function streamOllama({ ollamaHost, model, messages, systemPrompt, temperature, onChunk, onDone, onError }) {
  const host = (ollamaHost || 'http://localhost:11434').replace(/\/+$/, '');
  const url = `${host}/api/chat`;

  const formattedMessages = [];
  if (systemPrompt && systemPrompt.trim()) {
    formattedMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    formattedMessages.push({
      role: m.role,
      content: m.content
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3.2',
      messages: formattedMessages,
      options: {
        temperature: parseFloat(temperature) || 0.7
      },
      stream: true
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama error (${response.status}): ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const data = JSON.parse(trimmed);
        if (data.message?.content) {
          onChunk(data.message.content);
        }
        if (data.done) {
          onDone();
          return;
        }
      } catch (e) {
        // ignore incomplete lines
      }
    }
  }

  onDone();
}

/**
 * Realistic Mock/Simulation Mode for immediate out-of-the-box testing
 */
async function streamMock({ messages, systemPrompt, onChunk, onDone }) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || 'Hello';
  const query = lastUserMsg.toLowerCase();

  let responseText = "";

  if (query.includes('hello') || query.includes('hi') || query.includes('hey')) {
    responseText = `Hello! 👋 I am your AI Chatbot assistant.

I am currently running in **Demo / Mock Simulation Mode**, ready to test out of the box!

Here are a few things you can do:
1. **Chat right away** to test real-time streaming, UI formatting, code blocks, and conversation persistence.
2. **Switch to live LLM providers**: Click the **Settings ⚙️** icon in the header to enter your **Gemini**, **OpenAI**, or **Ollama** credentials.
3. **Change Personas**: Switch between *Helpful Assistant*, *Senior Developer*, *Creative Writer*, and more!

How can I help you today?`;
  } else if (query.includes('code') || query.includes('python') || query.includes('javascript') || query.includes('function')) {
    responseText = `Here is a clean implementation example based on your request:

\`\`\`javascript
// Asynchronous stream processing example in JavaScript
async function handleStream(readableStream, onDataReceived) {
  const reader = readableStream.getReader();
  const decoder = new TextDecoder();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      onDataReceived(chunk);
    }
  } catch (err) {
    console.error("Stream processing error:", err);
    throw err;
  } finally {
    reader.releaseLock();
  }
}
\`\`\`

### Key Advantages:
- **Zero-buffering latency**: Processes chunks immediately as they arrive.
- **Resource cleanup**: Always releases reader locks via \`finally\`.
- **UTF-8 safe**: Handles multi-byte character boundaries across chunk edges seamlessly.`;
  } else if (query.includes('who are you') || query.includes('what can you do')) {
    responseText = `I am an AI Chatbot system designed for fast, real-time interactive conversations.

### Supported Features:
- ⚡ **Server-Sent Events (SSE)** for smooth token streaming.
- 💾 **Session History**: All your chats are automatically saved and persistent.
- 🎨 **Rich Markdown**: Full support for code highlighting, lists, tables, and blockquotes.
- 🔌 **Multi-Provider Architecture**:
  - **Google Gemini** (1.5 Flash & Pro)
  - **OpenAI** (GPT-4o, GPT-4o-mini, o1/o3)
  - **Local Ollama** (Llama 3, Mistral, Qwen, DeepSeek)
  - **Mock Simulator** (instant testing with zero API keys required)

Try asking me any question, or test writing some code!`;
  } else {
    responseText = `Thank you for your message!

> *"The essence of modern conversational AI is seamless streaming and intuitive interfaces."*

You asked:
**"${lastUserMsg}"**

In this simulated response, the chatbot streams back complete markdown with formatting:
- **Real-time token delivery**: Simulating natural latency (~25ms per word).
- **Persistent storage**: This message is saved in your conversation session.
- **Formatting test**:
  | Feature | Status | Provider |
  | :--- | :---: | :--- |
  | Streaming | ✅ Active | Mock Engine |
  | Code Highlighting | ✅ Enabled | Prism.js |
  | History Storage | ✅ Saved | Local DB |

To connect to live frontier models like **Gemini 1.5 Pro** or **GPT-4o**, simply open **Settings** in the top navigation bar and provide your API key.`;
  }

  // Stream word by word with realistic typing rhythm
  const words = responseText.split(' ');
  for (let i = 0; i < words.length; i++) {
    const word = words[i] + (i < words.length - 1 ? ' ' : '');
    onChunk(word);
    await new Promise(r => setTimeout(r, 20 + Math.random() * 25));
  }

  onDone();
}

/**
 * Main dispatcher function
 */
export async function streamCompletion({
  provider = 'mock',
  apiKey,
  apiBaseUrl,
  ollamaHost,
  model,
  messages,
  systemPrompt,
  temperature = 0.7,
  onChunk,
  onDone,
  onError
}) {
  try {
    switch (provider.toLowerCase()) {
      case 'gemini':
        await streamGemini({ apiKey, model, messages, systemPrompt, temperature, onChunk, onDone, onError });
        break;
      case 'openai':
        await streamOpenAI({ apiKey, apiBaseUrl, model, messages, systemPrompt, temperature, onChunk, onDone, onError });
        break;
      case 'ollama':
        await streamOllama({ ollamaHost, model, messages, systemPrompt, temperature, onChunk, onDone, onError });
        break;
      case 'mock':
      default:
        await streamMock({ messages, systemPrompt, onChunk, onDone });
        break;
    }
  } catch (err) {
    if (onError) onError(err);
    else throw err;
  }
}
