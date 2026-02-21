const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { env, loadSettings, updateSettings, toggleChatAI, isChatEnabled } = require('./config');
const { getQRImage, getSocket } = require('./whatsapp');
const { getAIResponse } = require('./ai');
const botEmitter = require('./events');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// WebSocket connection
io.on('connection', async (socket) => {
    socket.emit('settings', loadSettings());
    
    // Send current QR if available
    const qrImage = await getQRImage();
    if (qrImage) {
        socket.emit('qr', qrImage);
    } else {
        const sock = getSocket();
        if (sock && sock.user) {
            socket.emit('status', '✅ Connected');
        }
    }
});

// Event Binding
botEmitter.on('qr', async (qr) => {
    const url = await getQRImage();
    io.emit('qr', url);
});

botEmitter.on('status', (status) => {
    io.emit('status', status);
});

botEmitter.on('message', (data) => {
    io.emit('new_message', data);
});

// Dashboard Route
app.get('/', async (req, res) => {
    const settings = loadSettings();

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Joyz AI - Setup Dashboard</title>
        <script src="/socket.io/socket.io.js"></script>
        <style>
            :root { 
                --bg: #0f172a; 
                --card: #1e293b; 
                --text: #e2e8f0; 
                --accent: #10b981; 
                --accent-hover: #059669;
                --warning: #f59e0b;
                --danger: #ef4444;
                --info: #3b82f6;
            }
            * { box-sizing: border-box; }
            body { 
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                background: var(--bg); 
                color: var(--text); 
                margin: 0; 
                padding: 20px; 
                display: grid;
                grid-template-columns: 400px 1fr;
                gap: 25px; 
                height: 100vh;
                overflow: hidden;
            }
            
            h1, h2 { margin-top: 0; color: var(--accent); font-size: 1.35em; }
            h3 { margin: 0 0 10px 0; font-size: 0.95em; opacity: 0.7; font-weight: normal; }
            
            /* Sidebar */
            .sidebar {
                display: flex;
                flex-direction: column;
                gap: 20px;
                overflow-y: auto;
                padding-right: 10px;
            }
            
            /* Main */
            .main { display: flex; flex-direction: column; }
            
            /* Cards */
            .card { 
                background: var(--card); 
                padding: 25px; 
                border-radius: 14px; 
                border: 1px solid #334155;
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
            }
            
            /* Status Card */
            .status-box { text-align: center; }
            .status-indicator {
                font-size: 1.1em;
                font-weight: 600;
                padding: 15px;
                border-radius: 12px;
                margin: 15px 0;
                transition: all 0.3s ease;
            }
            .status-disconnected { background: rgba(239, 68, 68, 0.15); color: var(--danger); }
            .status-waiting { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
            .status-connected { background: rgba(16, 185, 129, 0.15); color: var(--accent); }
            
            /* Important Fields */
            .important-field {
                background: rgba(245, 158, 11, 0.1);
                border: 1px solid var(--warning);
                padding: 18px;
                border-radius: 10px;
                margin-bottom: 18px;
            }
            .important-field label {
                color: var(--warning);
                font-weight: 600;
                font-size: 0.95em;
            }
            .info-field {
                background: rgba(59, 130, 246, 0.1);
                border: 1px solid var(--info);
                padding: 18px;
                border-radius: 10px;
                margin-bottom: 18px;
            }
            .info-field label {
                color: var(--info);
                font-weight: 600;
                font-size: 0.95em;
            }
            .api-help {
                font-size: 0.8em;
                opacity: 0.8;
                margin-top: 8px;
                line-height: 1.4;
            }
            
            /* Form Elements */
            label { display: block; margin-bottom: 8px; font-size: 0.9em; color: #94a3b8; font-weight: 500; }
            input[type="text"], input[type="password"], select, textarea { 
                width: 100%; 
                background: #0f172a; 
                border: 1px solid #334155; 
                color: white; 
                padding: 12px 14px; 
                border-radius: 8px; 
                margin-bottom: 15px; 
                font-family: inherit;
                font-size: 0.95em;
                transition: border-color 0.2s ease;
            }
            input:focus, select:focus, textarea:focus {
                outline: none;
                border-color: var(--accent);
            }
            textarea { height: 120px; resize: vertical; font-family: inherit; }
            
            .input-row {
                display: flex;
                gap: 10px;
                align-items: flex-end;
            }
            .input-row input {
                margin-bottom: 0;
            }
            .input-row label {
                margin-bottom: 0;
                padding-top: 12px;
            }
            
            /* Buttons */
            button { 
                background: var(--accent); 
                color: white; 
                border: none; 
                padding: 12px 24px; 
                border-radius: 8px; 
                cursor: pointer; 
                width: 100%; 
                font-weight: 600; 
                transition: all 0.2s ease;
                font-size: 0.95em;
            }
            button:hover { 
                background: var(--accent-hover); 
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            }
            button:active { transform: translateY(0); }
            button:disabled { 
                opacity: 0.5; 
                cursor: not-allowed; 
                transform: none; 
            }
            
            /* Chat */
            .chat-container {
                display: flex;
                flex-direction: column;
                height: 100%;
                min-height: 400px;
            }
            .chat-header {
                padding-bottom: 20px;
                border-bottom: 1px solid #334155;
            }
            .chat-messages { 
                flex: 1; 
                overflow-y: auto; 
                display: flex; 
                flex-direction: column; 
                gap: 12px; 
                padding: 20px 0;
                min-height: 200px;
            }
            .chat-input-area {
                padding-top: 20px;
                border-top: 1px solid #334155;
                display: flex;
                gap: 12px;
                align-items: flex-end;
            }
            .chat-input-area input {
                margin-bottom: 0;
                flex: 1;
            }
            .chat-input-area button {
                width: auto;
                padding: 12px 28px;
            }
            
            /* Messages */
            .msg { 
                padding: 14px 18px; 
                border-radius: 12px; 
                max-width: 80%; 
                font-size: 0.95em; 
                line-height: 1.5; 
                animation: popIn 0.3s ease;
                word-wrap: break-word;
            }
            .msg.user { 
                background: #064e3b; 
                align-self: flex-end; 
                border-bottom-right-radius: 4px; 
                border: 1px solid #059669; 
            }
            .msg.ai { 
                background: #334155; 
                align-self: flex-start; 
                border-bottom-left-radius: 4px; 
            }
            .msg-meta { 
                font-size: 0.75em; 
                opacity: 0.6; 
                margin-bottom: 6px; 
                display: block; 
            }
            .empty-state {
                text-align: center;
                opacity: 0.5;
                padding: 60px 20px;
                font-size: 0.95em;
            }

            @keyframes popIn { 
                from { opacity: 0; transform: translateY(12px); } 
                to { opacity: 1; transform: translateY(0); } 
            }
            
            /* Scrollbar */
            ::-webkit-scrollbar { width: 8px; }
            ::-webkit-scrollbar-track { background: #0f172a; }
            ::-webkit-scrollbar-thumb { background: #334155; border-radius: 6px; }
            ::-webkit-scrollbar-thumb:hover { background: #475569; }

            /* Setup Badge */
            .setup-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 0.75em;
                font-weight: 600;
                background: var(--warning);
                color: #0f172a;
                margin-bottom: 8px;
            }
            .setup-complete .setup-badge {
                background: var(--accent);
                color: white;
            }

            /* Responsiveness */
            @media (max-width: 1024px) {
                body { grid-template-columns: 1fr; height: auto; min-height: 100vh; overflow-y: auto; }
                .main { display: none; }
                .sidebar { max-width: 100%; overflow-y: visible; }
            }
        </style>
    </head>
    <body>
        <div class="sidebar" id="setupPanel">
            <div class="card status-box">
                <div class="setup-badge" id="setupStatus">⚙️ Setup Required</div>
                <h2>📡 WhatsApp Bot</h2>
                <div id="statusIndicator" class="status-indicator status-disconnected">
                    🔴 Not Connected
                </div>
                <div id="qrContainer" style="margin-top: 20px;"></div>
            </div>

            <!-- Step 1: API Key -->
            <div class="card important-field" id="apiKeySection">
                <div class="setup-badge">Step 1: Required</div>
                <label>🔑 Groq API Key</label>
                <input 
                    type="password" 
                    id="groq_api_key" 
                    placeholder="gsk_..."
                />
                <div class="api-help">
                    Get free key from <a href="https://console.groq.com/" target="_blank" style="color: var(--warning); text-decoration: underline;">console.groq.com</a><br>
                    Required for AI responses
                </div>
            </div>

            <!-- Step 2: User Name -->
            <div class="card info-field" id="userSection">
                <div class="setup-badge">Step 2: Required</div>
                <label>👤 User Name</label>
                <input 
                    type="text" 
                    id="user_name" 
                    placeholder="Enter your name"
                />
                <div class="api-help">
                    This name will be used in the AI introduction.
                </div>
            </div>

            <!-- Bot Settings -->
            <div class="card">
                <h2>⚙️ AI Settings</h2>
                
                <label>🧠 AI Mode</label>
                <select id="ai_mode">
                    <option value="romantic">💕 Romantic (Joyz Personality)</option>
                    <option value="casual">😊 Casual Friend</option>
                    <option value="professional">💼 Professional Assistant</option>
                </select>

                <label>🎭 Custom System Prompt (Optional)</label>
                <textarea id="system_prompt" placeholder="Write your own AI personality..."></textarea>
                
                <label>🔌 Bot Status</label>
                <select id="bot_on">
                    <option value="true">✅ Enabled</option>
                    <option value="false">❌ Disabled</option>
                </select>

                <button onclick="saveSettings()">💾 Save All Settings</button>
            </div>
        </div>

        <div class="main">
            <div class="card chat-container">
                <div class="chat-header">
                    <h2>🧪 AI Test Mode</h2>
                    <h3>Test your bot responses</h3>
                </div>
                
                <div class="chat-messages" id="testChat">
                    <div class="empty-state">
                        💬 Send a message to test the AI<br>
                        <small>Make sure API key is added first!</small>
                    </div>
                </div>
                
                <div class="chat-input-area">
                    <input 
                        type="text" 
                        id="testInput" 
                        placeholder="Type a message..." 
                        onkeypress="if(event.key==='Enter') sendTestMessage()"
                    >
                    <button onclick="sendTestMessage()">Send</button>
                </div>
            </div>
        </div>

        <script>
            const socket = io();
            const testChat = document.getElementById('testChat');
            const qrContainer = document.getElementById('qrContainer');
            const statusIndicator = document.getElementById('statusIndicator');
            const testInput = document.getElementById('testInput');
            const setupStatus = document.getElementById('setupStatus');
            const setupPanel = document.getElementById('setupPanel');

            // Load settings
            socket.on('settings', (data) => {
                document.getElementById('groq_api_key').value = data.groq_api_key || "";
                document.getElementById('user_name').value = data.user_name || "";
                document.getElementById('bot_on').value = data.bot_on ? 'true' : 'false';
                document.getElementById('ai_mode').value = data.ai_mode || 'romantic';
                document.getElementById('system_prompt').value = data.system_prompt || "";
                
                updateSetupStatus(data);
            });

            function updateSetupStatus(settings) {
                const hasApiKey = settings.groq_api_key && settings.groq_api_key.trim();
                const isConnected = statusIndicator.classList.contains('status-connected');
                
                if (hasApiKey && isConnected) {
                    setupStatus.textContent = '✅ Setup Complete';
                    setupPanel.classList.add('setup-complete');
                } else if (hasApiKey) {
                    setupStatus.textContent = '⚠️ API Key Set, Connect WhatsApp';
                } else {
                    setupStatus.textContent = '⚙️ Setup Required';
                    setupPanel.classList.remove('setup-complete');
                }
            }

            async function saveSettings() {
                const settings = {
                    groq_api_key: document.getElementById('groq_api_key').value.trim(),
                    user_name: document.getElementById('user_name').value.trim(),
                    bot_on: document.getElementById('bot_on').value === 'true',
                    ai_mode: document.getElementById('ai_mode').value,
                    system_prompt: document.getElementById('system_prompt').value
                };
                
                await fetch('/api/settings', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(settings)
                });
                
                const btn = event.target;
                const originalText = btn.innerText;
                btn.innerText = "✅ Saved!";
                btn.disabled = true;
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.disabled = false;
                    updateSetupStatus(settings);
                }, 1500);
            }

            socket.on('qr', (url) => {
                if(url) {
                    qrContainer.innerHTML = \`<img src="\${url}" width="220" style="border-radius: 12px; margin-top: 15px;">\`;
                    statusIndicator.className = 'status-indicator status-waiting';
                    statusIndicator.innerHTML = '🟡 Scan QR to Login';
                } else {
                    qrContainer.innerHTML = "";
                    statusIndicator.className = 'status-indicator status-connected';
                    statusIndicator.innerHTML = '🟢 Connected';
                    updateSetupStatus(loadSettings());
                }
            });

            socket.on('status', (msg) => {
                if (msg.includes('Connected') || msg.includes('✅')) {
                    statusIndicator.className = 'status-indicator status-connected';
                    statusIndicator.innerHTML = '🟢 ' + msg;
                } else if (msg.includes('Disconnected') || msg.includes('❌')) {
                    statusIndicator.className = 'status-indicator status-disconnected';
                    statusIndicator.innerHTML = '🔴 ' + msg;
                } else {
                    statusIndicator.innerHTML = msg;
                }
            });

            socket.on('new_message', (data) => {
                // Could show in sidebar if needed
                console.log('WhatsApp message:', data);
            });

            let testMessageCount = 0;
            
            function addTestMessage(type, text) {
                if (testMessageCount === 0) {
                    testChat.innerHTML = '';
                }
                testMessageCount++;
                
                const div = document.createElement('div');
                div.className = \`msg \${type}\`;
                
                if (type === 'user') {
                    div.innerHTML = \`<span class="msg-meta">You</span>\${text}\`;
                } else {
                    div.innerHTML = \`<span class="msg-meta">Joyz AI</span>\${text}\`;
                }
                
                testChat.appendChild(div);
                testChat.scrollTop = testChat.scrollHeight;
            }

            async function sendTestMessage() {
                const message = testInput.value.trim();
                if (!message) return;
                
                // Check API key
                const apiKey = document.getElementById('groq_api_key').value.trim();
                if (!apiKey) {
                    alert('⚠️ Please add Groq API Key first!');
                    document.getElementById('apiKeySection').scrollIntoView({ behavior: 'smooth' });
                    return;
                }
                
                addTestMessage('user', message);
                testInput.value = '';
                testInput.disabled = true;
                
                try {
                    const response = await fetch('/api/test-ai', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message })
                    });
                    
                    const data = await response.json();
                    
                    if (data.reply) {
                        addTestMessage('ai', data.reply);
                    } else {
                        addTestMessage('ai', '❌ Error: ' + (data.error || 'Unknown error'));
                    }
                } catch (error) {
                    console.error('Test AI Error:', error);
                    addTestMessage('ai', '❌ Network error. Check console.');
                } finally {
                    testInput.disabled = false;
                    testInput.focus();
                }
            }

            // Auto-load settings helper for updateSetupStatus
            function loadSettings() {
                return {
                    groq_api_key: document.getElementById('groq_api_key').value,
                    bot_on: document.getElementById('bot_on').value === 'true'
                };
            }

            // Focus
            testInput.focus();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// API Routes
app.get('/api/settings', (req, res) => {
    res.json(loadSettings());
});

app.post('/api/settings', (req, res) => {
    const updated = updateSettings(req.body);
    res.json(updated);
});

// AI Test Endpoint
app.post('/api/test-ai', async (req, res) => {
    try {
        const { message, mode } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }
        
        const settings = loadSettings();
        const aiMode = mode || settings.ai_mode;
        
        const reply = await getAIResponse('dashboard-test', message, aiMode);
        
        res.json({
            reply,
            mode: aiMode,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('AI Test Error:', error);
        res.status(500).json({ error: 'Failed to generate response' });
    }
});

function startServer() {
    const port = env.PORT || 3000;
    
    server.listen(port, () => {
        console.log(`✅ Dashboard running on http://localhost:${port}`);
        console.log(`📋 Setup steps:`);
        console.log(`   1. Add Groq API key`);
        console.log(`   2. Set your name & Instagram`);
        console.log(`   3. Scan QR code (WhatsApp)`);
        console.log(`   4. Test AI in panel`);
    });
}

module.exports = { startServer };