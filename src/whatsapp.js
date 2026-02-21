const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const { handleMessage } = require('./messageHandler');
const qrcode = require('qrcode-terminal'); // For terminal
const QRCode = require('qrcode'); // For web
const botEmitter = require('./events');
const fs = require('fs');

const AUTH_PATH = path.join(process.cwd(), 'sessions', 'single');

let qrCodeData = ""; // Store latest QR for web view
let sock = null;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_PATH);

    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false, // We handle it manually
        auth: state,
        // Removed custom browser to use default Baileys signature
        connectTimeoutMs: 60000, 
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000,
        emitOwnEvents: true,
        retryRequestDelayMs: 250
    });


    let isReconnecting = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = qr;
            botEmitter.emit('qr', qr);
            qrcode.generate(qr, { small: true }); 
            console.log('Scan the QR code above to login!');
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            const isStreamError = statusCode === 515; // Stream Errored

            botEmitter.emit('status', '❌ Disconnected');
            
            // Log only relevant errors, ignore 515 spam
            if (!isStreamError) {
                console.log('Connection closed:', lastDisconnect.error);
            } else {
                console.log('Stream Sync Error (515) - recovering...');
            }

            if (shouldReconnect) {
                if (isReconnecting) return; // Prevent duplicate attempts
                isReconnecting = true;

                // Debounce restart
                const delayMs = isStreamError ? 3000 : 2000;
                console.log(`Reconnecting in ${delayMs/1000}s...`);
                
                setTimeout(() => {
                    startWhatsApp();
                    isReconnecting = false;
                }, delayMs);
            } else {
                botEmitter.emit('status', '🛑 Logged Out');
                console.log("Logged out. Please delete auth_info_baileys and restart.");
            }
        } else if (connection === 'open') {
            console.log('✅ Connected to WhatsApp!');
            botEmitter.emit('status', '✅ Connected');
            botEmitter.emit('qr', null); 
            qrCodeData = ""; 
            isReconnecting = false;
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        await handleMessage(sock, m);
    });

    return sock;
}

// Function to get QR for web
function getQR() {
    return qrCodeData;
}

async function getQRImage() {
    if (!qrCodeData) return null;
    try {
        return await QRCode.toDataURL(qrCodeData);
    } catch (err) {
        console.error(err);
        return null;
    }
}

// Function to get socket for dashboard
function getSocket() {
    return sock;
}

module.exports = { startWhatsApp, getQR, getQRImage, getSocket };
