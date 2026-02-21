const { admin, sanitizeJid } = require('../services/firebase-service');

// Save basic message to Firebase
async function saveMessage(userId, chatJid, role, text, senderName = '') {
    try {
        const safeJid = sanitizeJid(chatJid);
        const messageId = Date.now();
        await admin.database().ref(`users/${userId}/memory/${safeJid}/messages/${messageId}`).set({
            role,
            text,
            senderName,
            timestamp: Date.now()
        });
        return { success: true };
    } catch (error) {
        console.error(`[Memory Saver] saveMessage error for ${chatJid}:`, error);
        return { success: false, error };
    }
}

// Save message to Firebase memory (legacy wrapper)
async function saveToMemory(userId, chatJid, role, text, senderName = '') {
    try {
        const safeJid = sanitizeJid(chatJid);
        await saveMessage(userId, chatJid, role, text, senderName);
        
        // Update last activity timestamp
        await admin.database().ref(`users/${userId}/memory/${safeJid}/lastActivity`).set(Date.now());
        
        return { success: true };
    } catch (error) {
        console.error(`[Memory Saver] saveToMemory error for ${chatJid}:`, error);
        return { success: false, error };
    }
}

// Clear chat memory
async function clearChatMemory(userId, chatJid) {
    try {
        const safeJid = sanitizeJid(chatJid);
        await admin.database().ref(`users/${userId}/memory/${safeJid}`).remove();
        console.log(`✅ Cleared memory for ${chatJid}`);
        return { success: true };
    } catch (error) {
        console.error('[Memory Saver] Error clearing memory:', error);
        return { success: false, error };
    }
}

// Clear all memory for user
async function clearAllMemory(userId) {
    try {
        await admin.database().ref(`users/${userId}/memory`).remove();
        console.log(`✅ Cleared all memory for user ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('[Memory Saver] Error clearing all memory:', error);
        return { success: false, error };
    }
}

module.exports = { saveMessage, saveToMemory, clearChatMemory, clearAllMemory };