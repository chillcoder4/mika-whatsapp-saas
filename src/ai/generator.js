const Groq = require('groq-sdk');
const { getAIPrompt } = require('./prompt');
const { getLiveTime } = require('../utils/time');
const { searchInternet, needsWebSearch } = require('../services/webSearch');

const AI_PRIORITY = ['groq_1', 'groq_2', 'groq_3', 'groq_4', 'groq_5'];
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

    const tools = [
        {
            type: "function",
            function: {
                name: "search_internet",
                description: "Search the internet for real-time information, news, current events, live scores, gold/crypto prices, or actual facts ONLY. DO NOT use this tool for casual conversation, greetings, opinion questions, or general chatting like 'kya bol rahi ho', 'kaise ho', 'tum kaun ho'. ONLY use if you need live factual data from the internet to answer the specific question.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The targeted search query, perfectly derived from the user's latest message or previous chat context (e.g., 'MS Dhoni jersey number change reason')."
                        }
                    },
                    required: ["query"]
                }
            }
        }
    ];

    let response;
    try {
        response = await groq.chat.completions.create({
            messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.2, // Low temp for strict JSON tool calling to prevent 400 errors
            max_tokens: 800,
            top_p: 0.95,
            stream: false,
            tools: tools,
            tool_choice: "auto"
        });
    } catch (err) {
        // If it's a formatting error from Llama-3 hallucinating <function> tags instead of JSON, 
        // we DO NOT want to burn through our 5 API keys falling over. We recover locally.
        const errMsg = err.message || "";
        if (err.status === 400 || errMsg.includes('400') || errMsg.includes('tool_use_failed')) {
            console.warn(`[Groq Tool Error] Recovering locally from 400 formatting error without tool usage.`);
            response = await groq.chat.completions.create({
                messages,
                model: 'llama-3.3-70b-versatile',
                temperature: 0.8,
                max_tokens: 800,
                top_p: 0.95,
                stream: false
            });
        } else {
            throw err; // Real API limits/auth error (429, 401), throw it upstream to trigger next API key
        }
    }

    const choice = response.choices[0];
    const message = choice?.message;

    if (!message) {
        throw new Error('Empty Groq response');
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message);
        
        for (const toolCall of message.tool_calls) {
            if (toolCall.function.name === 'search_internet') {
                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log(`[Agentic Search] AI decided to search: ${args.query}`);
                    const { searchInternet } = require('../services/webSearch');
                    const searchResult = await searchInternet(args.query);
                    
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: searchResult
                    });
                } catch (err) {
                    console.error('[Agentic Search] Tool execution failed', err);
                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: "Search failed due to an error."
                    });
                }
            }
        }

        messages.push({
            role: "system",
            content: "You just received raw data from an internet search. DO NOT copy-paste this data. Analyze the user's original question, analyze the data, and provide a 100% natural, conversational, human-like summary in your own words. Keep it short. Do NOT say 'according to the internet' or 'search results show'."
        });

        const secondResponse = await groq.chat.completions.create({
            messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
            max_tokens: 800,
            top_p: 0.95,
            stream: false
        });

        return secondResponse.choices[0]?.message?.content?.trim();
    }

    if (!message.content || message.content.trim().length === 0) {
        throw new Error('Empty Groq response');
    }
    return message.content.trim();
}

async function callXai(messages) {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
        throw new Error('Missing XAI_API_KEY');
    }

    // xAI doesn't support tool_calls in messages, strip them
    const cleanMessages = messages.filter(m => m.role !== 'tool').map(m => {
        if (m.tool_calls) {
            return { role: m.role, content: m.content || '' };
        }
        return m;
    });

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'grok-3-mini-beta',
            messages: cleanMessages,
            temperature: 0.8,
            max_tokens: 800,
            top_p: 0.95,
            stream: false
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(data?.error?.message || `xAI request failed (HTTP ${response.status})`);
        err.status = response.status;
        throw err;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply || reply.length === 0) {
        throw new Error('Empty xAI response');
    }
    return reply;
}

