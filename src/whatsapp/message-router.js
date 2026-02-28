const { generateAIResponse } = require('../ai/generator');
const tempMemory = require('../memory/temp-memory');
const { updateSmartMemoryFromMessage } = require('../memory/smart-memory');
const { getUserSettings, getUserProfile, getSmartMemory, saveMessage, getChatHistory, addSmartMemoryImportantPoint } = require('../services/firebase-service');
const pauseStateManager = require('../state/pause-state');
const { getLiveTime } = require('../utils/time');
const { searchInternet } = require('../services/webSearch');

const processedMessages = new Set();

// Cleanup processed message IDs every hour
setInterval(() => {
    processedMessages.clear();
}, 60 * 60 * 1000);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// SILENT MODE TOGGLE
// Set to true to stop all outgoing replies
const BOT_SILENT_MODE = false;

function cleanJid(jid = '') {
    return String(jid).split(':')[0];
}

function normalizeJid(jid = '') {
    const cleaned = cleanJid(String(jid).trim().toLowerCase());
    if (!cleaned) return '';
    if (cleaned.includes('@')) return cleaned;
    if (/^\d+$/.test(cleaned)) return `${cleaned}@s.whatsapp.net`;
    return cleaned;
}

function isDeveloperQuestion(text = '') {
    return /who (made|created) you|who( is)? your developer|kisne banaya|developer|owner contact|creator info|joyz developer/i.test(text);
}

function isIntroQuestion(text = '') {
    return /who are you|introduce yourself|tum kaun|apna intro/i.test(text);
}

function isTimeQuestion(text = '') {
    const patterns = [
        /^\s*time\s*[?!.]*\s*$/i,
        /\bwhat time is it\b/i,
        /\bcurrent time\b/i,
        /\babhi ka time\b/i,
        /\bkitna time hua\b/i
    ];
    return patterns.some((pattern) => pattern.test(text));
}

function isImportantMemoryCommand(text = '') {
    return /(ye save kar lo|yaad rakhna|remember this|save this|note this)/i.test(text);
}

