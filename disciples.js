#!/usr/bin/env node
/**
 * ============================================================================
 * AN TỰ DUYÊN - CLI ĐỆ TỬ NGẦM (HEADLESS DISCIPLES) CHO TERMINAL
 * ============================================================================
 * Chạy đệ tử trợ lực trực tiếp trong Terminal (cmd / powershell / bash).
 * KHÔNG CẦN MỞ TRÌNH DUYỆT TAB NÀO, 0% GPU, tiêu tốn cực ít RAM/CPU (< 10MB)!
 * 
 * Cách dùng:
 *   node disciples.js                     # Chạy 4 đệ tử vào phòng chua-1
 *   node disciples.js --count=4           # Chỉ định số lượng đệ tử
 *   node disciples.js --room=chua-1       # Chỉ định phòng chùa
 *   node disciples.js --auto              # Tự động lạy định kỳ mỗi 7.5 giây
 * 
 * Điều khiển trong lúc chạy:
 *   - Nhấn phím cách (Space) hoặc gõ "lay" + Enter: Tất cả đệ tử lạy ngay lập tức!
 *   - Gõ "auto" + Enter: Bật / tắt chế độ tự động lạy theo chu kỳ.
 *   - Gõ "status" + Enter: Xem trạng thái các đệ tử.
 *   - Gõ "room <tên_phòng>" + Enter: Đổi phòng chùa (VD: room chua-2).
 *   - Gõ "exit" hoặc nhấn Ctrl+C: Thoát an toàn.
 * ============================================================================
 */

const readline = require("readline");
const crypto = require("crypto");

// Tương thích Node native WebSocket (Node 22+) hoặc thư viện ws nếu có
let WsClass = globalThis.WebSocket;
if (!WsClass) {
  try {
    WsClass = require("ws");
  } catch {
    console.error("\x1b[31m[LỖI] Không tìm thấy WebSocket. Vui lòng chạy bằng Node.js 22+ hoặc cài đặt ws: npm install ws\x1b[0m");
    process.exit(1);
  }
}

// Phân tích tham số dòng lệnh
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  for (const arg of args) {
    if (arg.startsWith(`--${name}=`)) {
      return arg.split("=")[1];
    }
  }
  return defaultValue;
}

const targetCount = parseInt(getArg("count", "4"), 10) || 4;
let targetRoom = getArg("room", "chua-1");
let autoBow = args.includes("--auto");
const SERVER_URL = "wss://didenchua.online/ws";

// Tọa độ các địa danh trên bản đồ chùa để đệ tử đi dạo tự do
const MAP_LANDMARKS = [
  { name: "Sân chùa", zone: "Sân chùa", x: 0, y: 0, z: 40, radius: 14 },
  { name: "Cổng tam quan", zone: "Cổng tam quan", x: 0, y: 0.3, z: 140, radius: 10 },
  { name: "Đường thần đạo", zone: "Đường thần đạo", x: 0, y: 0.2, z: 90, radius: 8 },
  { name: "Vườn hoa", zone: "Vườn hoa", x: 9.6, y: 0, z: 75.75, radius: 12 },
  { name: "Bãi chăn trâu", zone: "Sân chùa", x: -21, y: 0, z: 111, radius: 10 },
  { name: "Vườn Linh Thú", zone: "Vườn Linh Thú", x: -39, y: 0, z: 81, radius: 12 },
  { name: "Hồ sen · Cầu Duyên", zone: "Hồ sen · Cầu Duyên", x: 35.5, y: 0, z: 12, radius: 8 },
  { name: "Rùa thần", zone: "Hồ sen · Cầu Duyên", x: 34.8, y: 0, z: 21.5, radius: 6 },
  { name: "Vườn thiền", zone: "Vườn thiền", x: -36, y: 0, z: 30, radius: 10 },
  { name: "Pháp đường", zone: "Sân chùa", x: -40.5, y: 0, z: 4, radius: 8 },
  { name: "Giếng Ngọc", zone: "Giếng Ngọc", x: -44, y: 0, z: -16, radius: 8 },
  { name: "Tượng Di Lặc", zone: "Tượng Di Lặc", x: 46, y: 0, z: -32, radius: 10 },
  { name: "Đền Nguyệt Lão", zone: "Hồ sen · Cầu Duyên", x: 50, y: 0, z: -12.5, radius: 8 },
  { name: "Bảo tháp", zone: "Bảo tháp", x: 0, y: 4.6, z: -50, radius: 10 }
];

