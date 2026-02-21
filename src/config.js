require('dotenv').config();
const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '../settings.json');

const runtimeConfig = {
    user_name: "",
    groq_api_key: "",
};

const defaultSettings = {
    bot_on: true,
    ai_mode: "romantic",
    reply_delay_min: 2000,
    reply_delay_max: 5000,
    allowed_groups: [],
    blocked_numbers: [],
    friends: [],
    family: [],
    ignore_private_chats: [], // NEW: Ignore specific private chats
    ignore_group_chats: [],  // NEW: Ignore specific groups
    unknown_behavior: "formal",
    cooldown_ms: 10000,
    disabled_chats: {},
    owner_name: "Jaswant Sir",
    owner_insta: "@jaswant_0707",
    system_prompt: "",
};

function loadSettings() {
    try {
        let settings = { ...defaultSettings };
        if (fs.existsSync(SETTINGS_PATH)) {
            const data = fs.readFileSync(SETTINGS_PATH, 'utf8');
            const diskSettings = JSON.parse(data);
            
            Object.keys(defaultSettings).forEach(key => {
                if (diskSettings.hasOwnProperty(key)) {
                    settings[key] = diskSettings[key];
                }
            });
        } else {
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaultSettings, null, 2));
        }

        // Migration: ensure new fields exist
        let needsUpdate = false;
        if (!settings.hasOwnProperty('ignore_private_chats')) {
            settings.ignore_private_chats = [];
            needsUpdate = true;
        }
        if (!settings.hasOwnProperty('ignore_group_chats')) {
            settings.ignore_group_chats = [];
            needsUpdate = true;
        }

        if (needsUpdate) {
            fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
        }

        return { ...settings, ...runtimeConfig };
    } catch (err) {
        console.error("Error loading settings:", err);
        return { ...defaultSettings, ...runtimeConfig };
    }
}

function updateSettings(newSettings) {
    if (newSettings.hasOwnProperty('groq_api_key')) {
        runtimeConfig.groq_api_key = newSettings.groq_api_key;
    }
    if (newSettings.hasOwnProperty('user_name')) {
        runtimeConfig.user_name = newSettings.user_name;
    }

    const current = loadSettings();
    const updatedPersistent = {};
    
    Object.keys(defaultSettings).forEach(key => {
        if (newSettings.hasOwnProperty(key)) {
            updatedPersistent[key] = newSettings[key];
        } else {
            updatedPersistent[key] = current[key];
        }
    });

    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(updatedPersistent, null, 2));
    return { ...updatedPersistent, ...runtimeConfig };
}

function toggleChatAI(jid, enabled) {
    const settings = loadSettings();
    const isGroup = jid.endsWith('@g.us');
    
    if (isGroup) {
        if (!settings.allowed_groups) settings.allowed_groups = [];
        if (enabled) {
            if (!settings.allowed_groups.includes(jid)) settings.allowed_groups.push(jid);
        } else {
            settings.allowed_groups = settings.allowed_groups.filter(id => id !== jid);
        }
    } else {
        if (!settings.disabled_chats) settings.disabled_chats = {};
        if (enabled) {
            delete settings.disabled_chats[jid];
        } else {
            settings.disabled_chats[jid] = true;
        }
    }
    updateSettings(settings);
}

function isChatEnabled(jid) {
    const settings = loadSettings();
    const isGroup = jid.endsWith('@g.us');
    
    // Check ignore lists first
    if (isGroup && settings.ignore_group_chats?.includes(jid)) {
        return false;
    }
    if (!isGroup && settings.ignore_private_chats?.includes(jid)) {
        return false;
    }
    
    // Original logic
    if (isGroup) {
        return (settings.allowed_groups || []).includes(jid);
    } else {
        return !((settings.disabled_chats || {})[jid]);
    }
}

function addIgnoredChat(jid, type) {
    const settings = loadSettings();
    
    if (type === 'private') {
        if (!settings.ignore_private_chats) settings.ignore_private_chats = [];
        if (!settings.ignore_private_chats.includes(jid)) {
            settings.ignore_private_chats.push(jid);
        }
    } else if (type === 'group') {
        if (!settings.ignore_group_chats) settings.ignore_group_chats = [];
        if (!settings.ignore_group_chats.includes(jid)) {
            settings.ignore_group_chats.push(jid);
        }
    }
    
    updateSettings(settings);
}

function removeIgnoredChat(jid) {
    const settings = loadSettings();
    
    if (settings.ignore_private_chats) {
        settings.ignore_private_chats = settings.ignore_private_chats.filter(id => id !== jid);
    }
    if (settings.ignore_group_chats) {
        settings.ignore_group_chats = settings.ignore_group_chats.filter(id => id !== jid);
    }
    
    updateSettings(settings);
}

module.exports = {
    env: process.env,
    loadSettings,
    updateSettings,
    toggleChatAI,
    isChatEnabled,
    addIgnoredChat,
    removeIgnoredChat,
    SETTINGS_PATH
};