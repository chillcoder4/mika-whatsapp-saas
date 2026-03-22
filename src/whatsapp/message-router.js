const { generateAIResponse } = require('../ai/generator');
const tempMemory = require('../memory/temp-memory');
const { updateSmartMemoryFromMessage } = require('../memory/smart-memory');
const { getUserSettings, getUserProfile, getSmartMemory, updateSmartMemory, saveMessage, getChatHistory, addSmartMemoryImportantPoint } = require('../services/firebase-service');
const pauseStateManager = require('../state/pause-state');
const groupState = require('../state/group-state');
const { getLiveTime } = require('../utils/time');

const processedMessages = new Set();
const MAX_PROCESSED_MESSAGES = 2000;

const botMessageIds = new Set();
const MAX_BOT_IDS = 1000;

function trackProcessedMessage(messageId) {
    if (processedMessages.size >= MAX_PROCESSED_MESSAGES) {
        const firstId = processedMessages.values().next().value;
        processedMessages.delete(firstId);
    }
    processedMessages.add(messageId);
}

function trackBotMessage(id) {
    if (botMessageIds.size >= MAX_BOT_IDS) {
        const firstId = botMessageIds.values().next().value;
        botMessageIds.delete(firstId);
    }
    botMessageIds.add(id);
}

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
    return /who (made|created) you|who( is)? your developer|kisne banaya|developer|owner contact|creator info|mika developer/i.test(text);
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
    return `Hi! I'm Mika ✨ — ${ownerName}'s personal WhatsApp assistant. How can I help you?`;
}

function buildDeveloperReply() {
    return [
        '👨‍💻 Developer: Jaswant',
        '📸 Instagram: @jaswnt_0707 | @the.chillcoder',
        '📧 Email: jaswanty132@gmail.com | chillcoder4@gmail.com'
    ].join('\n');
}