// Tọa độ đứng quỳ trong Chánh điện cho các đệ tử
function getHallOffset(index) {
  const row = Math.floor((index - 1) / 6);
  const col = (index - 1) % 6;
  const xPositions = [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0];
  return {
    x: xPositions[col] != null ? xPositions[col] : 0,
    z: -2.6 - (row * 0.85)
  };
}

class Disciple {
  constructor(index, room) {
    this.index = index;
    this.name = `Đệ tử ngầm #${index}`;
    this.room = room;
    this.cid = crypto.randomUUID();
    this.offset = getHallOffset(index);
    this.ws = null;
    this.connected = false;
    this.ready = false;
    this.myId = null;
    this.myPid = null;
    this.heartbeatTimer = null;
    this.refreshTimer = null;
    this.bowCount = 0;
    this.stopped = false;
  }

  connect() {
    if (this.stopped) return;
    try {
      this.ws = new WsClass(SERVER_URL);
    } catch (err) {
      this.log(`Lỗi tạo kết nối: ${err.message}`, "\x1b[31m");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.log(`Đã mở socket, đang gửi handshake...`, "\x1b[36m");
      const helloPacket = {
        t: "hello",
        v: 2,
        cid: this.cid,
        adopt: false,
        name: this.name,
        kind: "tieu",
        robe: "nau",
        skin: "dong",
        bio: "Đệ tử trợ lực terminal",
        beads: "go",
        cushion: "vang",
        phapkhi: "mo",
        room: this.room,
        view: 90
      };
      this.send(helloPacket);
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.t === "welcome") {
          this.myId = msg.id;
          this.myPid = msg.pid;
          this.ready = true;
          this.log(`Đã vào phòng [${this.room}] thành công! ID: ${this.myId}`, "\x1b[32m");
          this.enterChanhDien();
        } else if (msg.t === "room") {
          this.room = msg.room;
        }
      } catch { }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ready = false;
      this.cleanupTimers();
      if (!this.stopped) {
        this.log(`Mất kết nối máy chủ, tự động kết nối lại sau 3s...`, "\x1b[33m");
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      this.log(`Lỗi kết nối: ${err.message || "Lỗi mạng"}`, "\x1b[31m");
    };
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WsClass.OPEN) {
      try {
        this.ws.send(JSON.stringify(obj));
        return true;
      } catch { }
    }
    return false;
  }

  enterChanhDien() {
    this.send({ t: "visit", zone: "Chánh điện" });
    this.send({
      t: "state",
      x: this.offset.x,
      y: 2.4,
      z: this.offset.z,
      ry: Math.PI,
      s: 0
    });
  }

  startHeartbeat() {
    this.cleanupTimers();
    // Gửi hb mỗi 20s
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.send({ t: "hb" });
      }
    }, 20000);

    // Định kỳ refresh tọa độ Chánh điện mỗi 15s
    this.refreshTimer = setInterval(() => {
      if (this.ready) {
        this.enterChanhDien();
      }
    }, 15000);
  }

  cleanupTimers() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.heartbeatTimer = null;
    this.refreshTimer = null;
  }

  bow() {
    if (!this.ready) return false;
    this.enterChanhDien();
    const ok = this.send({ t: "emote", e: "lay" });
    if (ok) this.bowCount++;
    return ok;
  }

  setRoom(newRoom) {
    this.room = newRoom;
    if (this.ready) {
      this.send({ t: "room-go", room: newRoom });
      setTimeout(() => this.enterChanhDien(), 600);
    }
  }

  scheduleReconnect() {
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, 3000);
  }

  stop() {
    this.stopped = true;
    this.cleanupTimers();
    if (this.ws) {
      try { this.ws.close(); } catch { }
    }
  }

  log(msg, color = "\x1b[0m") {
    const time = new Date().toLocaleTimeString("vi-VN");
    console.log(`${color}[${time}] [Đệ tử #${this.index}] ${msg}\x1b[0m`);
  }
}

