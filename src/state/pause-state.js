const { setPauseTimer, isChatPaused, clearPauseTimer, getPauseTimer } = require('../services/firebase-service');

function safeFirebaseKey(jid = '') {
    return String(jid).replace(/[.#$\[\]@]/g, '_');
}

class PauseStateManager {
    constructor() {
        this.localPauseTimers = new Map(); // userId:chatJid -> endTime
        this.cleanupIntervals = new Map(); // Interval IDs
    }

    // Set pause timer locally + sync to Firebase
    async setPause(userId, chatJid, minutes) {
        const safeChatJid = safeFirebaseKey(chatJid);
        const endTime = Date.now() + (minutes * 60 * 1000);
        const key = `${userId}:${safeChatJid}`;

        // Store locally for quick access
        this.localPauseTimers.set(key, endTime);

        // Sync to Firebase
        await setPauseTimer(userId, safeChatJid, minutes);

        // Set up auto-cleanup
        this.scheduleCleanup(userId, safeChatJid, endTime);

        return { success: true, pausedUntil: endTime };
    }

    // Check if chat is paused (local + Firebase)
    async isPaused(userId, chatJid) {
        const safeChatJid = safeFirebaseKey(chatJid);
        const key = `${userId}:${safeChatJid}`;

        // Check local first
        if (this.localPauseTimers.has(key)) {
            const endTime = this.localPauseTimers.get(key);
            if (Date.now() <= endTime) {
                return true;
            }
            // Expired, clean up
            this.localPauseTimers.delete(key);
        }

        // Check Firebase
        return await isChatPaused(userId, safeChatJid);
    }

    // Schedule automatic cleanup
    scheduleCleanup(userId, chatJid, endTime) {
        const key = `${userId}:${chatJid}`;
        const delay = endTime - Date.now();

        if (delay <= 0) return;

        const cleanupId = setTimeout(async () => {
            console.log(`⏰ Timer expired for ${chatJid}`);
            this.localPauseTimers.delete(key);
            this.cleanupIntervals.delete(key);
            await clearPauseTimer(userId, chatJid);
        }, delay);

        this.cleanupIntervals.set(key, cleanupId);
    }

    // Clear pause manually
    async clearPause(userId, chatJid) {
        const safeChatJid = safeFirebaseKey(chatJid);
        const key = `${userId}:${safeChatJid}`;

        // Remove from Firebase
        await clearPauseTimer(userId, safeChatJid);

        // Remove from local
        this.localPauseTimers.delete(key);

        // Cancel cleanup timer
        if (this.cleanupIntervals.has(key)) {
            clearTimeout(this.cleanupIntervals.get(key));
            this.cleanupIntervals.delete(key);
        }

        console.log(`✅ Pause cleared for ${chatJid}`);
    }

    // Get pause status
    async getPauseStatus(userId, chatJid) {
        const safeChatJid = safeFirebaseKey(chatJid);
        const key = `${userId}:${safeChatJid}`;
        
        if (this.localPauseTimers.has(key)) {
            const endTime = this.localPauseTimers.get(key);
            const remaining = Math.max(0, endTime - Date.now());
            const minutes = Math.ceil(remaining / 60000);
            
            return {
                paused: true,
                pausedUntil: endTime,
                remainingMinutes: minutes
            };
        }

        const paused = await isChatPaused(userId, safeChatJid);
        if (!paused) {
            return { paused: false };
        }

        const timerData = await getPauseTimer(userId, safeChatJid);
        if (timerData?.pausedUntil) {
            const remaining = Math.max(0, timerData.pausedUntil - Date.now());
            return { paused: true, remainingMinutes: Math.ceil(remaining / 60000) };
        }

        return { paused: true, remainingMinutes: 1 };
    }
}

module.exports = new PauseStateManager();
