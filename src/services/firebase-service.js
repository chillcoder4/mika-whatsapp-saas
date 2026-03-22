const admin = require('firebase-admin');

// Firebase Configuration - Read dynamically from env variables
const getFirebaseConfig = () => ({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
});

// Utility to sanitize JID for Firebase paths (removes invalid characters)
function sanitizeJid(jid) {
    if (!jid) return 'unknown';
    return jid.replace(/[.#$[\]@]/g, '_');
}

// Initialize Firebase Admin
function initializeFirebase() {
    try {
        // Handle common .env formatting issues for private keys
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (privateKey) {
            // Replace literal \n with real newlines
            privateKey = privateKey.replace(/\\n/g, '\n');
            // Remove extra quotes if present
            if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
                privateKey = privateKey.substring(1, privateKey.length - 1);
            }
        }

        const serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey
        };

        const missing = [];
        if (!serviceAccount.projectId) missing.push('FIREBASE_PROJECT_ID');
        if (!serviceAccount.clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
        if (!serviceAccount.privateKey) missing.push('FIREBASE_PRIVATE_KEY');

        if (missing.length === 0) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: getFirebaseConfig().databaseURL
            });
            console.log('✅ Firebase initialized with Service Account (Full Admin Access)');
        } else {
            // Fallback for purely database operations if Rules allow
            admin.initializeApp({
                databaseURL: getFirebaseConfig().databaseURL
            });
            console.log('⚠️  Firebase initialized without Service Account (Restricted Access)');
            console.log(`👉 Missing variables for Auth: ${missing.join(', ')}`);
        }

        return true;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error.message);
        return false;
    }
}

// User Management
async function createUser(email, password, displayName) {
    try {
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName
        });
        return { success: true, uid: userRecord.uid };
    } catch (error) {
        console.error('Create user error:', error);
        return { success: false, error: error.message };
    }
}

async function verifyUser(email) {
    // Note: Firebase Admin SDK cannot verify passwords server-side.
    // Client SDK must handle actual authentication.
    try {
        const user = await admin.auth().getUserByEmail(email);
        return { success: true, uid: user.uid };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Settings Management
async function getUserSettings(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/settings`).once('value');
        return snapshot.val() || {
            bot_on: true,
            ai_mode: 'casual',
            ignore_private_chats: [],
            ignore_group_chats: []
        };
    } catch (error) {
        console.error('Get settings error:', error);
        return {
            bot_on: true,
            ai_mode: 'casual',
            ignore_private_chats: [],
            ignore_group_chats: []
        };
    }
}

async function updateUserSettings(userId, settings) {
    try {
        await admin.database().ref(`users/${userId}/settings`).update(settings);
        return { success: true };
    } catch (error) {
        console.error('Update settings error:', error);
        return { success: false, error: error.message };
    }
}

// WhatsApp Session Management
async function saveWhatsAppCredentials(userId, creds) {
    try {
        await admin.database().ref(`users/${userId}/whatsapp/credentials`).set(creds);
        return { success: true };
    } catch (error) {
        console.error('Save WhatsApp creds error:', error);
        return { success: false, error: error.message };
    }
}

async function getWhatsAppCredentials(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/whatsapp/credentials`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Get WhatsApp creds error:', error);
        return null;
    }
}

async function updateWhatsAppStatus(userId, status) {
    try {
        await admin.database().ref(`users/${userId}/whatsapp/status`).set({
            connected: status,
            lastUpdate: Date.now()
        });
        return { success: true };
    } catch (error) {
        console.error('Update WhatsApp status error:', error);
        return { success: false, error: error.message };
    }
}

// Profile Management
async function getUserProfile(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/profile`).once('value');
        return snapshot.val() || {};
    } catch (error) {
        console.error('Get profile error:', error);
        return {};
    }
}

async function updateUserProfile(userId, profileUpdates) {
    try {
        await admin.database().ref(`users/${userId}/profile`).update(profileUpdates);
        return { success: true };
    } catch (error) {
        console.error('Update profile error:', error);
        return { success: false, error: error.message };
    }
}

// Smart Memory Management
async function getSmartMemory(userId, chatJid) {
    try {
        const safeJid = sanitizeJid(chatJid);
        const snapshot = await admin.database().ref(`users/${userId}/smartMemory/${safeJid}`).once('value');
        return snapshot.val() || null;
    } catch (error) {
        console.error('Get smart memory error:', error);
        return null;
    }
}

async function updateSmartMemory(userId, chatJid, updates) {
    try {
        const safeJid = sanitizeJid(chatJid);
        await admin.database().ref(`users/${userId}/smartMemory/${safeJid}`).update({
            chatJid,
            ...updates,
            updatedAt: Date.now()
        });
        return { success: true };
    } catch (error) {
        console.error('Update smart memory error:', error);
        return { success: false, error: error.message };
    }
}

async function addSmartMemoryImportantPoint(userId, chatJid, text, senderName = '') {
    try {
        const safeJid = sanitizeJid(chatJid);
        const ref = admin.database().ref(`users/${userId}/smartMemory/${safeJid}/importantPoints`);
        await ref.push({
            text,
            senderName,
            timestamp: Date.now()
        });
        await admin.database().ref(`users/${userId}/smartMemory/${safeJid}`).update({
            chatJid,
            updatedAt: Date.now()
        });
        return { success: true };
    } catch (error) {
        console.error('Add important point error:', error);
        return { success: false, error: error.message };
    }
}

async function listSmartMemoryChats(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/smartMemory`).once('value');
        const data = snapshot.val();
        if (!data) return [];

        return Object.entries(data).map(([safeJid, memory]) => ({
            chatJid: memory?.chatJid || safeJid,
            lastTopic: memory?.lastTopic || '',
            relationship: memory?.relationship || '',
            mood: memory?.mood || '',
            updatedAt: memory?.updatedAt || 0
        })).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    } catch (error) {
        console.error('List smart memory error:', error);
        return [];
    }
}

