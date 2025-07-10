const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3010;

let ws;
let pingInterval;
let patternHistory = [];
let currentSid = null;
let currentData = null;

const processedSid = new Set();
const processedGbb = new Set();

const ACCESS_TOKEN = "1-014fc1aed379ebbb893d2aabb93974e3";

const messagesToSend = [
  [1, "MiniGame", "", "", {
    agentId: "1",
    accessToken: ACCESS_TOKEN,
    reconnect: false
  }],
  [6, "MiniGame", "lobbyPlugin", { cmd: 10001 }],
  [6, "MiniGame", "taixiuPlugin", { cmd: 1005 }],
  [6, "MiniGame", "taixiuKCBPlugin", { cmd: 2001 }]
];

function simpleAIDuDoan(pattern) {
  if (pattern.length < 6) return "Đợi thêm dữ liệu...";
  let tai = 0, xiu = 0;
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "T") tai++;
    else if (pattern[i] === "X") xiu++;
  }
  return tai > xiu ? "Tài" : tai < xiu ? "Xỉu" : "Ngẫu nhiên";
}

function connectWebSocket() {
  ws = new WebSocket("wss://mynygwais.hytsocesk.com/websocket", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Linux; Android 10; K; AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36",
      "Origin": "https://i.hit.club"
    }
  });

  ws.on('open', () => {
    console.log("[✅] WebSocket đã kết nối");

    messagesToSend.forEach((msg, i) => {
      setTimeout(() => ws.send(JSON.stringify(msg)), i * 400);
    });

    let i = 1;
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      try {
        ws.send(JSON.stringify(["7", "MiniGame", "1", i++]));
      } catch {}
    }, 10000);
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!Array.isArray(data) || typeof data[1] !== 'object') return;

      const cmd = data[1].cmd;
      const sid = data[1].sid;
      const gbb = data[1].gBB;

      if ((cmd === 1002 || cmd === 1008) && sid && !processedSid.has(sid)) {
        currentSid = sid;
        processedSid.add(sid);
      }

      if ((cmd === 1003 || cmd === 1004) && data[1].d1 && data[1].d2 && data[1].d3 && !processedGbb.has(gbb)) {
        processedGbb.add(gbb);
        const { d1, d2, d3 } = data[1];
        const total = d1 + d2 + d3;
        const kq = total > 10 ? "Tài" : "Xỉu";

        patternHistory.push(kq[0]);
        if (patternHistory.length > 10) patternHistory.shift();

        const pattern = patternHistory.join("");
        const duDoan = simpleAIDuDoan(patternHistory);

        const output = {
          id: "binhtool90",
          sid: currentSid,
          ket_qua: `${d1}-${d2}-${d3} = ${total} (${kq})`,
          pattern: pattern,
          du_doan_tiep_theo: duDoan
        };

        currentData = output;
        console.log(output);
      }
    } catch (e) {
      console.log("[Lỗi]", e.message);
    }
  });

  ws.on('close', () => {
    console.log("[⚠️] WebSocket đóng. Kết nối lại sau 2s...");
    clearInterval(pingInterval);
    setTimeout(connectWebSocket, 2000);
  });

  ws.on('error', err => {
    console.log("[❌ Lỗi WebSocket]", err.message);
  });
}

// REST API
app.get('/taixiu', (req, res) => {
  res.json(currentData || { message: "Đang chờ dữ liệu..." });
});

app.get('/', (req, res) => {
  res.send("✅ Server đang chạy. Truy cập /taixiu để xem JSON.");
});

// Chạy server và giữ cho Render không bị ngủ
app.listen(PORT, () => {
  console.log(`[HTTP] Server chạy tại http://localhost:${PORT}`);
  connectWebSocket();

  setInterval(() => {
    http.get(`http://localhost:${PORT}/`);
  }, 1000 * 60 * 14); // gọi lại mỗi 14 phút
});