// Khởi tạo danh sách đệ tử
const disciples = [];
for (let i = 1; i <= targetCount; i++) {
  disciples.push(new Disciple(i, targetRoom));
}

let autoBowTimer = null;
let roamTimer = null;
let formationMode = "hall"; // "hall" | "roam"

function startRoaming() {
  formationMode = "roam";
  console.log("\x1b[36m[HÀNH TUNG] Đã kích hoạt Chế độ Đi dạo: Đệ tử tản ra đi lại tự do khắp bản đồ chùa!\x1b[0m");

  disciples.forEach((d, idx) => {
    d.idleTimer = 0;
    const lm = MAP_LANDMARKS[(idx + Math.floor(Math.random() * MAP_LANDMARKS.length)) % MAP_LANDMARKS.length];
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * lm.radius;
    d.targetWaypoint = {
      x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
      y: lm.y,
      z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
      zone: lm.zone
    };
    d.pos = { x: d.offset.x, y: 2.4, z: d.offset.z, ry: Math.PI };
  });

  if (roamTimer) clearInterval(roamTimer);
  roamTimer = setInterval(() => {
    if (formationMode !== "roam") return;
    disciples.forEach((d) => {
      if (!d.ready || !d.ws) return;
      if (!d.pos) d.pos = { x: d.offset.x, y: 2.4, z: d.offset.z, ry: Math.PI };

      if (d.idleTimer > 0) {
        d.idleTimer--;
        d.send({ t: "state", x: d.pos.x, y: d.pos.y, z: d.pos.z, ry: d.pos.ry, s: d.idleTimer > 1 ? 0 : 2 });
        return;
      }

      if (!d.targetWaypoint) {
        const lm = MAP_LANDMARKS[Math.floor(Math.random() * MAP_LANDMARKS.length)];
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * lm.radius;
        d.targetWaypoint = {
          x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
          y: lm.y,
          z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
          zone: lm.zone
        };
      }

      const dx = d.targetWaypoint.x - d.pos.x;
      const dz = d.targetWaypoint.z - d.pos.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 2.5) {
        d.idleTimer = Math.floor(Math.random() * 3) + 2;
        const lm = MAP_LANDMARKS[Math.floor(Math.random() * MAP_LANDMARKS.length)];
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * lm.radius;
        d.targetWaypoint = {
          x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
          y: lm.y,
          z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
          zone: lm.zone
        };
        return;
      }

      const stepDist = 1.4 + Math.random() * 0.8;
      const moveX = (dx / dist) * Math.min(stepDist, dist);
      const moveZ = (dz / dist) * Math.min(stepDist, dist);
      d.pos.x = Math.round((d.pos.x + moveX) * 100) / 100;
      d.pos.z = Math.round((d.pos.z + moveZ) * 100) / 100;
      d.pos.y = d.targetWaypoint.y;
      d.pos.ry = Math.round(Math.atan2(dx, dz) * 100) / 100;

      if (d.currentZone !== d.targetWaypoint.zone) {
        d.currentZone = d.targetWaypoint.zone;
        d.send({ t: "visit", zone: d.targetWaypoint.zone });
      }

      d.send({ t: "state", x: d.pos.x, y: d.pos.y, z: d.pos.z, ry: d.pos.ry, s: 1 });
    });
  }, 1200);
}

