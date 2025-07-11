const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 8010;

// Configuration
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36'
];

const ACCESS_TOKEN = "1-6a6ff1005b0c5504eef09a4c5eaf6108";

// Connection state
let ws = null;
let pingInterval = null;
let reconnectTimeout = null;
let reconnectAttempts = 0;
let isConnected = false;
let isConnecting = false;
let lastActivityTime = Date.now();

// Game data
let patternHistory = [];
let currentSid = null;
let currentData = null;
const processedSid = new Set();
const processedGbb = new Set();

// Utility functions
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomUserAgent() {
  return USER_AGENTS[getRandomInt(0, USER_AGENTS.length - 1)];
}

function generateFingerprint() {
  return crypto.randomBytes(16).toString('hex');
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

function safeSend(message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log(`[${getCurrentTime()}] ⚠️ Không thể gửi - Kết nối đã đóng`);
    return false;
  }
  
  try {
    ws.send(JSON.stringify(message));
    lastActivityTime = Date.now();
    return true;
  } catch (e) {
    console.log(`[${getCurrentTime()}] ❌ Lỗi khi gửi message:`, e.message);
    return false;
  }
}

// Improved prediction algorithm
function enhancedPrediction(pattern) {
  if (pattern.length < 8) return "Đang phân tích...";
  
  const lastResults = pattern.slice(-5);
  const taiCount = lastResults.filter(x => x === 'T').length;
  const xiuCount = lastResults.filter(x => x === 'X').length;

  // High probability reversal
  if (taiCount >= 4) return "Xỉu (xác suất đảo chiều cao)";
  if (xiuCount >= 4) return "Tài (xác suất đảo chiều cao)";
  
  // Sequence detection
  if (pattern.endsWith('TTT')) return "Xỉu";
  if (pattern.endsWith('XXX')) return "Tài";
  
  return taiCount > xiuCount ? "Tài" : xiuCount > taiCount ? "Xỉu" : "Ngẫu nhiên";
}

// WebSocket connection manager
function connectWebSocket() {
  if (isConnected || isConnecting) return;
  
  isConnecting = true;
  reconnectAttempts++;
  
  console.log(`[${getCurrentTime()}] 🔄 Đang kết nối (lần thử ${reconnectAttempts})...`);

  // Clear any existing connection
  if (ws) {
    ws.removeAllListeners();
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }

  // Create new connection
  ws = new WebSocket("wss://mynygwais.hytsocesk.com/websocket", {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Origin": "https://i.hit.club",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "X-Client-Fingerprint": generateFingerprint(),
      "X-Forwarded-For": `192.168.${getRandomInt(1, 254)}.${getRandomInt(1, 254)}`
    }
  });

  // Connection established
  ws.on('open', () => {
    isConnected = true;
    isConnecting = false;
    reconnectAttempts = 0;
    lastActivityTime = Date.now();
    console.log(`[${getCurrentTime()}] ✅ Kết nối thành công`);

    // Send initial messages with random delays
    const initialMessages = [
      [1, "MiniGame", "", "", {
        agentId: "1",
        accessToken: ACCESS_TOKEN,
        reconnect: false
      }],
      [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }],
      [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
      [6, "MiniGame", "taixiuKCBPlugin", { cmd: 2001 }]
    ];

    initialMessages.forEach((msg, i) => {
      setTimeout(() => {
        if (safeSend(msg)) {
          console.log(`[${getCurrentTime()}] 📤 Đã gửi message ${msg[3]?.cmd || msg[0]}`);
        }
      }, getRandomInt(500, 1500) * (i + 1));
    });

    // Start keep-alive mechanism
    setupKeepAlive();
    
    // Start human-like behavior simulation
    simulateHumanBehavior();
  });

  // Message received
  ws.on('message', (data) => {
    lastActivityTime = Date.now();
    
    try {
      const msg = JSON.parse(data);
      if (!Array.isArray(msg) || typeof msg[1] !== 'object') return;

      const cmd = msg[1]?.cmd;
      const sid = msg[1]?.sid;
      const gbb = msg[1]?.gBB;

      // Update current session ID
      if ((cmd === 1002 || cmd === 1008) && sid && !processedSid.has(sid)) {
        currentSid = sid;
        processedSid.add(sid);
        console.log(`[${getCurrentTime()}] 🔄 Cập nhật SID: ${sid}`);
      }

      // Process game result
      if ((cmd === 1003 || cmd === 1004) && msg[1]?.d1 && msg[1]?.d2 && msg[1]?.d3 && !processedGbb.has(gbb)) {
        processedGbb.add(gbb);
        const { d1, d2, d3 } = msg[1];
        const total = d1 + d2 + d3;
        const result = total > 10 ? "Tài" : "Xỉu";

        patternHistory.push(result[0]);
        if (patternHistory.length > 15) patternHistory.shift();

        const pattern = patternHistory.join("");
        const prediction = enhancedPrediction(patternHistory);

        currentData = {
          id: "binhtool90",
          time: getCurrentTime(),
          sid: currentSid,
          ket_qua: `${d1}-${d2}-${d3} = ${total} (${result})`,
          pattern: pattern,
          du_doan: prediction,
          history: patternHistory.slice(-10).join(', ')
        };

        console.log(`[${getCurrentTime()}] 🎲 Kết quả: ${currentData.ket_qua}`);
        console.log(`           🔮 Dự đoán: ${prediction} | Pattern: ${pattern}`);
      }
    } catch (e) {
      console.log(`[${getCurrentTime()}] ❌ Lỗi xử lý message:`, e.message);
    }
  });

  // Connection closed
  ws.on('close', () => {
    isConnected = false;
    isConnecting = false;
    console.log(`[${getCurrentTime()}] ⚠️ Kết nối đã đóng`);
    
    // Clean up
    if (pingInterval) clearInterval(pingInterval);
    
    // Schedule reconnect with exponential backoff
    const delay = Math.min(30000, 2000 * Math.pow(2, reconnectAttempts));
    console.log(`[${getCurrentTime()}] ⏳ Sẽ thử kết nối lại sau ${delay/1000}s...`);
    
    reconnectTimeout = setTimeout(() => {
      connectWebSocket();
    }, delay);
  });

  // Connection error
  ws.on('error', (err) => {
    isConnecting = false;
    console.log(`[${getCurrentTime()}] ❌ Lỗi kết nối:`, err.message);
  });
}

