const WebSocket = require('ws');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 5000;

let ws;
let patternHistory = [];
let currentSid = null;
let currentData = null;

const processedSid = new Set();
const processedGbb = new Set();

const messagesToSend = [
  [1, "MiniGame", "", "", {
    agentId: "1",
    accessToken: "1-cf44d8014cdd1d4e4c72c0e470f092a2",
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
      "User-Agent": "Mozilla/5.0",
      Origin: "https://1.hit.club"
    }
  });

  ws.on('open', () => {
    console.log("[OK] WebSocket đã kết nối");
    messagesToSend.forEach((msg, i) => {
      setTimeout(() => ws.send(JSON.stringify(msg)), i * 400);
    });

    let i = 1;
    setInterval(() => {
      ws.send(JSON.stringify(["7", "MiniGame", "1", i++]));
    }, 10000);
  });

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (!Array.isArray(data) || typeof data[1] !== 'object') return;

      const cmd = data[1].cmd;
      const sid = data[1].sid;
      const gbb = data[1].gBB;

      // In mã phiên
      if ((cmd === 1002 || cmd === 1008) && sid && !processedSid.has(sid)) {
        currentSid = sid;
        processedSid.add(sid);
      }

      // In kết quả
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
    console.log("[Đóng] Mất kết nối, đang kết nối lại...");
    setTimeout(connectWebSocket, 2000);
  });

  ws.on('error', err => {
    console.log("[Lỗi WebSocket]", err.message);
  });
}

// API trả dữ liệu JSON
app.get('/taixiu', (req, res) => {
  res.json(currentData || { message: "Đang chờ dữ liệu..." });
});

app.get('/', (req, res) => {
  res.send("OK - /taixiu để xem JSON");
});

app.listen(PORT, () => {
  console.log(`[HTTP] Server chạy tại http://localhost:${PORT}`);
  connectWebSocket();
});
