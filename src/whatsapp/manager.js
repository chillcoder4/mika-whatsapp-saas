const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const path = require('path');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { admin } = require('../services/firebase-service');
const fs = require('fs');

// Store user sessions
const activeSessions = new Map(); // userId -> { sock }
const userSessions = activeSessions;
const pendingCredsSaves = new Map(); // userId -> Promise (tracks in-flight saveCreds)
const retryCounters = new Map(); // userId -> retry count for 405/403 errors
const MAX_INVALID_SESSION_RETRIES = 3;
let socketEmitter = null; // Function to emit to specific user

// Inject socket emitter from server
function setSocketEmitter(emitter) {
    socketEmitter = emitter;
}

// Restore all active sessions on server start
async function restoreSessions() {
    try {
        const sessionRoot = path.join(__dirname, '../../sessions');
        if (!fs.existsSync(sessionRoot)) {
            console.log('[Restore] No sessions directory found.');
            return;
        }

        const sessions = fs.readdirSync(sessionRoot);
        console.log(`[Restore] Found ${sessions.length} sessions to restore...`);

        for (const userId of sessions) {
            const sessionDir = path.join(sessionRoot, userId);
            // Check if folder is a directory with actual auth files
            if (fs.lstatSync(sessionDir).isDirectory()) {
                const files = fs.readdirSync(sessionDir);
                if (files.length === 0) {
                    console.log(`[Restore] Skipping empty session for ${userId}, removing stale folder.`);
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                    continue;
                }
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
            // Wait for any pending credential saves before destroying
            const pendingSave = pendingCredsSaves.get(userId);
            if (pendingSave) {
                console.log(`[User ${userId}] Waiting for pending creds save before destroy...`);
                await pendingSave.catch(() => {});
            }
            try { 
                existingSession.sock.ev.removeAllListeners(); 
                existingSession.sock.end(undefined);
            } catch (e) {}
            activeSessions.delete(userId);
        }

        const sessionPath = path.join(__dirname, '../../sessions', userId);
        
        // Create auth directory if doesn't exist
        if (!fs.existsSync(sessionPath)) {
            fs.mkdirSync(sessionPath, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);

        // Fetch latest WA Web version to avoid 405 protocol mismatch
        const { version } = await fetchLatestBaileysVersion();
        console.log(`[User ${userId}] Using WA Web version: ${version}`);

        // ─── Helper: create socket & wire up all listeners ───
        // Uses the SAME in-memory `state` and `saveCreds` from above.
        // Calling this again after a 515 preserves the pairing handshake
        // keys that haven't finished registration yet.
        function createSocketAndListen() {
            const sock = makeWASocket({
                auth: state,
                version,
                printQRInTerminal: false,
                syncFullHistory: false,
                markOnlineOnConnect: false
            });

            const { sanitizeJid } = require('../services/firebase-service');
            
            // Stable state variable for QR
            let currentQR = null;
            let isReconnecting = false;

            // Force cleanup of default listeners
            sock.ev.removeAllListeners('connection.update');
            sock.ev.removeAllListeners('messages.upsert');
            sock.ev.removeAllListeners('creds.update');

            // ─── Reconnect using the same in-memory state (for 515 etc.) ───
            function reconnectWithSameState() {
                console.log(`[User ${userId}] Reconnecting with SAME auth state (in-memory)...`);
                try {
                    sock.ev.removeAllListeners();
                    sock.end(undefined);
                } catch (e) {}

                // Create a brand-new socket but reuse the same `state` object
                const newSock = createSocketAndListen();
                activeSessions.set(userId, { sock: newSock });
            }

            // Connection events
            sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
                
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
                    
                    // 405 = Connection Failure (WhatsApp rejected old/invalid session creds)
                    // 440 = loggedOut from another device
                    // 401 = logged out
                    const isInvalidSession = statusCode === 405 || statusCode === 403;
                    const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 440;

                    console.log(`[User ${userId}] Connection closed: ${statusCode}`);

                    // Update status in Firebase
                    await admin.database().ref(`users/${userId}/whatsapp/status`).set('disconnected');
                    await admin.database().ref(`users/${userId}/whatsapp/connected`).set(false);
                    if (socketEmitter) socketEmitter(userId, 'whatsapp_status', 'disconnected');

                    if (isInvalidSession || isLoggedOut) {
                        // Session is bad — wipe it, restart fresh (will generate new QR)
                        console.log(`[User ${userId}] Session invalid/logged out (${statusCode}). Clearing session and restarting for fresh QR...`);
                        await admin.database().ref(`users/${userId}/whatsapp/status`).set('logged_out');
                        await admin.database().ref(`users/${userId}/whatsapp/qr`).set(null);
                        if (socketEmitter) socketEmitter(userId, 'whatsapp_status', 'logged_out');

                        try {
                            activeSessions.delete(userId);
                            if (fs.existsSync(sessionPath)) {
                                fs.rmSync(sessionPath, { recursive: true, force: true });
                                console.log(`[User ${userId}] Session files deleted.`);
                            }
                        } catch (e) { console.error('[Session Cleanup Error]', e); }

                        // Retry with limit to prevent infinite 405 loop
                        const currentRetries = (retryCounters.get(userId) || 0) + 1;
                        retryCounters.set(userId, currentRetries);

                        if (currentRetries >= MAX_INVALID_SESSION_RETRIES) {
                            console.log(`[User ${userId}] Max retries (${MAX_INVALID_SESSION_RETRIES}) reached for invalid session. Stopping. User must click Connect again.`);
                            retryCounters.delete(userId);
                            // Don't restart — user must click Connect manually
                        } else if (!isReconnecting) {
                            isReconnecting = true;
                            const delay = 3000 * currentRetries; // Increasing backoff
                            console.log(`[User ${userId}] Retry ${currentRetries}/${MAX_INVALID_SESSION_RETRIES} in ${delay/1000}s...`);
                            setTimeout(() => {
                                isReconnecting = false;
                                startWhatsApp(userId, phoneNumber);
                            }, delay);
                        }
                    } else {
                        // Normal disconnect (including 515 stream restart after pairing)
                        // CRITICAL: reuse the same in-memory auth state so the pairing
                        // handshake (registered=false -> true) can complete on reconnect.
                        if (isReconnecting) return;
                        isReconnecting = true;
                        const delayMs = 5000; // 5s to allow creds to flush after pairing
                        console.log(`[User ${userId}] Reconnecting in ${delayMs / 1000}s (reusing in-memory auth state)...`);
                        setTimeout(async () => {
                            // Wait for any pending credential saves before reconnecting
                            const pendingSave = pendingCredsSaves.get(userId);
                            if (pendingSave) {
                                console.log(`[User ${userId}] Waiting for credentials to save before reconnect...`);
                                await pendingSave.catch(() => {});
                            }
                            reconnectWithSameState();
                            isReconnecting = false;
                        }, delayMs);
                    }
                } else if (connection === 'open') {
                    console.log(`WhatsApp restored for ${userId}`);
                    console.log('WhatsApp restored successfully');
                    retryCounters.delete(userId); // Reset retry counter on success
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
                    await admin.database().ref(`users/${userId}/whatsapp/connected`).set(true);
                    await admin.database().ref(`users/${userId}/whatsapp/lastConnected`).set(Date.now());

                    const rawJid = sock.user?.id || 'Unknown';
                    await admin.database().ref(`users/${userId}/whatsapp/phoneNumber`).set(rawJid);
                    await admin.database().ref(`users/${userId}/profile`).update({
                        isOwner: true,
                        ownerUid: userId,
                        ownerWhatsApp: rawJid
                    });
                    
                    isReconnecting = false;
                }
            });

            // CRITICAL: Merge partial creds updates and persist.
            // Baileys emits 'creds.update' with a PARTIAL object (e.g. { me, account, ... }
            // after QR pairing). useMultiFileAuthState's saveCreds() just writes the
            // existing creds object — it does NOT merge the partial. So we must do it.
            sock.ev.on('creds.update', (update) => {
                // Merge partial update into the in-memory creds object
                if (update && typeof update === 'object') {
                    Object.assign(state.creds, update);
                    console.log(`[User ${userId}] Creds updated (keys: ${Object.keys(update).join(', ')})`);
                }

                // After QR pairing, Baileys sets me but never sets registered=true
                // (registered is only set for pairing CODE flow, not QR).
                // We must set it ourselves so reconnect after 515 doesn't show new QR.
                if (state.creds.me && !state.creds.registered) {
                    console.log(`[User ${userId}] Pairing detected (me=${state.creds.me.id}), setting registered=true`);
                    state.creds.registered = true;
                }

                const savePromise = saveCreds();
                pendingCredsSaves.set(userId, savePromise);
                savePromise
                    .then(() => console.log(`[User ${userId}] Credentials saved to disk`))
                    .catch(e => console.error(`[User ${userId}] Creds save error:`, e))
                    .finally(() => {
                        if (pendingCredsSaves.get(userId) === savePromise) {
                            pendingCredsSaves.delete(userId);
                        }
                    });
            });

            // 3. Handle Messages - EXPLICIT LISTENER
            sock.ev.on('messages.upsert', async (m) => {
                console.log(`[User ${userId}] messages.upsert fired (type: ${m.type})`);

                // Double check session validity
                if (activeSessions.get(userId)?.sock !== sock) {
                     return;
                }

                const { handleIncomingMessage } = require('./message-router');
                await handleIncomingMessage(userId, sock, m);
            });

            return sock;
        }

        // Create the initial socket
        const socket = createSocketAndListen();

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
