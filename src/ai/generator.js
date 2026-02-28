const Groq = require('groq-sdk');
const { getAIPrompt } = require('./prompt');
const { getLiveTime } = require('../utils/time');
const { searchInternet } = require('../services/webSearch');

const AI_PRIORITY = ['groq_primary', 'groq_secondary', 'xai'];
const GROQ_COOLDOWN_MS = 5 * 60 * 1000;
let groqFailureCount = 0;
let groqDisabledUntil = 0;

function isGroqAvailable() {
    return Date.now() >= groqDisabledUntil;
}

function registerGroqFailure() {
    groqFailureCount += 1;
    if (groqFailureCount >= 3) {
        groqDisabledUntil = Date.now() + GROQ_COOLDOWN_MS;
        groqFailureCount = 0;
    }
}

function resetGroqFailures() {
    groqFailureCount = 0;
    groqDisabledUntil = 0;
}

async function callGroq(messages, apiKey) {
    if (!apiKey) {
        throw new Error('Missing GROQ API key');
    }

    const groq = new Groq({ apiKey });

    const response = await groq.chat.completions.create({
        messages,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.8,
        max_tokens: 800,
        top_p: 0.95,
        stream: false
    });

    const reply = response.choices[0]?.message?.content?.trim();
    if (!reply || reply.length === 0) {
        throw new Error('Empty Groq response');
    }
    return reply;
}

async function callXai(messages) {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
        throw new Error('Missing XAI_API_KEY');
    }

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'grok-beta',
            messages,
            temperature: 0.8,
            max_tokens: 800,
            top_p: 0.95,
            stream: false
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(data?.error?.message || 'xAI request failed');
        err.status = response.status;
        throw err;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply || reply.length === 0) {
        throw new Error('Empty xAI response');
    }
    return reply;
}

async function generateAIResponse(userId, chatJid, userMessage, senderName, personality = 'romantic', history = [], options = {}) {
    try {
        if (/time|samay|kitne baje/i.test(userMessage)) {
            return `Abhi ka live time hai: ${getLiveTime()} ⏰`;
        }

        if (/news|latest|search|kya hai|who is|what is/i.test(userMessage)) {
            try {
                return await searchInternet(userMessage);
            } catch (err) {
                console.error("Search Error:", err.message);
                return "Search service temporary issue. Please try again.";
            }
        }

        const { smartMemory, ownerName = 'Owner', isOwnerMessage = false } = options;
        const aiMode = personality || 'romantic';
        const systemPrompt = getAIPrompt(aiMode, ownerName);
        const messages = [];

        if (smartMemory) {
            const memoryLine = [
                smartMemory.summary ? `Summary: ${smartMemory.summary}` : '',
                smartMemory.relationship ? `Relationship: ${smartMemory.relationship}` : '',
                smartMemory.mood ? `Mood: ${smartMemory.mood}` : '',
                smartMemory.lastTopic ? `Last topic: ${smartMemory.lastTopic}` : ''
            ].filter(Boolean).join(' | ');
            if (memoryLine) {
                messages.push({ role: 'system', content: `Smart memory for this chat: ${memoryLine}` });
            }
        }

        if (isOwnerMessage) {
            messages.push({ role: 'system', content: 'The message is from the Owner. Be extra respectful, address them as "Sir", and be helpful.' });
        }

        // Add conversation history for context (last 8 messages)
        if (history && history.length > 0) {
            const recentHistory = history.slice(-8);
            recentHistory.forEach(msg => {
                // Format: show who said what
                messages.push({
                    role: msg.role,
                    content: msg.role === 'user' ? `${msg.senderName || 'User'}: ${msg.text}` : msg.text
                });
            });
        }

        // Add current user message
        messages.push({ 
            role: 'user', 
            content: `${senderName}: ${userMessage}`
        });

        // Primary personality system prompt
        const liveTime = getLiveTime();
        messages.unshift({
            role: "system",
            content: systemPrompt + `

Current Live Time: ${liveTime}
Always answer time-related questions using this live time.
If user asks time, respond with this time directly.
`
        });

        const groqPrimaryKey = process.env.GROQ_PRIMARY || process.env.GROQ_API_KEY;
        const groqSecondaryKey = process.env.GROQ_SECONDARY || '';
        const providers = isGroqAvailable() ? AI_PRIORITY : ['xai'];

        for (const provider of providers) {
            if (provider === 'groq_primary') {
                if (!groqPrimaryKey) continue;
                try {
                    const reply = await callGroq(messages, groqPrimaryKey);
                    resetGroqFailures();
                    return reply;
                } catch (error) {
                    registerGroqFailure();
                    console.warn('Groq primary failed - trying secondary');
                    continue;
                }
            }

            if (provider === 'groq_secondary') {
                if (!groqSecondaryKey) continue;
                try {
                    const reply = await callGroq(messages, groqSecondaryKey);
                    resetGroqFailures();
                    return reply;
                } catch (error) {
                    registerGroqFailure();
                    console.warn('Groq secondary failed - trying xAI');
                    continue;
                }
            }

            if (provider === 'xai') {
                try {
                    const reply = await callXai(messages);
                    return reply;
                } catch (error) {
                    console.error('[xAI Error]', error);
                    continue;
                }
            }
        }

        return "Iska better jawab Sir bata sakte hain.";
    } catch (error) {
        console.error('[AI Failover Error]', error);
        return "Iska better jawab Sir bata sakte hain.";
    }
}

module.exports = { AI_PRIORITY, generateAIResponse };
