#!/bin/bash

# Mika WhatsApp SaaS - GitHub Upload Script (Mac/Linux)
# Created for: Jaswant Sir

echo "========================================"
echo "Mika WhatsApp SaaS - GitHub Upload"
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
git commit -m "Mika Bot V3.1 - Multi-User SaaS AI:
- Firebase Auth + Realtime Database (per-user isolation)
- Multi-user WhatsApp sessions with Baileys v7
- Super AI failover: 5-Key Groq LLaMa-3 Chain
- Context-Aware Internet Search via Native Tool Calling
- Double Serper API failover
- Persistent Explicit Vibe tracking in Smart Memory
- Advanced Human-like conversational logic
- Beautiful dashboard with signup/login/QR
- Render deployment ready"

echo ""
echo "========================================"
echo "NEXT STEP: Create GitHub Repo"
echo "========================================"
echo ""
echo "1. Go to: https://github.com/new"
echo "2. Repository name: mika-whatsapp-saas"
echo "3. Select Public (or Private)"
echo "4. Click 'Create repository'"
echo "5. Copy repository URL"
echo "6. Run: git remote add origin [YOUR_REPO_URL]"
echo "7. Run: git push -u origin main"
echo ""