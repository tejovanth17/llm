# AetherAI — Full-Stack AI Chatbot System

A production-grade, highly aesthetic AI Chatbot web platform featuring real-time token streaming, persistent conversation sessions, persona customization, and multi-provider LLM support (Google Gemini, OpenAI, Ollama local, and Mock simulation).

![AetherAI](https://img.shields.io/badge/AetherAI-v1.0-6366f1?style=for-the-badge)
![Deployment](https://img.shields.io/badge/Deployment-Global%20Ready-10b981?style=for-the-badge)
![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ED?style=for-the-badge&logo=docker)

---

## ✨ Features

- ⚡ **Real-Time Token Streaming**: Smooth Server-Sent Events (SSE) streaming with typewriter animation and responsive auto-scroll.
- 💾 **Persistent Chat Sessions**: Conversations are automatically stored and organized in a lightweight local JSON store (`server/data/db.json`).
- 🎨 **Sleek Glassmorphic Interface**: Deep obsidian dark mode, curated electric indigo & cyan gradients, responsive drawer sidebar, fluid typography (Google Fonts Outfit & Inter).
- 🔌 **Multi-Provider LLM Engine**:
  - **Mock / Simulator Mode**: Out-of-the-box instant demo mode with natural response delays and syntax highlighting (no API key needed).
  - **Google Gemini**: Direct streaming integration with `gemini-1.5-flash` and `gemini-1.5-pro`.
  - **OpenAI & Compatible Endpoints**: Full compatibility with OpenAI (`gpt-4o`, `gpt-4o-mini`), Groq, Together AI, DeepSeek, or LocalAI via custom Base URL.
  - **Ollama**: Connect directly to local models (`llama3.2`, `mistral`, `deepseek-r1`, `qwen`) running on `http://localhost:11434`.
- 🎭 **Persona Modes**: Quickly switch between system prompt presets (*General Assistant*, *Senior Developer*, *Creative Copywriter*, *Concise Mentor*).
- 💻 **Syntax-Highlighted Code Blocks**: Prism.js syntax coloring with 1-click **Copy Code** buttons.
- 🔊 **Text-to-Speech (TTS)**: Built-in voice readout with clean markdown-to-speech stripping.
- 📥 **Export Conversations**: Export chats instantly to formatted **Markdown (.md)** or structured **JSON (.json)**.

---

## 🌍 Global Deployment Guide

The application is architected to run as a **single unified production service**: the backend Express server serves the compiled Vite frontend bundle along with all `/api` endpoints on one public port, eliminating all CORS issues and complex reverse proxies.

### Option 1: Render.com (Recommended — 1-Click Zero DevOps)
Render can build and run the Docker container directly from your GitHub repository for free or low-cost:
1. Push your project to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of AetherAI Chatbot"
   git remote add origin https://github.com/YOUR_USERNAME/aether-ai-chatbot.git
   git push -u origin main
   ```
2. Log in to [Render.com](https://render.com) and click **New +** -> **Blueprint**.
3. Connect your GitHub repository. Render will automatically detect [`render.yaml`](render.yaml) and configure:
   - Docker build from [`Dockerfile`](Dockerfile)
   - Persistent disk (`/app/server/data`) for conversation history
   - Global HTTPS URL (e.g. `https://aether-ai-chatbot.onrender.com`)
4. Add your `GEMINI_API_KEY` or `OPENAI_API_KEY` in the Render dashboard environment settings.

---

### Option 2: Railway.app
1. Go to [Railway.app](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo**.
3. Railway automatically detects the [`Dockerfile`](Dockerfile), compiles the client, and exposes the app.
4. Go to **Settings** -> **Generate Domain** to get your live global URL with free SSL.
5. Add a Persistent Volume mounted at `/app/server/data` to retain chat history across deploys.

---

### Option 3: Fly.io (Global Edge Hosting)
Deploy to Fly.io's global network in seconds:
1. Install Fly CLI (`curl -L https://fly.io/install.sh | sh` or `brew install flyctl`).
2. Run:
   ```bash
   fly launch
   ```
   *(Fly.io will automatically use [`fly.toml`](fly.toml) and provision a persistent volume for your database)*
3. Deploy updates with:
   ```bash
   fly deploy
   ```

---

### Option 4: Deploy on any Cloud VPS (DigitalOcean / AWS / Hetzner / Linode)
On your cloud Linux server with Docker and Docker Compose installed:
1. Clone the repository and run:
   ```bash
   docker compose up -d --build
   ```
2. The application will be live at `http://YOUR_SERVER_IP:8080`.
3. To attach a custom domain and SSL, point your domain's DNS `A` record to your server IP, and set up Nginx with Let's Encrypt Certbot:
   ```nginx
   server {
       server_name chat.yourdomain.com;
       location / {
           proxy_pass http://127.0.0.1:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
           proxy_buffering off; # Critical for Server-Sent Events (SSE) streaming!
       }
   }
   ```

---

## 🛠️ Local Development & Testing

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Development Mode (Hot Reloading)
```bash
npm run dev
```
- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend API: [http://localhost:5000](http://localhost:5000)

### 3. Production Build & Run Locally
```bash
# Build the Vite frontend to client/dist
npm run build

# Start the unified production server
npm start
```
Open [http://localhost:5000](http://localhost:5000) to view the unified production build.

---

## 📁 Repository Structure

```
llm/
├── Dockerfile                # Production multi-stage Docker build
├── .dockerignore             # Excluded files from Docker build context
├── docker-compose.yml        # Orchestration with persistent volume storage
├── render.yaml               # 1-click Render blueprint specification
├── fly.toml                  # Fly.io global edge configuration
├── .github/workflows/deploy.yml # Automated CI/CD test & build pipeline
├── package.json              # Root project scripts (build, dev, start)
├── README.md                 # Complete documentation
├── server/                   # Backend Express service
│   ├── package.json
│   ├── server.js             # REST API, SSE streaming & static asset serving
│   ├── llmService.js         # Multi-provider LLM stream engine (Gemini, OpenAI, Ollama, Mock)
│   ├── db.js                 # JSON file persistence layer for sessions & settings
│   └── data/                 # Generated storage directory (db.json)
└── client/                   # Frontend Web App
    ├── package.json
    ├── vite.config.js        # Vite build & proxy config
    ├── index.html            # UI layout & modal
    ├── style.css             # Vanilla CSS design system
    └── app.js                # Client logic, SSE reader, Markdown parser, TTS
```
