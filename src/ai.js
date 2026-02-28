const Groq = require('groq-sdk');
const { getAIPrompt } = require('./ai/prompt');
const { searchInternet, needsWebSearch } = require('./services/webSearch');

async function getAIResponse(jid, senderName, userMessage, aiMode, chatHistory = [], options = {}) {
    try {
        const { loadSettings } = require('./config');
        const settings = loadSettings();
        const { getUserSettings, getUserProfile } = require('./services/firebase-service');

        const apiKey = settings.groq_api_key;
        if (!apiKey) {
            console.error('[Groq] No API Key found');
            return 'Please add Groq API key in settings (dashboard)';
        }

        const userId = options.userId || settings.firebase_user_id || process.env.FIREBASE_USER_ID || '';
        let firebaseSettings = null;
        let firebaseProfile = null;
        if (userId) {
            firebaseSettings = await getUserSettings(userId);
            firebaseProfile = await getUserProfile(userId);
        }

        const groq = new Groq({ apiKey });

        const resolvedMode = firebaseSettings?.ai_mode || aiMode || 'casual';
        const resolvedOwnerName = firebaseProfile?.name || options.ownerName || 'Sir';
        let systemPrompt = getAIPrompt(resolvedMode, resolvedOwnerName);

        // === Web Search Integration (Serper.dev) ===
        if (needsWebSearch(userMessage)) {
            try {
                console.log(`[WebSearch] Searching for: "${userMessage}"`);
                const webData = await searchInternet(userMessage);
                if (webData && !webData.includes('unavailable') && !webData.includes('No internet')) {
                    systemPrompt += `\n\n[LIVE INTERNET DATA - Use this to answer the user's question accurately]\n${webData}`;
                    console.log('[WebSearch] Data appended to system prompt');
                }
            } catch (searchErr) {
                console.error('[WebSearch] Search failed, proceeding without web data:', searchErr.message);
            }
        }

        // Build messages array strictly for Llama 3 API
        let messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add chat history (limit to prevent token overflow)
        if (chatHistory && chatHistory.length > 0) {
            // Add last 8 messages for context (User requested 8)
            const recentHistory = chatHistory.slice(-8);
            recentHistory.forEach(msg => {
                // Map 'assistant' or 'user' roles correctly
                // If stored role is neither, default to 'user' or handle gracefully
                let role = (msg.role === 'assistant' || msg.role === 'system') ? msg.role : 'user';
                
                // For user messages, we can include the sender name in content if needed,
                // but standard role 'user' is safer for model understanding.
                // We'll prepend name only for user messages to help AI distinguish context in groups
                const content = role === 'user'
                    ? `[${msg.senderName || 'User'}]: ${msg.text}`
                    : msg.text;

                messages.push({ role, content });
            });
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: `[${senderName}]: ${userMessage}`
        });

        // Generate response
        const response = await groq.chat.completions.create({
            messages,
            model: 'llama-3.3-70b-versatile', // UPDATED to latest supported model
            temperature: 0.7,
            max_tokens: 1000,
            top_p: 1,
            stream: false
        });

        const reply = response.choices[0]?.message?.content?.trim();
        return reply || "Sorry, I couldn't understand that.";

    } catch (error) {
        console.error('[Groq AI Error]', error);

        // Fallback response
        if (error.message?.includes('API key')) {
            return 'Please check your Groq API key in settings.';
        }
        if (error.message?.includes('rate limit')) {
            return 'API rate limit reached. Try again in a few seconds.';
        }

        // Return a safe fallback that doesn't look like an error to the user
        return 'Iska better jawab Sir bata sakte hain.'; // User requested fallback
    }
}

module.exports = { getAIResponse };