async function callOpenAI(messages) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new Error('Missing OPENAI_API_KEY');
    }

    // OpenAI doesn't support Groq-style tool_calls in messages, strip them
    const cleanMessages = messages.filter(m => m.role !== 'tool').map(m => {
        if (m.tool_calls) {
            return { role: m.role, content: m.content || '' };
        }
        return m;
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: cleanMessages,
            temperature: 0.8,
            max_tokens: 800,
            top_p: 0.95,
            stream: false
        })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const err = new Error(data?.error?.message || `OpenAI request failed (HTTP ${response.status})`);
        err.status = response.status;
        throw err;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply || reply.length === 0) {
        throw new Error('Empty OpenAI response');
    }
    return reply;
}

async function generateAIResponse(userId, chatJid, userMessage, senderName, userVibe = 'Casual / Friendly', history = [], options = {}) {
    try {
        const { smartMemory, ownerName = 'Owner', isOwnerMessage = false, searchContext = '', forceProvider = '' } = options;
        const systemPrompt = getAIPrompt(ownerName, userVibe);
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
                const safeText = String(msg.text).substring(0, 1000); // Prevent token bloat
                // Format: show who said what (use strict delimiters to prevent injection)
                const formattedContent = msg.role === 'user' 
                    ? `[USER_MESSAGE_START] ${msg.senderName || 'User'}: ${safeText} [USER_MESSAGE_END]` 
                    : safeText;
                
                messages.push({
                    role: msg.role,
                    content: formattedContent
                });
            });
        }

        // Add current user message with truncating
        const safeUserMessage = String(userMessage).substring(0, 1000);
        messages.push({ 
            role: 'user', 
            content: `[USER_MESSAGE_START] ${senderName}: ${safeUserMessage} [USER_MESSAGE_END]`
        });

        // Primary personality system prompt
        const liveTime = getLiveTime();
        let fullSystemPrompt = systemPrompt + `\n\nCurrent Live Time: ${liveTime}\nAlways answer time-related questions using this live time.\nIf user asks time, respond with this time directly.`;

        // Add search context if available
        if (searchContext) {
            fullSystemPrompt += `\n\n[LIVE INTERNET DATA — Use this to answer the user's question accurately. Provide a short, concise, and important summary of this data in your reply.]\n${searchContext}`;
        }

        messages.unshift({
            role: "system",
            content: fullSystemPrompt
        });



        const groqKeys = {
            groq_1: process.env.GROQ_PRIMARY || process.env.GROQ_API_KEY || '',
            groq_2: process.env.GROQ_SECONDARY || '',
            groq_3: process.env.GROQ_3 || '',
            groq_4: process.env.GROQ_4 || '',
            groq_5: process.env.GROQ_5 || ''
        };

        // If a specific provider is forced (from dashboard test), use only that
        let providers;
        if (forceProvider && forceProvider.startsWith('groq_')) {
            providers = [forceProvider];
        } else {
            providers = AI_PRIORITY;
        }

        for (const provider of providers) {
            const key = groqKeys[provider];
            if (!key) continue;

            try {
                const reply = await callGroq(messages, key);
                resetGroqFailures();
                console.log(`[AI] ${provider} responded successfully`);
                return reply;
            } catch (error) {
                registerGroqFailure();
                console.warn(`[AI] ${provider} failed: ${error.message} - trying next...`);
                continue;
            }
        }

        return forceProvider 
            ? `[${forceProvider.toUpperCase()} ERROR] Provider failed. Check API key or try another model.`
            : "Iska better jawab Sir bata sakte hain.";
    } catch (error) {
        console.error('[AI Failover Error]', error);
        return forceProvider
            ? `[${forceProvider.toUpperCase()} ERROR] ${error.message}`
            : "Iska better jawab Sir bata sakte hain.";
    }
}

module.exports = { AI_PRIORITY, generateAIResponse };
