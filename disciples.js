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
let customName = getArg("name", "");
let autoBow = args.includes("--auto");
let airWalk = args.includes("--air") || args.includes("--fly");
const SERVER_URL = "wss://didenchua.online/ws";

// Tính toán độ cao mặt đất chính xác theo bản đồ chùa để không bị đi trên không
function getGroundY(x, z) {
  if (x >= -21 && x <= 21 && z >= -31 && z <= 3) return 2.4;
  if (x >= -21 && x <= 21 && z > 3 && z <= 4.8) return Math.round((2.4 - ((z - 3) / 1.8) * 0.6) * 100) / 100;
  if (x >= -14 && x <= 14 && z >= -74 && z <= -46) return 4.6;
  if (x >= -3.5 && x <= 3.5 && z > -46 && z <= -40) return Math.round((4.6 - ((z - (-46)) / 6.0) * 2.8) * 100) / 100;
  if (x >= -30 && x <= 30 && z >= -46 && z <= 15) return 1.8;
  if (x >= -6 && x <= 6 && z > 15 && z <= 21) return Math.round((1.8 - ((z - 15) / 6.0) * 1.8) * 100) / 100;
  const distMound = Math.hypot(x - 46, z - (-52));
  if (distMound < 15) return Math.round(Math.max(0, 6.0 * (1 - (distMound / 15) ** 2)) * 100) / 100;
  if (x >= 33.6 && x <= 47.8 && Math.abs(z - 12) <= 1.5) {
    const t = (x - 33.6) / (47.8 - 33.6);
    return Math.round((Math.sin(t * Math.PI) * 0.7 + t * 1.0) * 100) / 100;
  }
  if (Math.abs(x - 50) <= 2.5 && Math.abs(z - 12) <= 2.5) return 1.0;
  if (Math.abs(x) <= 4.5 && z >= 117 && z <= 157) return 0.3;
  return 0.0;
}

