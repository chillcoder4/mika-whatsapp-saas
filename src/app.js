const dotenv = require('dotenv');
dotenv.config();

const { initializeFirebase } = require('./services/firebase-service');
const { startServer } = require('./dashboard/server');
const { startSmartSummaryScheduler } = require('./memory/smart-summary');

// --- Global Safety Nets to prevent Server Crash ---
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [Unhandled Rejection]', reason);
    // Does not exit process, keeps WhatsApp sockets alive
});

process.on('uncaughtException', (error) => {
    console.error('❌ [Uncaught Exception]', error);
    // Does not exit process, keeps WhatsApp sockets alive
});

(async () => {
    console.log('========================================');
    console.log('🚀 MIKA WHATSAPP SAAS SYSTEM');
    console.log('========================================');

    try {
        // Step 1: Initialize Firebase
        console.log('🔥 Initializing Firebase...');
        const firebaseInitialized = await initializeFirebase();

        if (!firebaseInitialized) {
            console.error('❌ Firebase initialization failed');
            console.error('Please set environment variables:');
            console.error('   FIREBASE_PRIVATE_KEY_ID');
            console.error('   FIREBASE_PRIVATE_KEY');
            console.error('   FIREBASE_CLIENT_EMAIL');
            console.error('   FIREBASE_CLIENT_ID');
            console.error('   FIREBASE_CLIENT_X509_CERT_URL');
            process.exit(1);
        }

        console.log('✅ Firebase initialized');

        // Step 2: Start Dashboard Server (Express + Socket.io)
        console.log('🌐 Starting dashboard...');
        startServer();
        startSmartSummaryScheduler();

        console.log('========================================');
        console.log('✅ ALL SYSTEMS OPERATIONAL');
        console.log('========================================');
        console.log('📱 WhatsApp: Per-user sessions via dashboard');
        console.log('🔥 Firebase: Auth + Realtime Database');
        console.log('🤖 AI: Groq-powered with memory');
        console.log('⏸️ Wait Timer: Per-chat pause system');
        console.log('💬 Memory: JID-based Firebase storage');
        console.log('========================================');

    } catch (err) {
        console.error('❌ Fatal Error:', err);
        process.exit(1);
    }
})();
