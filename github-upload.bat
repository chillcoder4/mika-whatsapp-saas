@echo off
REM Joyz WhatsApp AI Bot - GitHub Upload Script
REM Created for: Jaswant Sir

echo ========================================
echo Joyz Bot - GitHub Upload Script
echo ========================================
echo.

REM Check if in git repo
if not exist ".git" (
    echo Initializing git repository...
    git init
)

echo Adding all files...
git add .

echo.
echo Committing changes...
git commit -m "Joyz Bot V2.0: 
- Owner attribution system (Jaswant Sir, Instagram: @jaswant_0707)
- My-style AI responses (direct, helpful, no filler)
- Complete web dashboard with setup wizard
- No .env dependency - all via dashboard
- Render deployment ready
- Detailed deployment guides"

echo.
echo ========================================
echo NEXT STEP: Create GitHub Repo
echo ========================================
echo.
echo 1. Go to: https://github.com/new
echo 2. Repository name: joyz-whatsapp-ai-bot
echo 3. Select Public (or Private)
echo 4. Click "Create repository"
echo 5. Copy repository URL
echo 6. Run: git remote add origin [YOUR_REPO_URL]
echo 7. Run: git push -u origin main
echo.

pause