function isSearchQuery(text = '') {
    const trimmed = text.trim();
    if (!trimmed) return false;

    if (/^(hi|hello|hey|hii|kaise ho|kya haal|how are you|what's up|wassup)\b/i.test(trimmed)) {
        return false;
    }

    if (/\b(news|latest|update|updates|research|internet|search|google|find|wikipedia|wiki|breaking)\b/i.test(trimmed)) {
        return true;
    }

    if (/(tell me about|information on|info on|details on|explain)\b/i.test(trimmed)) {
        return true;
    }

    if (/^(who|what|when|where|why|how|which|define|meaning|price|rate|cost|score|capital|population|president|ceo)\b/i.test(trimmed)) {
        return true;
    }

    return trimmed.endsWith('?');
}

function detectLanguageHint(text = '') {
    if (/[\u0900-\u097F]/.test(text)) return 'hi';
    if (/[\u0600-\u06FF]/.test(text)) return 'ar';
    return 'en';
}

function buildSearchErrorMessage(text = '') {
    const lang = detectLanguageHint(text);
    if (lang === 'hi') return 'Search service abhi available nahi hai. Thodi der baad try karein.';
    if (lang === 'ar') return 'خدمة البحث غير متاحة الآن. حاول لاحقًا.';
    return 'Search service is unavailable right now. Please try again later.';
}

function buildNoResultsMessage(text = '') {
    const lang = detectLanguageHint(text);
    if (lang === 'hi') return 'Mujhe is topic par koi relevant results nahi mile.';
    if (lang === 'ar') return 'لم أجد نتائج مناسبة لهذا الموضوع.';
    return 'I could not find relevant results for this topic.';
}

function buildIntroReply(ownerName) {
    return `I am your personal WhatsApp assistant, ${ownerName} Sir.`;
}

function buildDeveloperReply() {
    return [
        'Developer Name: Jaswant',
        'Instagram: @jaswant_0707',
        'Instagram: @the.chillcoder',
        'Email: jaswanty132@gmail.com',
        'Email: chillcoder4@gmail.com'
    ].join('\n');
}

function parseWaitMinutes(text = '') {
    const patterns = [
        /@joyz\s*(\d+)\s*min(?:ute)?s?\s*wait/i,
        /@joyz\s*wait\s*(\d+)\s*min(?:ute)?s?/i,
        /@joyz\s*ruko\s*(\d+)\s*min(?:ute)?s?/i,
        /@joyz\s*stop\s*for\s*(\d+)\s*min(?:ute)?s?/i,
        /@joyz\s*don't\s*reply\s*for\s*(\d+)\s*min(?:ute)?s?/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

function isWaitTermination(text = '') {
    return /@joyz\s*(time over|waiting time over|resume|start replying|wake up)/i.test(text);
}

async function handleIncomingMessage(userId, sock, msg) {
    try {
        if (!msg.messages || !msg.messages[0]) return;
        const m = msg.messages[0];
        if (!m.message) return;

        // Ignore messages sent by the bot itself
        if (m.key.fromMe) return;

        const remoteJid = m.key.remoteJid;
        if (!remoteJid) return;

        const cleanRemoteJid = cleanJid(remoteJid);
        const normalizedRemoteJid = normalizeJid(cleanRemoteJid);

        // Broadcast and channel filters
        if (
            normalizedRemoteJid === 'status@broadcast' ||
            normalizedRemoteJid.includes('@newsletter') ||
            normalizedRemoteJid.includes('broadcast') ||
            normalizedRemoteJid.includes('channel')
        ) {
            return;
        }

        const messageId = m.key.id;
        if (processedMessages.has(messageId)) return;
        processedMessages.add(messageId);

        const senderJid = m.key.participant || remoteJid;
        const cleanSenderJid = cleanJid(senderJid);
        const normalizedSenderJid = normalizeJid(cleanSenderJid);

        const pushName = m.pushName || 'User';
        const isGroup = normalizedRemoteJid.endsWith('@g.us');

        let text = '';
        if (m.message.conversation) text = m.message.conversation;
        else if (m.message.extendedTextMessage?.text) text = m.message.extendedTextMessage.text;
        else if (m.message.imageMessage?.caption) text = m.message.imageMessage.caption;
        else if (m.message.videoMessage?.caption) text = m.message.videoMessage.caption;

        if (!text) return;

        const lowerText = text.toLowerCase();
        console.log(`[User ${userId}] Incoming: ${text} (from ${pushName})`);

        if (BOT_SILENT_MODE) {
            console.log(`[User ${userId}] Bot is in SILENT MODE. Ignoring all reply triggers.`);
            tempMemory.addMessage(userId, normalizedRemoteJid, 'user', text, pushName);
            return;
        }

        const settings = await getUserSettings(userId);
        const profile = await getUserProfile(userId);

        const ownerWhatsApp = cleanJid(profile?.ownerWhatsApp || '');
        const ownerName = profile?.name || settings?.owner_name || 'Owner';
        const normalizedOwnerJid = normalizeJid(ownerWhatsApp);
        const isOwnerMessage = !!normalizedOwnerJid && normalizedSenderJid === normalizedOwnerJid;

        let bypassPause = false;
        let bypassIgnore = false;
        let bypassBotToggle = false;

        if (isOwnerMessage) {
            bypassPause = true;
            bypassIgnore = true;
            bypassBotToggle = true;
        }

        const ignorePrivate = settings.ignorePrivate || settings.ignore_private_chats || [];
        const ignoreGroups = settings.ignoreGroups || settings.ignore_group_chats || [];

        if (!bypassIgnore) {
            const normalizedIgnoredPrivate = ignorePrivate.map((jid) => normalizeJid(cleanJid(jid)));
            const normalizedIgnoredGroups = ignoreGroups.map((jid) => normalizeJid(cleanJid(jid)));

            if (!isGroup && normalizedIgnoredPrivate.includes(normalizedRemoteJid)) return;
            if (isGroup && normalizedIgnoredGroups.includes(normalizedRemoteJid)) return;
        }

        const waitMinutes = parseWaitMinutes(lowerText);
        if (waitMinutes && waitMinutes > 0 && waitMinutes <= 120) {
            await pauseStateManager.setPause(userId, normalizedRemoteJid, waitMinutes);
            return;
        }

        if (isWaitTermination(lowerText)) {
            await pauseStateManager.clearPause(userId, normalizedRemoteJid);
            return;
        }

        const isPaused = await pauseStateManager.isPaused(userId, normalizedRemoteJid);

        if (!bypassPause && isPaused) {
            console.log(`[User ${userId}] Chat paused, hard-stop for non-owner`);
            return;
        }

        if (!bypassBotToggle && settings.bot_on === false) return;

        if (text.startsWith('!')) {
            const parts = text.slice(1).trim().split(' ');
            const command = parts[0].toLowerCase();

            if (command === 'ping') {
                await sock.sendMessage(remoteJid, { text: 'Pong!' }, { quoted: m });
                return;
            }

            if (command === 'stats') {
                const temp = tempMemory.getRecent(userId, normalizedRemoteJid) || [];
                await sock.sendMessage(remoteJid, {
                    text: `Chat Stats\nRecent msgs: ${temp.length}\nChat: ${isGroup ? 'Group' : 'Private'}`
                }, { quoted: m });
                return;
            }
        }

        if (isDeveloperQuestion(lowerText)) {
            await sock.sendMessage(remoteJid, { text: buildDeveloperReply() }, { quoted: m });
            return;
        }

        if (isIntroQuestion(lowerText)) {
            await sock.sendMessage(remoteJid, { text: buildIntroReply(ownerName) }, { quoted: m });
            return;
        }

        tempMemory.addMessage(userId, normalizedRemoteJid, 'user', text, pushName);
        await saveMessage(userId, normalizedRemoteJid, 'user', text, pushName).catch(() => {});
        await updateSmartMemoryFromMessage(userId, normalizedRemoteJid, 'user', text, pushName, isOwnerMessage);

        if (isImportantMemoryCommand(lowerText)) {
            await addSmartMemoryImportantPoint(userId, normalizedRemoteJid, text, pushName).catch(() => {});
        }

        if (isTimeQuestion(lowerText)) {
            const timeReply = `Current Live Time: ${getLiveTime()}`;
            await sock.sendMessage(remoteJid, { text: timeReply });
            tempMemory.addMessage(userId, normalizedRemoteJid, 'assistant', timeReply, 'Joyz AI');
            await saveMessage(userId, normalizedRemoteJid, 'assistant', timeReply, 'Joyz AI').catch(() => {});
            return;
        }

        if (isSearchQuery(lowerText)) {
            try {
                const searchReply = await searchInternet(text);
                await sock.sendMessage(remoteJid, { text: searchReply });
                tempMemory.addMessage(userId, normalizedRemoteJid, 'assistant', searchReply, 'Joyz AI');
                await saveMessage(userId, normalizedRemoteJid, 'assistant', searchReply, 'Joyz AI').catch(() => {});
                return;
            } catch (error) {
                console.error('[Search Error]', error);
                const errorReply = buildSearchErrorMessage(text);
                await sock.sendMessage(remoteJid, { text: errorReply });
                tempMemory.addMessage(userId, normalizedRemoteJid, 'assistant', errorReply, 'Joyz AI');
                await saveMessage(userId, normalizedRemoteJid, 'assistant', errorReply, 'Joyz AI').catch(() => {});
                return;
            }
        }

        let chatHistory = tempMemory.getRecent(userId, normalizedRemoteJid);
        if (!chatHistory || chatHistory.length === 0) {
            const persistedHistory = await getChatHistory(userId, normalizedRemoteJid, 10).catch(() => []);
            chatHistory = Array.isArray(persistedHistory) ? persistedHistory : [];
        }

        if (!chatHistory || chatHistory.length === 0) {
            chatHistory = [];
        }

        const smartMemory = await getSmartMemory(userId, normalizedRemoteJid);
        const aiMode = settings.ai_mode || 'romantic';

        console.log(`[User ${userId}] Generating AI response...`);

        const responseText = await generateAIResponse(
            userId,
            normalizedRemoteJid,
            text,
            pushName,
            aiMode,
            chatHistory,
            {
                ownerName: ownerName,
                isOwnerMessage: isOwnerMessage,
                smartMemory: smartMemory
            }
        );

        if (responseText && responseText.includes('Iska better jawab Sir bata sakte hain.')) {
            const lastMsg = chatHistory[chatHistory.length - 1];
            if (lastMsg && lastMsg.role === 'assistant' && String(lastMsg.text || '').includes('Iska better jawab Sir bata sakte hain.')) {
                console.log('[Stability] Skipping duplicate fallback message to prevent loop');
                return;
            }
        }

        if (!responseText || responseText.trim() === '') return;

        function calculateHumanDelay(outputText) {
            const baseDelay = outputText.length < 50 ? 1000 : 2000;
            return Math.floor(baseDelay + Math.random() * 2000);
        }

        const typingDelay = calculateHumanDelay(responseText);

        await sock.sendPresenceUpdate('composing', remoteJid);
        await delay(typingDelay);
        await sock.sendPresenceUpdate('paused', remoteJid);

        await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });

        tempMemory.addMessage(userId, normalizedRemoteJid, 'assistant', responseText, 'Joyz AI');
        await saveMessage(userId, normalizedRemoteJid, 'assistant', responseText, 'Joyz AI').catch(() => {});

        console.log(`[User ${userId}] AI reply sent successfully`);
    } catch (error) {
        console.error('[CRITICAL] Message Handling Crash:', error);
    }
}

module.exports = { handleIncomingMessage };

function clearProcessedMessages() {
    processedMessages.clear();
}

module.exports.clearProcessedMessages = clearProcessedMessages;
