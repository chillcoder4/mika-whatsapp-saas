const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { admin } = require('../services/firebase-service');
const fs = require('fs');

// Store user sessions
const activeSessions = new Map(); // userId -> { sock }
const userSessions = activeSessions;
let socketEmitter = null; // Function to emit to specific user

// Inject socket emitter from server
function setSocketEmitter(emitter) {
    socketEmitter = emitter;
}

// Restore all active sessions on server start
async function restoreSessions() {
    try {
        const sessionRoot = path.join(process.cwd(), 'sessions');
        if (!fs.existsSync(sessionRoot)) {
            console.log('[Restore] No sessions directory found.');
            return;
        }

        const sessions = fs.readdirSync(sessionRoot);
        console.log(`[Restore] Found ${sessions.length} sessions to restore...`);

        for (const userId of sessions) {
            // Check if folder is a directory
            if (fs.lstatSync(path.join(sessionRoot, userId)).isDirectory()) {
                console.log(`Restoring session for ${userId}`);
                await startWhatsApp(userId);
            }
        }
    } catch (error) {
        console.error('[Restore] Error restoring sessions:', error);
    }
}

async function startWhatsApp(userId, phoneNumber) {
    try {
        // 🚨 SESSION STABILITY: If session already exists, destroy first
        const existingSession = activeSessions.get(userId);
        if (existingSession?.sock) {
            console.log(`[User ${userId}] Destroying existing session before recreation...`);
            try { 
                existingSession.sock.ev.removeAllListeners(); 
                existingSession.sock.end(undefined);
            } catch (e) {}
            activeSessions.delete(userId);
        }

        const sessionPath = path.join(process.cwd(), 'sessions', userId);
        
        // Create auth directory if doesn't exist
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        const socket = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['JoyzBot', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        const { sanitizeJid } = require('../services/firebase-service');
        
        // Stable state variable for QR
        let currentQR = null;
        let isReconnecting = false;

        // Force cleanup of default listeners
        socket.ev.removeAllListeners('connection.update');
        socket.ev.removeAllListeners('messages.upsert');
        socket.ev.removeAllListeners('creds.update');

        // Connection events
        socket.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
            
            // 1. Handle QR
            if (qr) {
                currentQR = qr;
                console.log(`[User ${userId}] QR code generated`);
                
                // Emit to Frontend
                if (socketEmitter) {
                    try {
                        const url = await QRCode.toDataURL(qr);
                        socketEmitter(userId, 'qr', url);
                    } catch (e) { console.error('QR Gen Error', e); }
                }

                // Save to Firebase
                await admin.database().ref(`users/${userId}/whatsapp/qr`).set(qr);
                
                // Terminal QR
                qrcode.generate(qr, { small: true });
            }

            // 2. Handle Connection State
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                console.log(`[User ${userId}] Connection closed:`, statusCode);
                
                // Update status in Firebase
                await admin.database().ref(`users/${userId}/whatsapp/status`).set('disconnected');
                await admin.database().ref(`users/${userId}/whatsapp/connected`).set(false); // ADDED
                if (socketEmitter) socketEmitter(userId, 'whatsapp_status', 'disconnected');

                if (shouldReconnect) {
                    if (isReconnecting) return;
                    isReconnecting = true;

                    const delayMs = 3000;
                    console.log(`[User ${userId}] Reconnecting in ${delayMs / 1000}s...`);
                    
                    setTimeout(() => {
                        startWhatsApp(userId, phoneNumber);
                        isReconnecting = false;
                    }, delayMs);
                } else {
                    console.log(`[User ${userId}] Logged out. Cleaning up...`);
                    await admin.database().ref(`users/${userId}/whatsapp/status`).set('logged_out');
                    if (socketEmitter) socketEmitter(userId, 'whatsapp_status', 'logged_out');
                    
                    // Clear QR
                    await admin.database().ref(`users/${userId}/whatsapp/qr`).set(null);
                    
                    try {
                        // Delete session on explicit logout
                        activeSessions.delete(userId);
                        if (fs.existsSync(sessionPath)) {
                             fs.rmSync(sessionPath, { recursive: true, force: true });
                        }
                    } catch (e) {}
                }
            } else if (connection === 'open') {
                console.log(`WhatsApp restored for ${userId}`);
                console.log('WhatsApp restored successfully');
                const { clearProcessedMessages } = require('./message-router');
                clearProcessedMessages();
                
                // CLEAR QR on success
                currentQR = null;
                await admin.database().ref(`users/${userId}/whatsapp/qr`).set(null);
                
                // Notify Frontend
                if (socketEmitter) {
                    socketEmitter(userId, 'qr', null); // Hide QR
                    socketEmitter(userId, 'whatsapp_status', 'connected');
                }

                await admin.database().ref(`users/${userId}/whatsapp/status`).set('connected');
                await admin.database().ref(`users/${userId}/whatsapp/connected`).set(true); // ADDED
                await admin.database().ref(`users/${userId}/whatsapp/lastConnected`).set(Date.now()); // ADDED

                const rawJid = socket.user?.id || 'Unknown';
                await admin.database().ref(`users/${userId}/whatsapp/phoneNumber`).set(rawJid);
                await admin.database().ref(`users/${userId}/profile`).update({
                    isOwner: true,
                    ownerUid: userId,
                    ownerWhatsApp: rawJid
                });
                
                isReconnecting = false;
            }
        });

        // CRITICAL: Attach creds update listener
        socket.ev.on('creds.update', saveCreds);

        // 3. Handle Messages - EXPLICIT LISTENER
        socket.ev.on('messages.upsert', async (m) => {
            console.log(`[User ${userId}] messages.upsert fired (type: ${m.type})`);

            // Double check session validity
            if (activeSessions.get(userId)?.sock !== socket) {
                 return;
            }

            const { handleIncomingMessage } = require('./message-router');
            await handleIncomingMessage(userId, socket, m);
        });

        // Store session
        activeSessions.set(userId, { sock: socket });

        return socket;

    } catch (error) {
        console.error(`[User ${userId}] Error creating WhatsApp session:`, error);
        throw error;
    }
}