// Tọa độ các địa danh trên bản đồ chùa để đệ tử đi dạo tự do
const MAP_LANDMARKS = [
  { name: "Sân chùa", zone: "Sân chùa", x: 0, z: 38, radius: 12 },
  { name: "Đường thần đạo", zone: "Đường thần đạo", x: 0, z: 80, radius: 10 },
  { name: "Cổng tam quan", zone: "Cổng tam quan", x: 0, z: 135, radius: 8 },
  { name: "Vườn hoa", zone: "Vườn hoa", x: 12, z: 74, radius: 8 },
  { name: "Bãi chăn trâu", zone: "Sân chùa", x: -20, z: 105, radius: 8 },
  { name: "Vườn Linh Thú", zone: "Vườn Linh Thú", x: -42, z: 80, radius: 8 },
  { name: "Hồ sen · Cầu Duyên", zone: "Hồ sen · Cầu Duyên", x: 35, z: 14, radius: 6 },
  { name: "Vườn thiền", zone: "Vườn thiền", x: -34, z: 28, radius: 7 },
  { name: "Pháp đường", zone: "Sân chùa", x: -38, z: 6, radius: 6 },
  { name: "Trước Chánh điện (Hiên)", zone: "Chánh điện", x: 0, z: 8, radius: 8 }
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
  formatName(index) {
    const base = (customName || "").trim();
    if (!base) return `Đệ tử ngầm #${index}`;
    if (/{i(ndex)?}/i.test(base)) return base.replace(/{i(ndex)?}/gi, index);
    if (base.includes("#")) return base.replace(/#+/, "#" + index);
    if (targetCount === 1) return base;
    return `${base} #${index}`;
  }

  constructor(index, room) {
    this.index = index;
    this.name = this.formatName(index);
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
    const y = Math.round((2.4 + (airWalk ? 3.0 : 0)) * 100) / 100;
    this.send({
      t: "state",
      x: this.offset.x,
      y: y,
      z: this.offset.z,
      ry: Math.PI,
      s: 0
    });
    this.pos = { x: this.offset.x, y: y, z: this.offset.z, ry: Math.PI };
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

  const alt = airWalk ? 3.2 : 0;
  disciples.forEach((d, idx) => {
    d.idleTimer = 0;
    d.lastStateSend = 0;
    const lm = MAP_LANDMARKS[(idx + Math.floor(Math.random() * MAP_LANDMARKS.length)) % MAP_LANDMARKS.length];
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * lm.radius;
    d.targetWaypoint = {
      x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
      z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
      zone: lm.zone
    };
    if (!d.pos) {
      d.pos = { x: d.offset.x, y: Math.round((2.4 + alt) * 100) / 100, z: d.offset.z, ry: Math.PI };
    }
  });

  if (roamTimer) clearInterval(roamTimer);
  roamTimer = setInterval(() => {
    if (formationMode !== "roam") return;
    const now = Date.now();
    const altitude = airWalk ? 3.2 : 0;
    disciples.forEach((d) => {
      if (!d.ready || !d.ws) return;
      if (!d.pos) d.pos = { x: d.offset.x, y: Math.round((2.4 + altitude) * 100) / 100, z: d.offset.z, ry: Math.PI };

      // Nghỉ chân tại chỗ: chỉ gửi keepalive mỗi 2.5s để tiết kiệm đường truyền
      if (d.idleTimer > 0) {
        d.idleTimer--;
        if (!d.lastStateSend || now - d.lastStateSend > 2500) {
          d.lastStateSend = now;
          d.pos.y = Math.round((getGroundY(d.pos.x, d.pos.z) + altitude) * 100) / 100;
          d.send({
            t: "state",
            x: d.pos.x,
            y: d.pos.y,
            z: d.pos.z,
            ry: d.pos.ry,
            s: 0
          });
        }
        return;
      }

      // Chọn địa danh mới nếu chưa có
      if (!d.targetWaypoint) {
        const lm = MAP_LANDMARKS[Math.floor(Math.random() * MAP_LANDMARKS.length)];
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * lm.radius;
        d.targetWaypoint = {
          x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
          z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
          zone: lm.zone
        };
      }

      const dx = d.targetWaypoint.x - d.pos.x;
      const dz = d.targetWaypoint.z - d.pos.z;
      const dist = Math.hypot(dx, dz);

      // Đã tới điểm đến: nghỉ chân 3 - 6 giây (15 - 30 nhịp @ 200ms)
      if (dist < 1.5) {
        d.idleTimer = Math.floor(Math.random() * 16) + 15;
        d.targetWaypoint = null;
        d.pos.y = Math.round((getGroundY(d.pos.x, d.pos.z) + altitude) * 100) / 100;
        d.lastStateSend = now;
        d.send({
          t: "state",
          x: d.pos.x,
          y: d.pos.y,
          z: d.pos.z,
          ry: d.pos.ry,
          s: 0
        });
        return;
      }

      // Bước đi mượt mà tự nhiên: ~0.32m mỗi nhịp 200ms (= 1.6 m/s, chuẩn tốc độ đi của chú tiểu)
      const stepDist = 0.32;
      const moveX = (dx / dist) * Math.min(stepDist, dist);
      const moveZ = (dz / dist) * Math.min(stepDist, dist);
      d.pos.x = Math.round((d.pos.x + moveX) * 100) / 100;
      d.pos.z = Math.round((d.pos.z + moveZ) * 100) / 100;
      d.pos.y = Math.round((getGroundY(d.pos.x, d.pos.z) + altitude) * 100) / 100;
      d.pos.ry = Math.round(Math.atan2(dx, dz) * 100) / 100;
      d.lastStateSend = now;

      // Cập nhật zone khi chuyển khu vực
      if (d.currentZone !== d.targetWaypoint.zone) {
        d.currentZone = d.targetWaypoint.zone;
        d.send({ t: "visit", zone: d.targetWaypoint.zone });
      }

      // Gửi trạng thái đi bộ (s: 1)
      d.send({
        t: "state",
        x: d.pos.x,
        y: d.pos.y,
        z: d.pos.z,
        ry: d.pos.ry,
        s: 1
      });
    });
  }, 200);
}

function recallToHall() {
  formationMode = "hall";
  if (roamTimer) clearInterval(roamTimer);
  roamTimer = null;
  console.log("\x1b[32m[TRIỆU TẬP] Đã gom toàn bộ đệ tử về Chánh điện xếp hàng bồ đoàn trang nghiêm!\x1b[0m");
  const hallY = Math.round((2.4 + (airWalk ? 3.0 : 0)) * 100) / 100;
  disciples.forEach((d) => {
    d.idleTimer = 0;
    d.targetWaypoint = null;
    d.pos = { x: d.offset.x, y: hallY, z: d.offset.z, ry: Math.PI };
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
  console.log(`\x1b[32m▶ Tên đệ tử      :\x1b[0m ${customName || "Đệ tử ngầm (mặc định)"}`);
  console.log(`\x1b[32m▶ Phòng chùa     :\x1b[0m ${targetRoom}`);
  console.log(`\x1b[32m▶ Đi trên không  :\x1b[0m ${airWalk ? "BẬT (Khinh công lướt mây)" : "TẮT (Đi bộ tiếp đất)"}`);
  console.log(`\x1b[32m▶ Tự động lạy    :\x1b[0m ${autoBow ? "BẬT (Mỗi 7.5s)" : "TẮT (Nhấn Space / Enter để lạy)"}`);
  console.log(`\x1b[32m▶ Tài nguyên     :\x1b[0m 0% GPU, < 15MB RAM, 0 tab trình duyệt`);
  console.log("\x1b[1;36m------------------------------------------------------------------------\x1b[0m");
  console.log("\x1b[1;37mLỆNH ĐIỀU KHIỂN:\x1b[0m");
  console.log("  • \x1b[1;33mNhấn phím Space hoặc Enter\x1b[0m: Toàn bộ đệ tử lạy ngay lập tức");
  console.log("  • \x1b[1;33mGõ 'roam' + Enter\x1b[0m         : Cho đệ tử tản ra đi dạo tự do khắp bản đồ chùa");
  console.log("  • \x1b[1;33mGõ 'hall' + Enter\x1b[0m         : Triệu tập toàn bộ đệ tử về Chánh điện xếp hàng");
  console.log("  • \x1b[1;33mGõ 'air' hoặc 'fly' + Enter\x1b[0m : Bật/tắt chế độ Đi trên không (Khinh công)");
  console.log("  • \x1b[1;33mGõ 'count <số>' + Enter\x1b[0m   : Đổi số lượng đệ tử (VD: count 6)");
  console.log("  • \x1b[1;33mGõ 'name <tên>' + Enter\x1b[0m   : Đổi tên đệ tử (VD: name Thích Tuệ Minh)");
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
  } else if (cmd.startsWith("name ") || cmd.startsWith("ten ")) {
    const newName = line.trim().replace(/^(name|ten)\s+/i, "").trim();
    customName = newName;
    disciples.forEach((d) => {
      d.name = d.formatName(d.index);
    });
    console.log(`\x1b[32m[ĐỔI TÊN] Đã cập nhật tên đệ tử thành: ${customName || "Đệ tử ngầm (mặc định)"}\x1b[0m`);
  } else if (cmd === "air" || cmd === "fly" || cmd === "khinhcong") {
    airWalk = !airWalk;
    const alt = airWalk ? 3.2 : 0;
    console.log(`\x1b[36m[KHINH CÔNG] Đã ${airWalk ? "BẬT (bay lượn lơ lửng trên mây)" : "TẮT (tiếp đất bình thường)"} chế độ Đi trên không!\x1b[0m`);
    disciples.forEach((d) => {
      if (d.pos) {
        const baseY = (formationMode === "hall") ? 2.4 : getGroundY(d.pos.x, d.pos.z);
        d.pos.y = Math.round((baseY + alt) * 100) / 100;
        d.send({
          t: "state",
          x: d.pos.x,
          y: d.pos.y,
          z: d.pos.z,
          ry: d.pos.ry,
          s: (d.idleTimer && d.idleTimer > 0) ? 0 : 1
        });
      }
    });
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

