# Mika WhatsApp SaaS - Multi-User AI Bot Platform

> **Transform WhatsApp into an intelligent, multi-user AI assistant platform with Firebase authentication, per-chat memory, and advanced conversation management.**

[![Firebase](https://img.shields.io/badge/Firebase-Realtime%20DB-orange)](https://firebase.google.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.18-blue)](https://expressjs.com/)
[![Baileys](https://img.shields.io/badge/WhatsApp-Baileys%20v7-25D366)](https://github.com/WhiskeySockets/Baileys)

---

## 🚀 Features

### 🤖 Intelligent AI Responses
- Natural, conversational AI powered by **Groq LLaMA 3.3 70B**
- **AI failover chain**: Groq Primary → Groq Secondary → xAI (Grok)
- **Per-chat memory** with smart context awareness
- Three personality modes: Romantic, Casual, Professional
- Multilingual support (Hindi, English, Hinglish, and 20+ languages)

### 🔥 Multi-User SaaS Architecture
- **Firebase Authentication** (email/password via client-side SDK)
- Completely isolated per-user data
- Separate WhatsApp sessions for each user
- Independent AI settings per user

### 🧠 Smart Memory System
- **Temp Memory**: In-process, 10-minute TTL, fast context for active chats
- **Smart Memory**: Firebase-persisted summaries, relationship tracking, mood detection
- **Auto-summarization**: Periodic AI-powered conversation summaries
- Per-chat conversation history with auto-pruning

### 🌐 Web Search Integration
- Real-time internet search via **Serper.dev** API
- Auto-detects factual/search queries
- AI-powered search result summarization

### ⏸️ Wait Command System
```
@mika 5min wait  → Pauses chat for 5 minutes
@mika time over  → Resumes immediately
                 → Owner messages bypass pause
```

### 🚫 Ignore Lists
- Ignore specific private chats (phone numbers/JIDs)
- Ignore specific groups
- Owner messages bypass ignore lists
- Configurable per user via dashboard

### 📊 Beautiful Dashboard
- Signup / Login with Firebase Auth
- WhatsApp QR code scanning
- Real-time connection status via Socket.io
- AI test chat panel
- Settings management
- Smart Memory viewer
- Temp Memory viewer

---

## 📋 Prerequisites

- **Node.js** 18+
- **Firebase Project** with Realtime Database + Authentication enabled
- **Groq API Key** ([Get Free Key](https://console.groq.com/))
- **WhatsApp Account** (for each user)

---

## 🛠️ Installation

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd mika-whatsapp-saas
npm install
```

### 2. Firebase Setup

1. Create Firebase project at [console.firebase.google.com](https://console.firebase.google.com/)
2. Enable **Realtime Database** (Asia Southeast region recommended)
3. Enable **Email/Password Authentication**
4. Go to **Project Settings → Service Accounts**
5. Click **"Generate New Private Key"**
6. Download the JSON file

### 3. Environment Configuration

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Fill in your Firebase credentials from the downloaded JSON and your API keys. See `.env.example` for all available variables and documentation.

**Required variables:**
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (from service account JSON)
- `FIREBASE_DATABASE_URL` (from Firebase Console → Realtime Database)
- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID` (from Firebase Console → Project Settings)
- `GROQ_API_KEY` (from [console.groq.com](https://console.groq.com/))

**Optional variables:**
- `GROQ_PRIMARY` / `GROQ_SECONDARY` — AI failover keys
- `XAI_API_KEY` — xAI (Grok) fallback
- `SERPER_API_KEY` — Internet search ([serper.dev](https://serper.dev/))
- `PORT` — Server port (default: 3000)

### 4. Start Server
```bash
npm start
```

Dashboard will be available at: **http://localhost:3000**

For development with auto-reload:
```bash
npm run dev
```

---

## 🎯 Quick Start Guide

### First User Setup

1. **Navigate** to `http://localhost:3000`
2. Click **Sign Up**
3. **Create account** (name, email, password)
4. **Auto-redirected** to dashboard
5. Click **"Connect WhatsApp"**
6. **Scan QR code** with WhatsApp mobile app
7. **Start chatting!**

### Additional Users

Each user follows the same signup → connect flow. All data is completely isolated.

---

## 📡 API Routes

### Authentication
- `POST /api/auth/logout` — End session

### WhatsApp
- `POST /api/whatsapp/connect` — Initialize WhatsApp session
- `GET /api/whatsapp/qr` — Get QR code for scanning
- `GET /api/whatsapp/status` — Check connection status
- `POST /api/whatsapp/disconnect` — Logout from WhatsApp

### Settings
- `GET /api/settings` — Load user settings
- `POST /api/settings` — Update settings

### Ignore Lists
- `GET /api/ignore-list` — Get ignore lists
- `DELETE /api/ignore/private/:jid` — Remove from private ignore list
- `DELETE /api/ignore/group/:jid` — Remove from group ignore list

### Memory
- `GET /api/memory/smart` — List smart memory chats
- `GET /api/memory/smart/:chatJid` — Get smart memory for a chat
- `GET /api/memory/temp` — List active temp memory chats
- `GET /api/memory/temp/:chatJid` — Get temp memory for a chat

### AI Test
- `POST /api/ai-test` — Test AI response
- `GET /api/ai-test/history` — Get test chat history
- `DELETE /api/ai-test/memory` — Clear test chat memory

### Misc
- `GET /api/user/info` — Get current user info
- `GET /api/time` — Get live server time

---

## 🏗️ Project Structure

```
mika-whatsapp-saas/
├── src/
│   ├── app.js                        # Application entry point
│   ├── config.js                     # Settings loader (file-based, legacy)
│   ├── events.js                     # Bot event emitter singleton
│   ├── ai.js                         # Legacy AI module
│   ├── whatsapp.js                   # Legacy WhatsApp module
│   ├── messageHandler.js             # Legacy message handler
│   ├── memory-manager.js             # Legacy in-memory manager
│   ├── ai/
│   │   ├── generator.js              # AI response with failover chain
│   │   ├── prompt.js                 # Personality prompts
│   │   ├── smart-summary.js          # AI-powered chat summarization
│   │   └── search-summarizer.js      # Search result summarization
│   ├── dashboard/
│   │   └── server.js                 # Express + Socket.io server (main)
│   ├── memory/
│   │   ├── loader.js                 # Firebase memory loading
│   │   ├── saver.js                  # Firebase message persistence
│   │   ├── smart-memory.js           # Smart memory extraction
│   │   ├── smart-summary.js          # Periodic summary scheduler
│   │   └── temp-memory.js            # In-process TTL memory store
│   ├── middleware/
│   │   └── auth.js                   # Firebase ID token verification
│   ├── services/
│   │   ├── firebase-service.js       # Firebase Admin SDK (all DB ops)
│   │   ├── webSearch.js              # Serper.dev search integration
│   │   └── search.js                 # Legacy search wrapper
│   ├── state/
│   │   └── pause-state.js            # Wait/pause timer management
│   ├── utils/
│   │   ├── time.js                   # Live IST time helper
│   │   └── search.js                 # Legacy search wrapper
│   └── whatsapp/
│       ├── manager.js                # Per-user WhatsApp sessions
│       └── message-router.js         # Message handling & routing
├── public/
│   ├── index.html                    # Landing page
│   ├── login.html                    # Login page (Firebase Auth)
│   ├── signup.html                   # Signup page (Firebase Auth)
│   └── dashboard.html               # User dashboard
├── sessions/                         # Per-user WhatsApp auth data (gitignored)
├── .env.example                      # Environment variable template
├── .gitignore
├── package.json
├── render.yaml                       # Render deployment config
├── settings.json                     # Legacy bot settings (gitignored)
├── github-upload.bat                 # Windows git push helper
└── github-upload.sh                  # Mac/Linux git push helper
```

---

## 🎨 AI Personality Modes

### 🌸 Romantic (Default)
- Warm and friendly tone
- Natural emojis, light flirting
- Conversational and caring

### 😊 Casual
- Super laid-back and humorous
- Uses Hinglish slang naturally
- Lighthearted and fun

### 💼 Professional
- Polite and respectful
- Clear and concise
- Minimal emojis

---

## 🧠 Firebase Database Structure

```
users/
  {userId}/
    profile/
      name, email, createdAt
      isOwner, ownerUid, ownerWhatsApp
    settings/
      ai_mode, bot_on
      ignorePrivate: [], ignoreGroups: []
    memory/
      {chatJid}/
        messages/{messageId}/
          role, text, senderName, timestamp
        lastActivity
    smartMemory/
      {chatJid}/
        summary, relationship, mood, lastTopic
        lastSpeaker, importantPoints/, updatedAt
    waitTimers/
      {chatJid}/
        pausedUntil, minutes
    whatsapp/
      status, connected, lastConnected
      phoneNumber, qr, credentials
```

---

## 📝 Commands

Users can interact with the bot using these commands:

| Command | Description |
|---|---|
| `!ping` | Test bot responsiveness |
| `!stats` | Show chat statistics |
| `@mika Xmin wait` | Pause chat for X minutes (1-120) |
| `@mika time over` | Resume chat immediately |

---

## 🐛 Troubleshooting

### QR Code Not Showing
- Wait 5-10 seconds after clicking "Connect WhatsApp"
- Check browser console for errors
- Verify Firebase credentials in `.env`

### Bot Not Replying
- Ensure Groq API key is set in `.env` (`GROQ_API_KEY`)
- Check that `bot_on` is `true` in dashboard settings
- Verify chat is not in ignore list
- Check terminal logs for errors

### Authentication Issues
- Clear browser localStorage
- Verify Firebase Auth is enabled
- Check `.env` has correct service account credentials

---

## 🔐 Security Best Practices

1. **Never commit `.env`** to version control
2. **Use Firebase Database Rules** to restrict access:
   ```json
   {
     "rules": {
       "users": {
         "$uid": {
           ".read": "$uid === auth.uid",
           ".write": "$uid === auth.uid"
         }
       }
     }
   }
   ```
3. **Enable HTTPS** in production (use reverse proxy like Nginx)
4. **Rate limit API endpoints** for production
5. **Monitor Groq API usage** to avoid quota exhaustion

---

## 📦 Dependencies

| Package | Purpose |
|---|---|
| `@whiskeysockets/baileys` | WhatsApp Web API (v7) |
| `firebase-admin` | Firebase Admin SDK |
| `express` | Web server framework |
| `socket.io` | Real-time bidirectional communication |
| `groq-sdk` | Groq AI integration |
| `jsonwebtoken` | JWT authentication |
| `qrcode` / `qrcode-terminal` | QR code generation |
| `pino` | Logger (used by Baileys) |
| `dotenv` | Environment variable management |

---

## 🚀 Deployment

### Using Render
1. Push code to GitHub
2. Create new Web Service on [Render](https://render.com/)
3. Connect your repository
4. Add environment variables (see `.env.example`)
5. Deploy — `render.yaml` handles the rest

### Using Railway
```bash
railway init
railway up
```
Add environment variables in Railway dashboard.

### Using VPS (Ubuntu)
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
sudo npm install -g pm2

# Start application
pm2 start src/app.js --name mika-bot
pm2 save
pm2 startup
```

---

## 📄 License

ISC

---

## 👨‍💻 Author

**Jaswant Sir** — [@jaswant_0707](https://instagram.com/jaswant_0707)

---

## 🙏 Acknowledgments

- [Baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp Web API
- [Groq](https://groq.com/) for lightning-fast AI inference
- [Firebase](https://firebase.google.com/) for backend services
- [Serper.dev](https://serper.dev/) for search API

---

<div align="center">

**⭐ Star this repo if you find it useful! ⭐**

Made with ❤️ by Jaswant Sir

</div>