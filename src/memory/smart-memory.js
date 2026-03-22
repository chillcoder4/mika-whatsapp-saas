const { getSmartMemory, updateSmartMemory } = require('../services/firebase-service');

function normalizeText(text = '') {
    return text.trim();
}

function detectMood(text) {
    const lower = text.toLowerCase();
    if (/(happy|khush|great|awesome|excited)/i.test(lower)) return 'Happy';
    if (/(sad|upset|dukhi|down|depressed)/i.test(lower)) return 'Sad';
    if (/(angry|gussa|annoyed|frustrated)/i.test(lower)) return 'Angry';
    if (/(tired|thak|sleepy|exhausted)/i.test(lower)) return 'Tired';
    if (/(stressed|pressure|overwhelmed)/i.test(lower)) return 'Stressed';
    return '';
}

function detectVibe(text) {
    const lower = text.toLowerCase();
    if (/(love|miss you|baby|jaan|sweet|cute|kiss|hug|romance|darling)/i.test(lower)) return 'Romantic';
    if (/(hahaha|lol|lmao|joke|rofl|😂|🤣|funny|meme)/i.test(lower)) return 'Funny / Playful';
    if (/(sir|madam|respect|request|kindly|please update|report|official)/i.test(lower)) return 'Professional';
    if (/(wtf|fuck|idiot|stupid|kutta|bc|mc|hate|irritate|gussa|angry)/i.test(lower)) return 'Angry / Savage';
    if (/(sad|dukhi|cry|hurt|pain|lonely|depressed|😭|broken)/i.test(lower)) return 'Sad / Stressed';
    return 'Casual / Friendly'; // default
}

function extractPreference(text) {
    const match = text.match(/\b(i|me)\s+(like|love|prefer|enjoy|hate)\s+(.+)/i);
    if (!match) return '';
    const verb = match[2].toLowerCase();
    const obj = match[3].replace(/[.!?]+$/, '').trim();
    if (!obj) return '';
    return `${verb} ${obj}`;
}

function extractName(text) {
    const match = text.match(/\bmy name is\s+([A-Za-z][A-Za-z0-9_\-\s]+)/i);
    if (!match) return '';
    return match[1].trim();
}

function extractRelationship(text) {
    const match = text.match(/\b(i am|i'm|im)\s+(your\s+)?(friend|brother|sister|client|boss|teacher|student|partner)\b/i);
    if (!match) return '';
    return match[3].toLowerCase();
}

function buildLastTopic(text) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

async function updateSmartMemoryFromMessage(userId, chatJid, role, text, senderName = '', isOwnerMessage = false) {
    if (!text) return;
    if (role !== 'user') return;

    const normalized = normalizeText(text);
    if (!normalized) return;

    const existing = await getSmartMemory(userId, chatJid);
    const updates = {};

    const detectedMood = detectMood(normalized);
    if (detectedMood) updates.mood = detectedMood;

    const detectedVibe = detectVibe(normalized);
    if (detectedVibe && detectedVibe !== 'Casual / Friendly') updates.vibe = detectedVibe;
    else if (!existing?.vibe) updates.vibe = 'Casual / Friendly';

    const relationship = extractRelationship(normalized);
    if (relationship) updates.relationship = relationship;

    const preference = extractPreference(normalized);
    if (preference) {
        const prevSummary = existing?.summary ? `${existing.summary} ` : '';
        const entry = `Prefers: ${preference}.`;
        updates.summary = `${prevSummary}${entry}`.trim().slice(0, 240);
    }

    const name = extractName(normalized);
    if (name) {
        const prevSummary = existing?.summary ? `${existing.summary} ` : '';
        const entry = `Name: ${name}.`;
        updates.summary = `${prevSummary}${entry}`.trim().slice(0, 240);
    }

    if (isOwnerMessage) {
        updates.ownerCommand = normalized.slice(0, 200);
    }

    updates.lastTopic = buildLastTopic(normalized);
    updates.lastSpeaker = senderName || 'User';

    if (Object.keys(updates).length > 0) {
        await updateSmartMemory(userId, chatJid, updates);
    }
}

module.exports = {
    updateSmartMemoryFromMessage
};
