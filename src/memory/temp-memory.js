const TEMP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_MESSAGES = 10;

class TempMemoryStore {
    constructor() {
        this.store = new Map(); // key: userId:chatJid -> [{ role, text, senderName, timestamp }]
    }

    getKey(userId, chatJid) {
        return `${userId}:${chatJid}`;
    }

    pruneMessages(messages) {
        const cutoff = Date.now() - TEMP_TTL_MS;
        const recent = messages.filter((msg) => msg.timestamp >= cutoff);
        return recent.slice(-MAX_MESSAGES);
    }

    addMessage(userId, chatJid, role, text, senderName = '') {
        const key = this.getKey(userId, chatJid);
        const existing = this.store.get(key) || [];
        existing.push({ role, text, senderName, timestamp: Date.now() });
        const pruned = this.pruneMessages(existing);
        this.store.set(key, pruned);
    }

    getRecent(userId, chatJid) {
        const key = this.getKey(userId, chatJid);
        const existing = this.store.get(key) || [];
        const pruned = this.pruneMessages(existing);
        if (pruned.length !== existing.length) {
            this.store.set(key, pruned);
        }
        return pruned;
    }

    listChatsForUser(userId) {
        const prefix = `${userId}:`;
        const result = [];
        for (const [key, messages] of this.store.entries()) {
            if (!key.startsWith(prefix)) continue;
            const chatJid = key.slice(prefix.length);
            const pruned = this.pruneMessages(messages);
            if (pruned.length === 0) {
                this.store.delete(key);
                continue;
            }
            result.push({
                chatJid,
                lastActivity: pruned[pruned.length - 1]?.timestamp || 0,
                messages: pruned
            });
        }
        return result.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    }

    listActivePairs() {
        const result = [];
        for (const [key, messages] of this.store.entries()) {
            const separatorIndex = key.indexOf(':');
            if (separatorIndex === -1) continue;
            const userId = key.slice(0, separatorIndex);
            const chatJid = key.slice(separatorIndex + 1);
            const pruned = this.pruneMessages(messages);
            if (pruned.length === 0) {
                this.store.delete(key);
                continue;
            }
            result.push({ userId, chatJid, messages: pruned });
        }
        return result;
    }
}

const tempMemory = new TempMemoryStore();

// Periodic cleanup to enforce TTL
setInterval(() => {
    for (const [key, messages] of tempMemory.store.entries()) {
        const pruned = tempMemory.pruneMessages(messages);
        if (pruned.length === 0) {
            tempMemory.store.delete(key);
        } else {
            tempMemory.store.set(key, pruned);
        }
    }
}, 60 * 1000);

module.exports = tempMemory;