// Keep-alive mechanism
function setupKeepAlive() {
  if (pingInterval) clearInterval(pingInterval);
  
  let counter = 1;
  pingInterval = setInterval(() => {
    if (!isConnected) {
      clearInterval(pingInterval);
      return;
    }
    
    // Randomize ping interval (8-15s)
    const nextPing = getRandomInt(8000, 15000);
    clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (safeSend(["7", "MiniGame", "1", counter++])) {
        // Occasionally send additional requests
        if (Math.random() > 0.7) {
          safeSend([6, "MiniGame", "taixiuKCBPlugin", { cmd: 2001 }]);
        }
      }
    }, nextPing);
  }, getRandomInt(8000, 15000));
}

// Human-like behavior simulation
function simulateHumanBehavior() {
  if (!isConnected) return;
  
  const actions = [
    () => safeSend([6, "MiniGame", "taixiuPlugin", { cmd: 1002 }]),
    () => safeSend([6, "MiniGame", "lobbyPlugin", { cmd: 10001 }]),
    () => safeSend([6, "MiniGame", "taixiuKCBPlugin", { cmd: 2002 }])
  ];
  
  const performAction = () => {
    if (!isConnected) return;
    
    // 30% chance to perform random action
    if (Math.random() < 0.3) {
      const action = actions[getRandomInt(0, actions.length - 1)];
      if (action()) {
        console.log(`[${getCurrentTime()}] 👤 Giả lập hành vi người dùng`);
      }
    }
    
    // Schedule next action with random delay (20-60s)
    setTimeout(performAction, getRandomInt(20000, 60000));
  };
  
  // Start behavior simulation with random delay (10-30s)
  setTimeout(performAction, getRandomInt(10000, 30000));
}

// Health check
function startHealthCheck() {
  setInterval(() => {
    if (!isConnected) return;
    
    // If no activity for 30 seconds, force reconnect
    if (Date.now() - lastActivityTime > 30000) {
      console.log(`[${getCurrentTime()}] 🚨 Không có hoạt động trong 30s, yêu cầu kết nối lại`);
      ws.close();
    }
  }, 5000);
}

// API Endpoints
app.get('/taixiu', (req, res) => {
  res.json(currentData || { 
    status: "waiting",
    message: "Đang chờ dữ liệu từ server...",
    time: getCurrentTime()
  });
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Tool Tài Xỉu Real-time</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; }
          .container { max-width: 800px; margin: 0 auto; }
          .data-box { background: #f5f5f5; padding: 15px; border-radius: 8px; margin-top: 20px; }
          pre { background: #eee; padding: 10px; border-radius: 5px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎰 Tool Tài Xỉu Real-time</h1>
          <p>Kết nối WebSocket để nhận dữ liệu trực tiếp</p>
          
          <div class="data-box">
            <h3>Dữ liệu hiện tại:</h3>
            <pre id="data">${JSON.stringify(currentData || { message: "Đang kết nối..." }, null, 2)}</pre>
          </div>
          
          <p><a href="/taixiu" target="_blank">Xem dữ liệu JSON</a></p>
          <p id="status">${isConnected ? '🟢 Đang kết nối' : '🔴 Đang ngắt kết nối'}</p>
        </div>
        
        <script>
          // Auto-refresh data every 3 seconds
          function refreshData() {
            fetch('/taixiu')
              .then(res => res.json())
              .then(data => {
                document.getElementById('data').textContent = JSON.stringify(data, null, 2);
                document.getElementById('status').textContent = 
                  data.status === 'waiting' ? '🟡 Đang chờ dữ liệu' : '🟢 Đang kết nối';
              })
              .catch(() => {
                document.getElementById('status').textContent = '🔴 Mất kết nối server';
              });
          }
          
          setInterval(refreshData, 3000);
          refreshData();
        </script>
      </body>
    </html>
  `);
});

// Start server and connection
app.listen(PORT, () => {
  console.log(`[${getCurrentTime()}] 🚀 Server đang chạy tại http://localhost:${PORT}`);
  connectWebSocket();
  startHealthCheck();
});

// Keep the server alive
setInterval(() => {
  http.get(`http://localhost:${PORT}/`);
}, 600000); // Ping every 10 minutes