// Wait Timer Management (Pause System)
async function setPauseTimer(userId, chatJid, minutes) {
    try {
        const safeJid = sanitizeJid(chatJid);
        const endTime = Date.now() + (minutes * 60 * 1000);
        await admin.database().ref(`users/${userId}/waitTimers/${safeJid}`).set({
            pausedUntil: endTime,
            minutes: minutes
        });
        return { success: true, pausedUntil: endTime };
    } catch (error) {
        console.error('Set pause timer error:', error);
        return { success: false, error: error.message };
    }
}

async function isChatPaused(userId, chatJid) {
    try {
        const safeJid = sanitizeJid(chatJid);
        const snapshot = await admin.database().ref(`users/${userId}/waitTimers/${safeJid}`).once('value');
        const data = snapshot.val();
        
        if (!data) return false;
        
        // Check if timer expired
        if (Date.now() > data.pausedUntil) {
            // Clean up expired timer
            await admin.database().ref(`users/${userId}/waitTimers/${safeJid}`).remove();
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Check pause error:', error);
        return false;
    }
}

async function clearPauseTimer(userId, chatJid) {
    try {
        const safeJid = sanitizeJid(chatJid);
        await admin.database().ref(`users/${userId}/waitTimers/${safeJid}`).remove();
        return { success: true };
    } catch (error) {
        console.error('Clear pause error:', error);
        return { success: false, error: error.message };
    }
}

async function getPauseTimer(userId, chatJid) {
    try {
        const safeJid = sanitizeJid(chatJid);
        const snapshot = await admin.database().ref(`users/${userId}/waitTimers/${safeJid}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Get pause timer error:', error);
        return null;
    }
}

// Chat List Management
async function getUserChats(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/memory`).once('value');
        const memoryData = snapshot.val();
        
        if (!memoryData) return [];
        
        const chats = [];
        for (const chatJid in memoryData) {
            const safeJid = sanitizeJid(chatJid);
            const messagesSnapshot = await admin.database().ref(`users/${userId}/memory/${safeJid}/messages`).limitToLast(1).once('value');
            const lastMessage = messagesSnapshot.val();
            const lastMessageData = lastMessage ? Object.values(lastMessage)[0] : null;
            
            chats.push({
                jid: chatJid,
                isGroup: chatJid.endsWith('@g.us'),
                lastMessage: lastMessageData?.text || '',
                lastTimestamp: lastMessageData?.timestamp || 0
            });
        }
        
        return chats.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    } catch (error) {
        console.error('Get chats error:', error);
        return [];
    }
}

async function getChatHistory(userId, chatJid, limit = 50) {
    try {
        const safeJid = sanitizeJid(chatJid);
        const snapshot = await admin.database().ref(`users/${userId}/memory/${safeJid}/messages`)
            .limitToLast(limit)
            .once('value');
        
        const messages = [];
        snapshot.forEach(child => {
            messages.push(child.val());
        });
        
        return messages;
    } catch (error) {
        console.error('Get chat history error:', error);
        return [];
    }
}

async function saveMessage(userId, chatJid, role, text, senderName = '') {
    try {
        const safeJid = sanitizeJid(chatJid);
        await admin.database().ref(`users/${userId}/memory/${safeJid}/messages`).push({
            role,
            text,
            senderName,
            timestamp: Date.now()
        });
        return { success: true };
    } catch (error) {
        console.error('Save message error:', error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    initializeFirebase,
    admin,
    sanitizeJid,
    createUser,
    verifyUser,
    getUserSettings,
    updateUserSettings,
    getUserProfile,
    updateUserProfile,
    saveWhatsAppCredentials,
    getWhatsAppCredentials,
    updateWhatsAppStatus,
    setPauseTimer,
    isChatPaused,
    clearPauseTimer,
    getPauseTimer,
    getSmartMemory,
    updateSmartMemory,
    addSmartMemoryImportantPoint,
    listSmartMemoryChats,
    getUserChats,
    getChatHistory,
    saveMessage,
    getFirebaseConfig
};
