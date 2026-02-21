// Memory Manager - stores and retrieves per-chat conversation history

class MemoryManager {
  constructor() {
    // In-memory cache for quick access
    this.chatHistory = new Map(); // JID -> Array of messages
    this.maxMemory = 50; // Store last 50 messages per chat
  }

  // Add message to memory
  addMessage(jid, role, text, senderName = "Anonymous") {
    if (!this.chatHistory.has(jid)) {
      this.chatHistory.set(jid, []);
    }

    const history = this.chatHistory.get(jid);
    history.push({
      role,
      text,
      senderName,
      timestamp: Date.now()
    });

    // Keep only last N messages
    if (history.length > this.maxMemory) {
      history.shift(); // Remove oldest
    }
  }

  // Get chat history for AI context
  getHistory(jid, limit = 10) {
    if (!this.chatHistory.has(jid)) {
      return [];
    }
    
    const history = this.chatHistory.get(jid);
    return history.slice(-limit); // Return last N messages
  }

  // Clear specific chat memory
  clearHistory(jid) {
    this.chatHistory.delete(jid);
  }

  // Get all active chats
  getAllChats() {
    return Array.from(this.chatHistory.keys());
  }

  // Get memory stats
  getStats(jid) {
    if (!this.chatHistory.has(jid)) {
      return { messages: 0, lastActivity: null };
    }
    
    const history = this.chatHistory.get(jid);
    return {
      messages: history.length,
      lastActivity: history[history.length - 1]?.timestamp || null
    };
  }
}

// Export singleton instance
const memoryManager = new MemoryManager();
module.exports = memoryManager;