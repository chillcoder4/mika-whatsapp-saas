const { getChatHistory, admin, sanitizeJid, getSmartMemory, listSmartMemoryChats } = require('../services/firebase-service');

// Load chat history from Firebase
async function loadChatMemory(userId, chatJid, limit = 10) {
    try {
        const history = await getChatHistory(userId, chatJid, limit);
        return history;
    } catch (error) {
        console.error(`[Memory Loader] Error loading memory for ${chatJid}:`, error);
        return [];
    }
}

// Load user's all chats statistics
async function loadUserChatStats(userId, limit = 50) {
    try {
        const { admin, sanitizeJid } = require('../services/firebase-service');
        const snapshot = await admin.database().ref(`users/${userId}/memory`).once('value');
        const memoryData = snapshot.val();
        
        if (!memoryData) return { totalChats: 0, totalMessages: 0, chats: [] };

        const chats = Object.entries(memoryData).map(([chatJid, data]) => {
            const safeJid = sanitizeJid(chatJid);
            return {
                chatJid,
                messages: data.messages ? Object.keys(data.messages).length : 0,
                lastActivity: data.lastActivity || null
            };
        });

        const totalChats = chats.length;
        const totalMessages = chats.reduce((sum, chat) => sum + chat.messages, 0);

        return {
            totalChats,
            totalMessages,
            chats: chats.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0))
        };
    } catch (error) {
        console.error('[Memory Loader] Error loading user stats:', error);
        return { totalChats: 0, totalMessages: 0, chats: [] };
    }
}

module.exports = { loadChatMemory, loadUserChatStats };

// Smart Memory Loaders
async function loadSmartMemory(userId, chatJid) {
    try {
        return await getSmartMemory(userId, chatJid);
    } catch (error) {
        console.error('[Smart Memory Loader] Error loading smart memory:', error);
        return null;
    }
}

async function loadSmartMemoryChats(userId) {
    try {
        return await listSmartMemoryChats(userId);
    } catch (error) {
        console.error('[Smart Memory Loader] Error listing smart memory:', error);
        return [];
    }
}

module.exports.loadSmartMemory = loadSmartMemory;
module.exports.loadSmartMemoryChats = loadSmartMemoryChats;