async function createWhatsAppSession(userId, phoneNumber) {
    return startWhatsApp(userId, phoneNumber);
}

// Get existing session
function getSession(userId) {
    return activeSessions.get(userId)?.sock;
}

// Get QR code for user (as data URL)
async function getQRForUser(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/whatsapp/qr`).once('value');
        const qrData = snapshot.val();
        
        if (!qrData) return null;
        
        return await QRCode.toDataURL(qrData);
    } catch (error) {
        console.error('[QR Service] Error:', error);
        return null;
    }
}

// Get user WhatsApp status
async function getUserWhatsAppStatus(userId) {
    try {
        const snapshot = await admin.database().ref(`users/${userId}/whatsapp/status`).once('value');
        return snapshot.val() || 'not_connected';
    } catch (error) {
        return 'error';
    }
}

// Disconnect user session
async function disconnectUser(userId) {
    try {
        const socket = activeSessions.get(userId)?.sock;
        if (socket) {
            await socket.logout();
            activeSessions.delete(userId);
            await admin.database().ref(`users/${userId}/whatsapp/status`).set('logged_out');
            if (socketEmitter) socketEmitter(userId, 'whatsapp_status', 'logged_out');
            console.log(`[User ${userId}] Disconnected`);
        }
        return { success: true };
    } catch (error) {
        console.error(`[User ${userId}] Disconnect error:`, error);
        return { success: false, error };
    }
}

module.exports = {
    startWhatsApp,
    createWhatsAppSession,
    getSession,
    getQRForUser,
    getUserWhatsAppStatus,
    disconnectUser,
    userSessions,
    activeSessions,
    restoreSessions,
    setSocketEmitter
};