function parseWaitMinutes(text = '') {
    const patterns = [
        /@mika\s*(\d+)\s*min(?:ute)?s?\s*wait/i,
        /@mika\s*wait\s*(\d+)\s*min(?:ute)?s?/i,
        /@mika\s*ruko\s*(\d+)\s*min(?:ute)?s?/i,
        /@mika\s*stop\s*for\s*(\d+)\s*min(?:ute)?s?/i,
        /@mika\s*don't\s*reply\s*for\s*(\d+)\s*min(?:ute)?s?/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

function isWaitTermination(text = '') {
    return /@mika\s*(time over|waiting time over|resume|start replying|wake up)/i.test(text);
}

async function handleIncomingMessage(userId, sock, msg) {
    try {
        if (!msg.messages || !msg.messages[0]) return;
        const m = msg.messages[0];
        if (!m.message) return;

        const messageId = m.key.id;
        if (processedMessages.has(messageId)) return;
        trackProcessedMessage(messageId);

        if (m.key.fromMe) {
            if (botMessageIds.has(messageId)) {
                return; // AI's own reply, ignore it to prevent infinite loop
            }
        }

        const remoteJid = m.key.remoteJid;
        if (!remoteJid) return;

        const cleanRemoteJid = cleanJid(remoteJid);
        const normalizedRemoteJid = normalizeJid(cleanRemoteJid);

        if (
            normalizedRemoteJid === 'status@broadcast' ||
            normalizedRemoteJid.includes('@newsletter') ||
            normalizedRemoteJid.includes('broadcast') ||
            normalizedRemoteJid.includes('channel')
        ) {
            return;
        }

        const senderJid = m.key.fromMe ? sock.user.id : (m.key.participant || remoteJid);
        const cleanSenderJid = cleanJid(senderJid);
        const normalizedSenderJid = normalizeJid(cleanSenderJid);

        const pushName = m.key.fromMe ? 'Owner' : (m.pushName || 'User');
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
        const isOwnerMessage = m.key.fromMe || (!!normalizedOwnerJid && normalizedSenderJid === normalizedOwnerJid);

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
            const wMsg = await sock.sendMessage(remoteJid, { text: `Mika pausing for ${waitMinutes} min ⏸️` }, { quoted: m });
            if (wMsg?.key?.id) trackBotMessage(wMsg.key.id);
            return;
        }

        if (isWaitTermination(lowerText)) {
            await pauseStateManager.clearPause(userId, normalizedRemoteJid);
            const wMsg = await sock.sendMessage(remoteJid, { text: `Mika is back online! 🟢` }, { quoted: m });
            if (wMsg?.key?.id) trackBotMessage(wMsg.key.id);
            return;
        }

        const isPaused = await pauseStateManager.isPaused(userId, normalizedRemoteJid);

        if (isPaused) {
            console.log(`[User ${userId}] Chat paused, hard-stop. Waiting for timer or resume command.`);
            return;
        }

        if (!bypassBotToggle && settings.bot_on === false) return;

        // Allow explicit vibe change globally (private or group)
        const hasMikaTag = /@mika/i.test(lowerText);
        if (hasMikaTag) {
            const modeMatch = lowerText.match(/@mika\s+(romantic|angry|casual|professional|funny|savage|motivational)/i);
            if (modeMatch) {
                const forcedVibe = modeMatch[1];
                const explicitVibe = forcedVibe.charAt(0).toUpperCase() + forcedVibe.slice(1).toLowerCase();
                
                // Immediately save to permanent memory so AI always remembers the vibe for this JID
                await updateSmartMemory(userId, normalizedRemoteJid, { vibe: explicitVibe }).catch(() => {});
                
                // Also send a nice confirmation message
                const vMsg = await sock.sendMessage(remoteJid, { text: `Done! My personality for this chat is now set to: ${explicitVibe} 😎` }, { quoted: m });
                if (vMsg?.key?.id) trackBotMessage(vMsg.key.id);
                return;
            }
        }

        let isGroupActiveSession = false;
        if (isGroup) {
            isGroupActiveSession = true; // Groups now reply normally
        }

        if (text.startsWith('!')) {
            const parts = text.slice(1).trim().split(' ');
            const command = parts[0].toLowerCase();

            if (command === 'ping') {
                const pMsg = await sock.sendMessage(remoteJid, { text: 'Pong!' }, { quoted: m });
                if (pMsg?.key?.id) trackBotMessage(pMsg.key.id);
                return;
            }

            if (command === 'stats') {
                const temp = tempMemory.getRecent(userId, normalizedRemoteJid) || [];
                const sMsg = await sock.sendMessage(remoteJid, {
                    text: `Chat Stats\nRecent msgs: ${temp.length}\nChat: ${isGroup ? 'Group' : 'Private'}`
                }, { quoted: m });
                if (sMsg?.key?.id) trackBotMessage(sMsg.key.id);
                return;
            }
        }

        if (isDeveloperQuestion(lowerText)) {
            const dMsg = await sock.sendMessage(remoteJid, { text: buildDeveloperReply() }, { quoted: m });
            if (dMsg?.key?.id) trackBotMessage(dMsg.key.id);
            return;
        }

        if (isIntroQuestion(lowerText)) {
            const iMsg = await sock.sendMessage(remoteJid, { text: buildIntroReply(ownerName) }, { quoted: m });
            if (iMsg?.key?.id) trackBotMessage(iMsg.key.id);
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
            const tMsg = await sock.sendMessage(remoteJid, { text: timeReply });
            if (tMsg?.key?.id) trackBotMessage(tMsg.key.id);
            tempMemory.addMessage(userId, normalizedRemoteJid, 'assistant', timeReply, 'Mika');
            await saveMessage(userId, normalizedRemoteJid, 'assistant', timeReply, 'Mika').catch(() => {});
            return;
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
        
        // Priority 1: Specifically requested group vibe for this active session
        // Priority 2: Detected smartMemory vibe
        // Priority 3: Default Casual
        let userVibe = 'Casual / Friendly';
        if (isGroup && isGroupActiveSession) {
            const sessionVibe = groupState.getGroupVibe(userId, normalizedRemoteJid);
            if (sessionVibe) userVibe = sessionVibe;
            else if (smartMemory?.vibe) userVibe = smartMemory.vibe;
        } else {
            userVibe = smartMemory?.vibe || 'Casual / Friendly';
        }

        console.log(`[User ${userId}] Generating AI response (Vibe: ${userVibe})...`);

        const responseText = await generateAIResponse(
            userId,
            normalizedRemoteJid,
            text,
            pushName,
            userVibe,
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

        const sentMsg = await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });
        if (sentMsg?.key?.id) trackBotMessage(sentMsg.key.id);

        tempMemory.addMessage(userId, normalizedRemoteJid, 'assistant', responseText, 'Mika');
        await saveMessage(userId, normalizedRemoteJid, 'assistant', responseText, 'Mika').catch(() => {});

        console.log(`[User ${userId}] AI reply sent successfully`);
    } catch (error) {
        console.error('[CRITICAL] Message Handling Crash:', error);
    }
}

function clearProcessedMessages() {
    processedMessages.clear();
}

module.exports = { handleIncomingMessage, clearProcessedMessages };