function recallToHall() {
  formationMode = "hall";
  if (roamTimer) clearInterval(roamTimer);
  roamTimer = null;
  console.log("\x1b[32m[TRIỆU TẬP] Đã gom toàn bộ đệ tử về Chánh điện xếp hàng bồ đoàn trang nghiêm!\x1b[0m");
  disciples.forEach((d) => {
    d.idleTimer = 0;
    d.targetWaypoint = null;
    d.enterChanhDien();
  });
}

function bowAllDisciples() {
  if (formationMode === "roam") {
    recallToHall();
  }
  let count = 0;
  disciples.forEach((d) => {
    if (d.bow()) count++;
  });
  const time = new Date().toLocaleTimeString("vi-VN");
  console.log(`\x1b[35m[${time}] 🙏 ĐÃ PHÁT ĐỘNG: ${count}/${disciples.length} đệ tử ngầm đồng loạt LẠY trong Chánh điện!\x1b[0m`);
}

function startAutoBow() {
  if (autoBowTimer) clearInterval(autoBowTimer);
  console.log(`\x1b[32m[CHẾ ĐỘ TỰ ĐỘNG] Đã bật tự động lạy mỗi 7.5 giây để Master vào lạy là ăn trọn Đồng Tâm!\x1b[0m`);
  autoBowTimer = setInterval(() => {
    bowAllDisciples();
  }, 7500);
}

function stopAutoBow() {
  if (autoBowTimer) clearInterval(autoBowTimer);
  autoBowTimer = null;
  console.log(`\x1b[33m[CHẾ ĐỘ TỰ ĐỘNG] Đã tắt tự động lạy.\x1b[0m`);
}

function adjustDiscipleCount(newCount) {
  if (newCount === disciples.length) return;
  if (newCount < disciples.length) {
    const removed = disciples.splice(newCount);
    removed.forEach((d) => d.stop());
    console.log(`\x1b[33m[ĐIỀU CHỈNH] Đã giảm bớt còn ${newCount} đệ tử.\x1b[0m`);
  } else {
    const currentLen = disciples.length;
    for (let i = currentLen + 1; i <= newCount; i++) {
      const d = new Disciple(i, targetRoom);
      disciples.push(d);
      setTimeout(() => d.connect(), (i - currentLen) * 200);
    }
    console.log(`\x1b[32m[ĐIỀU CHỈNH] Đang kết nối thêm lên tổng cộng ${newCount} đệ tử!\x1b[0m`);
  }
}

function printHeader() {
  console.clear();
  console.log("\x1b[1;36m========================================================================\x1b[0m");
  console.log("\x1b[1;33m       AN TỰ DUYÊN - BẦY ĐỆ TỬ NGẦM (TERMINAL HEADLESS DISCIPLES)       \x1b[0m");
  console.log("\x1b[1;36m========================================================================\x1b[0m");
  console.log(`\x1b[32m▶ Số lượng đệ tử :\x1b[0m ${targetCount}`);
  console.log(`\x1b[32m▶ Phòng chùa     :\x1b[0m ${targetRoom}`);
  console.log(`\x1b[32m▶ Tự động lạy    :\x1b[0m ${autoBow ? "BẬT (Mỗi 7.5s)" : "TẮT (Nhấn Space / Enter để lạy)"}`);
  console.log(`\x1b[32m▶ Tài nguyên     :\x1b[0m 0% GPU, < 15MB RAM, 0 tab trình duyệt`);
  console.log("\x1b[1;36m------------------------------------------------------------------------\x1b[0m");
  console.log("\x1b[1;37mLỆNH ĐIỀU KHIỂN:\x1b[0m");
  console.log("  • \x1b[1;33mNhấn phím Space hoặc Enter\x1b[0m: Toàn bộ đệ tử lạy ngay lập tức");
  console.log("  • \x1b[1;33mGõ 'roam' + Enter\x1b[0m         : Cho đệ tử tản ra đi dạo tự do khắp bản đồ chùa");
  console.log("  • \x1b[1;33mGõ 'hall' + Enter\x1b[0m         : Triệu tập toàn bộ đệ tử về Chánh điện xếp hàng");
  console.log("  • \x1b[1;33mGõ 'count <số>' + Enter\x1b[0m   : Đổi số lượng đệ tử (VD: count 6)");
  console.log("  • \x1b[1;33mGõ 'auto' + Enter\x1b[0m        : Bật/tắt tự động lạy theo chu kỳ");
  console.log("  • \x1b[1;33mGõ 'status' + Enter\x1b[0m      : Kiểm tra trạng thái đệ tử");
  console.log("  • \x1b[1;33mGõ 'room <tên>' + Enter\x1b[0m  : Đổi phòng (VD: room chua-2)");
  console.log("  • \x1b[1;33mGõ 'exit' hoặc Ctrl+C\x1b[0m    : Thoát chương trình");
  console.log("\x1b[1;36m========================================================================\x1b[0m\n");
}

