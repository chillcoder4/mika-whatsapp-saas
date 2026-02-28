#!/bin/bash

# Joyz WhatsApp SaaS - GitHub Upload Script (Mac/Linux)
# Created for: Jaswant Sir

echo "========================================"
echo "Joyz WhatsApp SaaS - GitHub Upload"
echo "========================================"
echo ""

# Check if in git repo
if [ ! -d ".git" ]; then
    echo "Initializing git repository..."
    git init
fi

echo "Adding all files..."
git add .

echo ""
echo "Committing changes..."
git commit -m "Joyz Bot V3.0 - Multi-User SaaS:
- Firebase Auth + Realtime Database (per-user isolation)
- Multi-user WhatsApp sessions with Baileys v7
- AI failover: Groq primary/secondary + xAI (Grok) fallback
- Smart Memory + Temp Memory per chat
- Web Search via Serper.dev
- Wait/Pause timer system
- Owner bypass for ignore lists and pause
- Beautiful dashboard with signup/login/QR
- Render deployment ready"

echo ""
echo "========================================"
echo "NEXT STEP: Create GitHub Repo"
echo "========================================"
echo ""
echo "1. Go to: https://github.com/new"
echo "2. Repository name: joyz-whatsapp-saas"
echo "3. Select Public (or Private)"
echo "4. Click 'Create repository'"
echo "5. Copy repository URL"
echo "6. Run: git remote add origin [YOUR_REPO_URL]"
echo "7. Run: git push -u origin main"
echo ""