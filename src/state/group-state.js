const activeGroups = new Map();

function getGroupKey(userId, groupId) {
    return `${userId}:${groupId}`;
}

async function activateGroup(userId, groupId, durationMinutes, warnCallback, endCallback, vibe = null) {
    const key = getGroupKey(userId, groupId);

    // Clear existing timeouts if we are extending
    if (activeGroups.has(key)) {
        const existing = activeGroups.get(key);
        clearTimeout(existing.warnTimeout);
        clearTimeout(existing.endTimeout);
    }

    const startTime = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    const warnMs = durationMs - 30000; // 30 seconds before end

    const state = {
        activeUntil: startTime + durationMs,
        warnTimeout: null,
        endTimeout: null,
        vibe: vibe
    };

    if (warnMs > 0) {
        state.warnTimeout = setTimeout(() => {
            if (activeGroups.has(key)) warnCallback();
        }, warnMs);
    }

    state.endTimeout = setTimeout(() => {
        activeGroups.delete(key);
        if (endCallback) endCallback();
    }, durationMs);

    activeGroups.set(key, state);
}

function isGroupActive(userId, groupId) {
    const key = getGroupKey(userId, groupId);
    if (!activeGroups.has(key)) return false;

    const state = activeGroups.get(key);
    if (Date.now() > state.activeUntil) {
        activeGroups.delete(key);
        return false;
    }

    return true;
}

function deactivateGroup(userId, groupId) {
    const key = getGroupKey(userId, groupId);
    if (activeGroups.has(key)) {
        const state = activeGroups.get(key);
        clearTimeout(state.warnTimeout);
        clearTimeout(state.endTimeout);
        activeGroups.delete(key);
    }
}

function getGroupVibe(userId, groupId) {
    const key = getGroupKey(userId, groupId);
    if (!activeGroups.has(key)) return null;
    return activeGroups.get(key).vibe;
}

function setGroupVibe(userId, groupId, vibe) {
    const key = getGroupKey(userId, groupId);
    if (activeGroups.has(key)) {
        activeGroups.get(key).vibe = vibe;
    }
}

module.exports = {
    activateGroup,
    isGroupActive,
    deactivateGroup,
    getGroupVibe,
    setGroupVibe
};
