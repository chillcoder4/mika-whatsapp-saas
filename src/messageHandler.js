const { getAIResponse } = require('./ai');
const { loadSettings, updateSettings, isChatEnabled } = require('./config');
const botEmitter = require('./events');
const memoryManager = require('./memory-manager');

// Checks for duplicates
const processedMessages = new Set();
let botMemory = {};
const DEBUG_MODE = true; // HARD DEBUG MODE ENABLED

// Cleanup caches
setInterval(() => {
    processedMessages.clear();
}, 60 * 60 * 1000);

// Memory persistence (Legacy, but kept for safety)
setInterval(() => {
    try {
        const fs = require('fs');
        const path = require('path');
        const memoryPath = path.join(__dirname, '../bot-memory.json');
        fs.writeFileSync(memoryPath, JSON.stringify(botMemory, null, 2));
    } catch (err) {
        console.error('Error saving bot memory:', err);
    }
}, 5 * 60 * 1000);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleMessage(sock, msg) {
    if (DEBUG_MODE) console.log('[DEBUG] 1. Received raw message object');
    
    const settings = loadSettings();
    if (DEBUG_MODE) console.log(`[DEBUG] Settings loaded. Bot ON: ${settings.bot_on}`);

    // 1. Basic Extraction
    if (!msg.messages || !msg.messages[0]) return;
    const m = msg.messages[0];
    if (!m.message) return;
    
    // CRITICAL: Prevent self-reply loop
    if (m.key.fromMe) {
        if (DEBUG_MODE) console.log('[DEBUG] Skipped: Message is from ME');
        return;
    }

    // 1.5 De-duplication
    const messageId = m.key.id;
    if (processedMessages.has(messageId)) {
        console.log(`[Duplicate] Skipping: ${messageId}`);
        return;
    }
    processedMessages.add(messageId);

    const remoteJid = m.key.remoteJid;

    // 1.6 Ignore Status, Channels etc
    if (
        remoteJid === 'status@broadcast' || 
        remoteJid.includes('@newsletter') || 
        remoteJid.includes('broadcast') ||
        remoteJid.toLowerCase().includes('channel')
    ) {
        if (DEBUG_MODE) console.log(`[DEBUG] Skipped: Broadcast/Status ${remoteJid}`);
        return;
    }

    const senderJid = m.key.participant || remoteJid;
    if (!senderJid) return;

    const pushName = m.pushName || "Unknown";
    const isGroup = remoteJid.endsWith('@g.us');
    
    // 1.7 Extract text safely
    let text = "";
    if (m.message.conversation) text = m.message.conversation;
    else if (m.message.extendedTextMessage?.text) text = m.message.extendedTextMessage.text;
    else if (m.message.imageMessage?.caption) text = m.message.imageMessage.caption;
    else if (m.message.videoMessage?.caption) text = m.message.videoMessage.caption;

    if (!text) {
        if (DEBUG_MODE) console.log('[DEBUG] Skipped: No text content found');
        return;
    }

    console.log(`[Message] From: ${pushName} (${remoteJid}) | Text: ${text}`);

    // 2. Commands check
    if (text.startsWith('!')) {
        const parts = text.slice(1).trim().split(" ");
        const command = parts[0].toLowerCase();
        
        if (command === 'ping') {
            await sock.sendMessage(remoteJid, { text: 'Pong! 🏓' }, { quoted: m });
            return;
        }

        if (command === 'bot') {
            const arg = parts[1];
            if (arg === 'on') {
                updateSettings({ bot_on: true });
                await sock.sendMessage(remoteJid, { text: '✅ Bot enabled!' }, { quoted: m });
            } else if (arg === 'off') {
                updateSettings({ bot_on: false });
                await sock.sendMessage(remoteJid, { text: '❌ Bot disabled!' }, { quoted: m });
            }
            return;
        }

        if (command === 'stats') {
            const stats = memoryManager.getStats(remoteJid);
            await sock.sendMessage(remoteJid, { 
                text: `📊 Chat Stats (this chat)\n📝 Messages: ${stats.messages}\n⏰ Last Activity: ${stats.lastActivity ? new Date(stats.lastActivity).toLocaleString() : 'Never'}` 
            }, { quoted: m });
            return;
        }

        if (command === 'clear') {
            memoryManager.clearHistory(remoteJid);
            await sock.sendMessage(remoteJid, { text: '🗑️ Chat memory cleared!' }, { quoted: m });
            return;
        }
    }

    // 3. Global Bot Switch Check
    // Ensure default is TRUE if undefined
    const botEnabled = settings.bot_on !== false; 
    if (!botEnabled) {
        if (DEBUG_MODE) console.log('[DEBUG] Skipped: Bot globally disabled');
        return;
    }

    // 4. Check if chat is enabled (Ignore List Check)
    // We manually check valid ignore logic here to be sure
    if (isGroup && settings.ignore_group_chats?.includes(remoteJid)) {
         console.log(`[Ignored] Group in ignore list: ${remoteJid}`);
         return;
    }
    if (!isGroup && settings.ignore_private_chats?.includes(remoteJid)) {
         console.log(`[Ignored] Private chat in ignore list: ${remoteJid}`);
         return;
    }

    // For groups: If allow list is empty, treat as allowed (User requested "Unconditional")
    // If logic in config.js is strict, we might bypass it here or rely on isChatEnabled returning true
    const chatEnabled = isChatEnabled(remoteJid);
    // Overrule isChatEnabled default restrictiveness for groups if array is null/empty?
    // User wanted unconditional group replies unless ignored.
    // If config.js logic is strict (whitelist only), we might be blocking groups.
    // Let's trust isChatEnabled but log if it blocks.
    if (!chatEnabled) {
         // Hotfix: if it's a group and NOT in ignore list, allow it.
         if (isGroup && (!settings.allowed_groups || settings.allowed_groups.length === 0)) {
             // Allow if no whitelist exists (Unconditional mode)
             if (DEBUG_MODE) console.log('[DEBUG] Group allowed (Unconditional Override)');
         } else {
             console.log(`[Ignored] Chat disabled by settings: ${remoteJid}`);
             return;
         }
    }

    // 5. SAVE USER MESSAGE TO MEMORY
    memoryManager.addMessage(remoteJid, 'user', text, pushName);

    // 6. Generate AI Response
    if (DEBUG_MODE) console.log('[DEBUG] Generating AI response...');
    
    const chatHistory = memoryManager.getHistory(remoteJid, 10);
    
    // Emit incoming for dashboard
    botEmitter.emit('message', { type: 'in', sender: pushName, text: text });

    let responseText = "";
    try {
        responseText = await getAIResponse(remoteJid, pushName, text, settings.ai_mode, chatHistory);
        if (DEBUG_MODE) console.log(`[DEBUG] AI Response: ${responseText}`);
    } catch (e) {
        console.error('[DEBUG] AI Generation Failed:', e);
        responseText = "Iska better jawab Sir bata sakte hain.";
    }

    if (!responseText) {
        if (DEBUG_MODE) console.log('[DEBUG] No response text generated. Aborting.');
        return;
    }

    // 7. Calculate human-like delay
    function calculateHumanDelay(messageLength) {
        let baseDelay;
        if (messageLength < 50) baseDelay = 1000 + Math.random() * 1000;
        else if (messageLength < 150) baseDelay = 2000 + Math.random() * 1500;
        else baseDelay = 4000 + Math.random() * 2000;
        return Math.floor(baseDelay);
    }

    const typingDelay = calculateHumanDelay(responseText.length);
    if (DEBUG_MODE) console.log(`[Delay] Waiting ${typingDelay}ms...`);

    // 8. Typing indicator & Sending
    try {
        await sock.sendPresenceUpdate('composing', remoteJid);
        await delay(typingDelay);
        await sock.sendPresenceUpdate('paused', remoteJid);

        if (DEBUG_MODE) console.log(`[DEBUG] Sending message to ${remoteJid}`);
        await sock.sendMessage(remoteJid, { text: responseText }, { quoted: m });
        
        // SAVE AI RESPONSE TO MEMORY
        memoryManager.addMessage(remoteJid, 'assistant', responseText, 'Joyz AI');
        
        console.log(`[Reply] Sent to ${pushName}`);
        botEmitter.emit('message', { type: 'out', sender: 'Joyz AI', text: responseText });
    } catch (err) {
        console.error('[Reply Error]', err);
        memoryManager.addMessage(remoteJid, 'assistant', '(Error sending)', 'Joyz AI');
    }
}

module.exports = { handleMessage, memoryManager };
