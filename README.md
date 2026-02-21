# Joyz WhatsApp Assistant (SaaS)

Multi-user WhatsApp AI SaaS bot with Firebase auth, per-chat memory, and dashboard controls.

## GitHub Setup Steps
1. Ensure `.env` is not committed and `sessions/` is ignored.
2. Commit `package.json`, `package-lock.json` (if present), `render.yaml`, and `README.md`.
3. Push to GitHub.

## Render Deployment Steps
1. Create a new **Web Service** on Render.
2. Connect your GitHub repository.
3. Set build command: `npm install`
4. Set start command: `npm start`
5. Add environment variables (see **ENV Variables Guide** below).
6. Attach a persistent disk mounted at `/app/sessions` for WhatsApp session restore.

## ENV Variables Guide
Required for production:
- `PORT`
- `GROQ_PRIMARY`
- `GROQ_SECONDARY`
- `XAI_API_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `SEARCH_API_KEY`
- `SEARCH_ENGINE_ID`

Notes:
- `FIREBASE_PRIVATE_KEY` must include line breaks. In `.env` use `\n` and it will be converted at runtime.
- Search API reads `SEARCH_API_KEY` and `SEARCH_ENGINE_ID` (with fallback to `GOOGLE_API_KEY` / `GOOGLE_CX` for local compatibility).

## Firebase Realtime DB Rules
Recommended strict per-user isolation:
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

## WhatsApp Session Restore Guide
- Sessions are stored in `sessions/{userId}`.
- On server boot, all session folders under `sessions/` are scanned and restored.
- `sessions/` is ignored by Git and should live on a persistent disk in Render.

## AI Mode Description
- `romantic`: warm and caring responses
- `casual`: friendly, relaxed tone
- `professional`: formal and concise tone

## Ignore List Feature
- Ignore specific private chats or groups per user from the dashboard.
- Stored in Firebase under user settings.

## Owner Control System
- Owner WhatsApp is captured on successful session connect.
- Owner messages bypass pause/ignore rules and receive priority handling.

## Project Structure (Key Files)
- `src/app.js`: boot + server start
- `src/dashboard/server.js`: dashboard + API
- `src/whatsapp/manager.js`: session manager + restore
- `src/whatsapp/message-router.js`: message routing
- `src/ai/generator.js`: AI response generation
- `src/services/firebase-service.js`: Firebase Admin

## Production Readiness Notes
- Use Node.js 18.x (Render engines configured).
- Ensure Groq or xAI keys are set for AI responses.
- Ensure search keys are set for Google Custom Search.
- Use persistent storage for WhatsApp sessions.