printHeader();

// Kết nối tất cả đệ tử
disciples.forEach((d, idx) => {
  setTimeout(() => d.connect(), idx * 250);
});

if (autoBow) {
  setTimeout(startAutoBow, 3000);
}

// Lắng nghe input từ bàn phím
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", (line) => {
  const cmd = line.trim().toLowerCase();
  if (cmd === "" || cmd === "lay" || cmd === "l") {
    bowAllDisciples();
  } else if (cmd === "roam" || cmd === "didao") {
    startRoaming();
  } else if (cmd === "hall" || cmd === "chanhdien" || cmd === "taptrung") {
    recallToHall();
  } else if (cmd.startsWith("count ") || cmd.startsWith("c ")) {
    const newCount = parseInt(cmd.replace(/^(count|c)\s+/, ""), 10);
    if (!isNaN(newCount) && newCount >= 1 && newCount <= 100) {
      adjustDiscipleCount(newCount);
    } else {
      console.log("\x1b[31m[LỖI] Số lượng đệ tử phải là số từ 1 đến 100!\x1b[0m");
    }
  } else if (cmd === "auto") {
    if (autoBowTimer) {
      stopAutoBow();
    } else {
      startAutoBow();
    }
  } else if (cmd === "status") {
    console.log("\n\x1b[1;34m--- TRẠNG THÁI ĐỆ TỬ --- \x1b[0m");
    disciples.forEach((d) => {
      const state = d.ready ? "\x1b[32mSẴN SÀNG (Chánh điện)\x1b[0m" : d.connected ? "\x1b[33mĐang vào điện\x1b[0m" : "\x1b[31mMất kết nối\x1b[0m";
      console.log(`  • Đệ tử #${d.index}: ${state} | Phòng: ${d.room} | ID: ${d.myId || "—"} | Đã lạy: ${d.bowCount} lần`);
    });
    console.log();
  } else if (cmd.startsWith("room ")) {
    const newRoom = cmd.slice(5).trim();
    if (newRoom) {
      targetRoom = newRoom;
      disciples.forEach((d) => d.setRoom(newRoom));
      console.log(`\x1b[33m[CHUYỂN PHÒNG] Đã chuyển tất cả đệ tử sang phòng: ${newRoom}\x1b[0m`);
    }
  } else if (cmd === "exit" || cmd === "quit" || cmd === "q") {
    console.log("\x1b[33mĐang ngắt kết nối các đệ tử và thoát...\x1b[0m");
    disciples.forEach((d) => d.stop());
    process.exit(0);
  }
});

process.on("SIGINT", () => {
  console.log("\n\x1b[33mĐang ngắt kết nối các đệ tử và thoát...\x1b[0m");
  disciples.forEach((d) => d.stop());
  process.exit(0);
});

