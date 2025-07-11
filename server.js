const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const http = require('http');
const crypto = require('crypto');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

// Cấu hình giả lập người dùng
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36'
];

const ACCESS_TOKEN = "1-6a6ff1005b0c5504eef09a4c5eaf6108";

let ws;
let pingInterval;
let patternHistory = [];
let currentSid = null;
let currentData = null;
let reconnectAttempts = 0;

const processedSid = new Set();
const processedGbb = new Set();

// Hàm tiện ích
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

// AI dự đoán cải tiến
function enhancedAIDuDoan(pattern) {
  if (pattern.length < 8) return "Đang phân tích...";
  
  // Phân tích xu hướng
  const last5 = pattern.slice(-5);
  const taiCount = last5.filter(x => x === 'T').length;
  const xiuCount = last5.filter(x => x === 'X').length;
  
  // Nếu 4/5 kết quả gần nhất giống nhau
  if (taiCount >= 4) return "Xỉu (theo xác suất đảo chiều)";
  if (xiuCount >= 4) return "Tài (theo xác suất đảo chiều)";
  
  // Phân tích chuỗi
  if (pattern.endsWith('TTT')) return "Xỉu";
  if (pattern.endsWith('XXX')) return "Tài";
  
  return taiCount > xiuCount ? "Tài" : xiuCount > taiCount ? "Xỉu" : "Ngẫu nhiên";
}

// Kết nối WebSocket với hành vi giống người thật
function connectWebSocket() {
  const userAgent = getRandomUserAgent();
  const fingerprint = generateFingerprint();
  
  console.log(`[${getCurrentTime()}] Đang kết nối với UA: ${userAgent.split(' ')[0]}...`);

  ws = new WebSocket("wss://mynygwais.hytsocesk.com/websocket", {
    headers: {
      "User-Agent": userAgent,
      "Origin": "https://i.hit.club",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Sec-WebSocket-Extensions": "permessage-deflate; client_max_window_bits",
      "Pragma": "no-cache",
      "X-Forwarded-For": `192.168.${getRandomInt(1, 254)}.${getRandomInt(1, 254)}`,
      "X-Client-Fingerprint": fingerprint
    }
  });

  // Hành vi sau khi kết nối
  ws.on('open', () => {
    reconnectAttempts = 0;
    console.log(`[${getCurrentTime()}] ✅ Kết nối thành công`);
    
    // Gửi các message với độ trễ ngẫu nhiên như người dùng thật
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
        try {
          ws.send(JSON.stringify(msg));
          console.log(`[${getCurrentTime()}] 📤 Đã gửi message ${msg[3]?.cmd || msg[0]}`);
        } catch (e) {
          console.log(`[${getCurrentTime()}] ❌ Lỗi gửi message:`, e.message);
        }
      }, getRandomInt(300, 1500) * (i + 1));
    });

    // Thiết lập ping với khoảng thời gian không đều
    if (pingInterval) clearInterval(pingInterval);
    setupPing();
    
    // Giả lập hành vi người dùng ngẫu nhiên
    simulateUserBehavior();
  });

  // Xử lý message nhận được
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (!Array.isArray(msg) || typeof msg[1] !== 'object') return;

      const cmd = msg[1]?.cmd;
      const sid = msg[1]?.sid;
      const gbb = msg[1]?.gBB;

      // Xử lý các loại command khác nhau
      if ((cmd === 1002 || cmd === 1008) && sid && !processedSid.has(sid)) {
        currentSid = sid;
        processedSid.add(sid);
        console.log(`[${getCurrentTime()}] 🔄 Cập nhật SID: ${sid}`);
      }

      if ((cmd === 1003 || cmd === 1004) && msg[1]?.d1 && msg[1]?.d2 && msg[1]?.d3 && !processedGbb.has(gbb)) {
        processedGbb.add(gbb);
        const { d1, d2, d3 } = msg[1];
        const total = d1 + d2 + d3;
        const result = total > 10 ? "Tài" : "Xỉu";

        patternHistory.push(result[0]);
        if (patternHistory.length > 15) patternHistory.shift();

        const pattern = patternHistory.join("");
        const prediction = enhancedAIDuDoan(patternHistory);

        currentData = {
          id: "binhtool90",
          time: getCurrentTime(),
          sid: currentSid,
          ket_qua: `${d1}-${d2}-${d3} = ${total} (${result})`,
          pattern: pattern,
          du_doan: prediction,
          history: patternHistory.slice(-10).join(', ')
        };

        console.log(`[${getCurrentTime()}] 🎰 Kết quả: ${currentData.ket_qua}`);
        console.log(`           🔮 Dự đoán: ${prediction} | Pattern: ${pattern}`);
      }
    } catch (e) {
      console.log(`[${getCurrentTime()}] ❌ Lỗi xử lý message:`, e.message);
    }
  });

  // Xử lý đóng kết nối
  ws.on('close', () => {
    console.log(`[${getCurrentTime()}] ⚠️ Mất kết nối`);
    clearInterval(pingInterval);
    
    // Tăng thời gian reconnect sau mỗi lần thất bại
    const delay = Math.min(10000, 2000 + (reconnectAttempts * 1000));
    reconnectAttempts++;
    
    console.log(`[${getCurrentTime()}] ⏳ Sẽ kết nối lại sau ${delay/1000}s...`);
    setTimeout(connectWebSocket, delay);
  });

  ws.on('error', (err) => {
    console.log(`[${getCurrentTime()}] ❌ Lỗi WebSocket:`, err.message);
  });
}

