const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { authenticateUser } = require('../middleware/auth');
const { getSession, createWhatsAppSession, restoreSessions, setSocketEmitter } = require('../whatsapp/manager');
const { admin, getFirebaseConfig } = require('../services/firebase-service');
const { loadSmartMemory, loadSmartMemoryChats } = require('../memory/loader');
const tempMemory = require('../memory/temp-memory');
const { generateAIResponse } = require('../ai/generator');
const { getLiveTime } = require('../utils/time');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// Store active rooms for socket.io
const activeRooms = new Map(); // userId -> Set of socket IDs

// Socket Authentication Middleware
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error'));
        }
        
        const decodedToken = await admin.auth().verifyIdToken(token, true);
        socket.user = decodedToken;
        next();
    } catch (err) {
        console.error('[Socket Auth Error]', err.code);
        next(new Error('Authentication error'));
    }
});

// Socket connection
io.on('connection', (socket) => {
    console.log('New socket connection:', socket.id);

    socket.on('join_user', (userId) => {
        if (activeRooms.has(userId)) {
            activeRooms.get(userId).add(socket.id);
        } else {
            activeRooms.set(userId, new Set([socket.id]));
        }
        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined user ${userId}`);
    });

    socket.on('leave_user', (userId) => {
        socket.leave(`user:${userId}`);
        activeRooms.get(userId)?.delete(socket.id);
        if (activeRooms.get(userId)?.size === 0) {
            activeRooms.delete(userId);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
    });
});

// Helper to emit to user's room
function emitToUser(userId, event, data) {
    io.to(`user:${userId}`).emit(event, data);
}

// Wire socket emitter into WhatsApp manager so QR/status events reach frontend
setSocketEmitter(emitToUser);

// Login/Signup is handled client-side via Firebase SDK
// Backend just provides static pages and API protection

// Logout
app.post('/api/auth/logout', authenticateUser, (req, res) => {
    try {
        // Firebase logout is handled client-side
        // Backend doesn't need to do much here since tokens are stateless
        res.json({ success: true, message: 'Logged out successfully' });
        
    } catch (error) {
        console.error('[Logout Error]', error);
        res.status(500).json({ success: false, error: 'Logout failed' });
    }
});

// Get Firebase Client Config for frontend logic
app.get('/api/firebase-config', (req, res) => {
    res.json(getFirebaseConfig());
});

// ================= USER ROUTES =================

// Get user info
app.get('/api/user/info', authenticateUser, async (req, res) => {
    try {
        const { uid } = req.user;
        const { getUserProfile } = require('../services/firebase-service');
        const profile = await getUserProfile(uid);
        
        res.json({ 
            success: true, 
            user: {
                uid: uid,
                email: req.user.email,
                name: profile?.name || 'User'
            } 
        });
        
    } catch (error) {
        console.error('[Get User Info Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get user info' });
    }
});

// Live time for dashboard
app.get('/api/time', authenticateUser, (req, res) => {
    res.json({ success: true, time: getLiveTime() });
});

// ================= WHATSAPP ROUTES =================

// Create WhatsApp session (scan QR)
app.post('/api/whatsapp/connect', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const { phoneNumber } = req.body;

        // Create session
        await createWhatsAppSession(userId, phoneNumber);

        res.json({ success: true, message: 'WhatsApp session created' });
        
    } catch (error) {
        console.error('[WhatsApp Connect Error]', error);
        res.status(500).json({ success: false, error: 'Failed to create WhatsApp session' });
    }
});

// Get QR code
app.get('/api/whatsapp/qr', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const { getQRForUser } = require('../whatsapp/manager');
        
        const qrImage = await getQRForUser(userId);
        
        if (!qrImage) {
            return res.json({ success: false, qr: null });
        }

        res.json({ success: true, qr: qrImage });
        
    } catch (error) {
        console.error('[Get QR Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get QR code' });
    }
});

// Get WhatsApp status
app.get('/api/whatsapp/status', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const { getUserWhatsAppStatus } = require('../whatsapp/manager');
        
        const status = await getUserWhatsAppStatus(userId);

        res.json({ success: true, status });
        
    } catch (error) {
        console.error('[WhatsApp Status Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get status' });
    }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const { disconnectUser } = require('../whatsapp/manager');
        
        const result = await disconnectUser(userId);

        res.json(result);
        
    } catch (error) {
        console.error('[WhatsApp Disconnect Error]', error);
        res.status(500).json({ success: false, error: 'Failed to disconnect' });
    }
});

// ================= SETTINGS ROUTES =================

// Get settings
app.get('/api/settings', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { getUserSettings } = require('../services/firebase-service');
        
        const settings = await getUserSettings(userId);

        res.json({
            success: true,
            settings: settings
        });
        
    } catch (error) {
        console.error('[Get Settings Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get settings' });
    }
});

// Update settings
app.post('/api/settings', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { updateUserSettings } = require('../services/firebase-service');
        
        const updates = {};
        
        // Update other settings
        if (req.body.ai_mode) updates.ai_mode = req.body.ai_mode;
        if (req.body.bot_on !== undefined) updates.bot_on = req.body.bot_on;
        if (req.body.ignore_private_chats) updates.ignore_private_chats = req.body.ignore_private_chats;
        if (req.body.ignore_group_chats) updates.ignore_group_chats = req.body.ignore_group_chats;
        if (req.body.ignorePrivate) updates.ignorePrivate = req.body.ignorePrivate;
        if (req.body.ignoreGroups) updates.ignoreGroups = req.body.ignoreGroups;
        
        if (Object.keys(updates).length > 0) {
            await updateUserSettings(userId, updates);
        }

        res.json({ success: true, message: 'Settings updated' });
        
    } catch (error) {
        console.error('[Update Settings Error]', error);
        res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
});

// ================= IGNORE LIST ROUTES =================

app.get('/api/ignore-list', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const { getUserSettings } = require('../services/firebase-service');
        const settings = await getUserSettings(userId);

        const privateList = settings.ignorePrivate || settings.ignore_private_chats || [];
        const groupList = settings.ignoreGroups || settings.ignore_group_chats || [];
        res.json({
            success: true,
            private: privateList,
            groups: groupList
        });
    } catch (error) {
        console.error('[Get Ignore List Error]', error);
        res.status(500).json({ success: false, error: 'Failed to load ignore list' });
    }
});

app.delete('/api/ignore/private/:jid', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const jid = decodeURIComponent(req.params.jid || '');
        const settingsRef = admin.database().ref(`users/${userId}/settings`);
        const snapshot = await settingsRef.once('value');
        const settings = snapshot.val() || {};
        const currentNew = Array.isArray(settings.ignorePrivate) ? settings.ignorePrivate : [];
        const currentOld = Array.isArray(settings.ignore_private_chats) ? settings.ignore_private_chats : [];
        const updatedNew = currentNew.filter(item => item !== jid);
        const updatedOld = currentOld.filter(item => item !== jid);
        await settingsRef.update({ ignorePrivate: updatedNew, ignore_private_chats: updatedOld });
        res.json({ success: true, private: updatedNew });
    } catch (error) {
        console.error('[Delete Ignore Private Error]', error);
        res.status(500).json({ success: false, error: 'Failed to update ignore list' });
    }
});

app.delete('/api/ignore/group/:jid', authenticateUser, async (req, res) => {
    try {
        const userId = req.user.uid;
        const jid = decodeURIComponent(req.params.jid || '');
        const settingsRef = admin.database().ref(`users/${userId}/settings`);
        const snapshot = await settingsRef.once('value');
        const settings = snapshot.val() || {};
        const currentNew = Array.isArray(settings.ignoreGroups) ? settings.ignoreGroups : [];
        const currentOld = Array.isArray(settings.ignore_group_chats) ? settings.ignore_group_chats : [];
        const updatedNew = currentNew.filter(item => item !== jid);
        const updatedOld = currentOld.filter(item => item !== jid);
        await settingsRef.update({ ignoreGroups: updatedNew, ignore_group_chats: updatedOld });
        res.json({ success: true, groups: updatedNew });
    } catch (error) {
        console.error('[Delete Ignore Group Error]', error);
        res.status(500).json({ success: false, error: 'Failed to update ignore list' });
    }
});

// ================= AI TEST ROUTES =================

app.post('/api/ai-test', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        const { message } = req.body;
        const apiKey = process.env.GROQ_API_KEY;

        if (!message) {
            return res.status(400).json({ success: false, error: 'Message is required' });
        }

        if (!apiKey) {
            return res.status(500).json({ success: false, error: 'AI Test failed' });
        }

        const { getUserProfile, getUserSettings } = require('../services/firebase-service');
        const profile = await getUserProfile(userId);
        const settings = await getUserSettings(userId);
        const aiMode = settings?.ai_mode || 'romantic';

        const isDeveloperQuestion = /who (made|created) you|who( is)? your developer|kisne banaya|developer|owner contact|creator info|joyz developer/i.test(message);
        const developerReply = [
            'Developer Name: Jaswant',
            'Instagram: @jaswant_0707',
            'Instagram: @the.chillcoder',
            'Email: jaswanty132@gmail.com',
            'Email: chillcoder4@gmail.com'
        ].join('\n');

        const reply = isDeveloperQuestion
            ? developerReply
            : await generateAIResponse(userId, 'ai_test', message, 'You', aiMode, [], {
                ownerName: profile?.name || 'Owner',
                isOwnerMessage: true
            });

        const messagesRef = admin.database().ref(`users/${userId}/memory/ai_test/messages`);
        const timestamp = Date.now();

        await messagesRef.push({
            role: 'user',
            text: message,
            senderName: 'You',
            timestamp
        });

        await messagesRef.push({
            role: 'assistant',
            text: reply,
            senderName: 'Joyz AI',
            timestamp: Date.now()
        });

        await admin.database().ref(`users/${userId}/memory/ai_test/lastActivity`).set(Date.now());

        return res.json({ success: true, reply });
    } catch (error) {
        console.error('[AI Test Error]', error);
        return res.status(500).json({ success: false, error: 'AI Test failed' });
    }
});

app.get('/api/ai-test/history', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        const snapshot = await admin.database()
            .ref(`users/${userId}/memory/ai_test/messages`)
            .limitToLast(50)
            .once('value');

        const history = [];
        snapshot.forEach(child => {
            history.push(child.val());
        });

        return res.json({ success: true, history });
    } catch (error) {
        console.error('[AI Test History Error]', error);
        return res.status(500).json({ success: false, error: 'Failed to load history' });
    }
});

app.delete('/api/ai-test/memory', authenticateUser, async (req, res) => {
    try {
        const userId = req.userId;
        await admin.database().ref(`users/${userId}/memory/ai_test`).remove();
        return res.json({ success: true });
    } catch (error) {
        console.error('[AI Test Clear Error]', error);
        return res.status(500).json({ success: false, error: 'Failed to clear memory' });
    }
});

// ================= MEMORY ROUTES =================

// Smart Memory list
app.get('/api/memory/smart', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const chats = await loadSmartMemoryChats(userId);
        res.json({ success: true, chats });
    } catch (error) {
        console.error('[Get Smart Memory Chats Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get smart memory chats' });
    }
});

// Smart Memory details
app.get('/api/memory/smart/:chatJid', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const { chatJid } = req.params;
        const memory = await loadSmartMemory(userId, decodeURIComponent(chatJid));
        res.json({ success: true, memory });
    } catch (error) {
        console.error('[Get Smart Memory Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get smart memory' });
    }
});

// Temporary Memory list
app.get('/api/memory/temp', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const chats = tempMemory.listChatsForUser(userId);
        res.json({ success: true, chats });
    } catch (error) {
        console.error('[Get Temp Memory Chats Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get temp memory' });
    }
});

// Temporary Memory for a chat
app.get('/api/memory/temp/:chatJid', authenticateUser, async (req, res) => {
    try {
        const { userId } = req;
        const { chatJid } = req.params;
        const history = tempMemory.getRecent(userId, decodeURIComponent(chatJid));
        res.json({ success: true, history });
    } catch (error) {
        console.error('[Get Temp Memory Error]', error);
        res.status(500).json({ success: false, error: 'Failed to get temp memory' });
    }
});

// ================= DASHBOARD ROUTES =================

// Main dashboard route (landing)
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

// Login page
app.get('/login', (req, res) => {
    res.sendFile('login.html', { root: 'public' });
});

// Signup page  
app.get('/signup', (req, res) => {
    res.sendFile('signup.html', { root: 'public' });
});

// User dashboard (NOT protected by middleware because it's a file serve)
// Protection is handled client-side in dashboard.html
app.get('/dashboard', (req, res) => {
    res.sendFile('dashboard.html', { root: 'public' });
});

function startServer() {
    const port = process.env.PORT || 3000;
    
    server.listen(port, () => {
        console.log(`✅ Dashboard running on http://localhost:${port}`);
        console.log(`📋 Setup steps:`);
        console.log(`   1. Sign up or Login`);
        console.log(`   2. Connect WhatsApp (scan QR)`);
        console.log(`   3. Start chatting!`);

        restoreSessions().catch((error) => {
            console.error('[Restore] Error restoring sessions:', error);
        });
    });
}

module.exports = { app, server, startServer, io, emitToUser };