// Thiết lập ping với thời gian ngẫu nhiên
function setupPing() {
  let counter = 1;
  
  const sendPing = () => {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(["7", "MiniGame", "1", counter++]));
        
        // Thỉnh thoảng gửi thêm request dữ liệu
        if (Math.random() > 0.7) {
          ws.send(JSON.stringify([6, "MiniGame", "taixiuKCBPlugin", { cmd: 2001 }]));
        }
      }
    } catch (e) {
      console.log(`[${getCurrentTime()}] ❌ Lỗi ping:`, e.message);
    }
    
    // Khoảng thời gian ping ngẫu nhiên từ 8-15s
    const nextPing = getRandomInt(8000, 15000);
    pingInterval = setTimeout(sendPing, nextPing);
  };
  
  sendPing();
}

// Giả lập hành vi người dùng
function simulateUserBehavior() {
  const actions = [
    () => ws.send(JSON.stringify([6, "MiniGame", "taixiuPlugin", { cmd: 1002 }])), // Xem lịch sử
    () => ws.send(JSON.stringify([6, "MiniGame", "lobbyPlugin", { cmd: 10001 }])), // Lấy thông tin phòng
    () => ws.send(JSON.stringify([6, "MiniGame", "taixiuKCBPlugin", { cmd: 2002 }])) // Lấy thông tin khác
  ];
  
  const performAction = () => {
    if (ws.readyState !== ws.OPEN) return;
    
    // 30% khả năng thực hiện hành động ngẫu nhiên
    if (Math.random() < 0.3) {
      const action = actions[getRandomInt(0, actions.length - 1)];
      try {
        action();
        console.log(`[${getCurrentTime()}] 👤 Giả lập hành động người dùng`);
      } catch (e) {
        console.log(`[${getCurrentTime()}] ❌ Lỗi giả lập:`, e.message);
      }
    }
    
    // Lên lịch hành động tiếp theo trong 20-60s
    setTimeout(performAction, getRandomInt(20000, 60000));
  };
  
  // Bắt đầu chu kỳ hành động
  setTimeout(performAction, getRandomInt(10000, 30000));
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
          <p id="status">🟢 Đang hoạt động</p>
        </div>
        
        <script>
          // Auto-refresh data every 5 seconds
          setInterval(() => {
            fetch('/taixiu')
              .then(res => res.json())
              .then(data => {
                document.getElementById('data').textContent = JSON.stringify(data, null, 2);
              });
          }, 5000);
        </script>
      </body>
    </html>
  `);
});

// Khởi động server
app.listen(PORT, () => {
  console.log(`[${getCurrentTime()}] 🚀 Server chạy tại http://localhost:${PORT}`);
  connectWebSocket();
  
  // Giữ kết nối active
  setInterval(() => {
    http.get(`http://localhost:${PORT}/`);
  }, 600000); // 10 phút
});
