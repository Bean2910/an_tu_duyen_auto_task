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
const net = require("net");
const tls = require("tls");
const https = require("https");
const fs = require("fs");

/**
 * PureWebSocket: Bộ kết nối WebSocket thuần 100% Node.js chuẩn (Zero NPM Dependency)
 * Hỗ trợ kết nối Trực tiếp (Direct), SOCKS5 (Cloudflare WARP, Tor) và HTTP CONNECT Proxy.
 */
class PureWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url, options = {}) {
    this.url = new URL(url);
    this.options = options;
    this.proxy = options.proxy || null;
    this.readyState = PureWebSocket.CONNECTING;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.buffer = Buffer.alloc(0);
    this.handshakeDone = false;
    this.socket = null;
    this._connect();
  }

  _connect() {
    const isWss = this.url.protocol === "wss:";
    const targetHost = this.url.hostname;
    const targetPort = parseInt(this.url.port, 10) || (isWss ? 443 : 80);

    if (this.proxy) {
      this._connectProxy(targetHost, targetPort, isWss);
    } else {
      if (isWss) {
        this.socket = tls.connect(targetPort, targetHost, { servername: targetHost }, () => this._sendHandshake());
      } else {
        this.socket = net.connect(targetPort, targetHost, () => this._sendHandshake());
      }
      this._bindSocket(this.socket);
    }
  }

  _connectProxy(targetHost, targetPort, isWss) {
    let pStr = String(this.proxy).trim();
    if (!pStr.includes("://")) {
      if (pStr.includes(":40000") || pStr.includes(":9050") || pStr.includes(":1080")) {
        pStr = "socks5://" + pStr;
      } else {
        pStr = "http://" + pStr;
      }
    }
    let pUrl;
    try {
      pUrl = new URL(pStr);
    } catch {
      this._handleError(new Error(`Địa chỉ proxy không hợp lệ: ${pStr}`));
      return;
    }
    const pProtocol = pUrl.protocol.replace(":", "");
    const pHost = pUrl.hostname;
    const pPort = parseInt(pUrl.port, 10) || (pProtocol.startsWith("socks") ? 1080 : 8080);

    const raw = net.connect(pPort, pHost, () => {
      raw.setTimeout(12000, () => {
        raw.destroy(new Error(`Proxy connection timeout: ${pHost}:${pPort}`));
      });

      if (pProtocol.startsWith("socks")) {
        // SOCKS5 Handshake
        raw.write(Buffer.from([0x05, 0x01, 0x00]));
        raw.once("data", (authResp) => {
          if (authResp[0] !== 0x05 || authResp[1] !== 0x00) {
            this._handleError(new Error("SOCKS5 proxy từ chối kết nối (Auth failed)"));
            return;
          }
          const hostBuf = Buffer.from(targetHost);
          const portBuf = Buffer.alloc(2);
          portBuf.writeUInt16BE(targetPort, 0);
          const connReq = Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuf.length]),
            hostBuf,
            portBuf
          ]);
          raw.write(connReq);
          raw.once("data", (connResp) => {
            if (connResp[1] !== 0x00) {
              this._handleError(new Error(`SOCKS5 connect error mã ${connResp[1]}`));
              return;
            }
            raw.setTimeout(0);
            this._upgradeToTlsOrHandshake(raw, targetHost, isWss);
          });
        });
      } else {
        // HTTP CONNECT Tunnel
        const req = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\nProxy-Connection: Keep-Alive\r\n\r\n`;
        raw.write(req);
        raw.once("data", (resp) => {
          const respStr = resp.toString("utf8");
          if (!respStr.includes(" 200 ")) {
            this._handleError(new Error(`HTTP proxy CONNECT failed: ${respStr.split("\r\n")[0]}`));
            return;
          }
          raw.setTimeout(0);
          this._upgradeToTlsOrHandshake(raw, targetHost, isWss);
        });
      }
    });

    raw.on("error", (err) => this._handleError(err));
  }

  _upgradeToTlsOrHandshake(rawSocket, targetHost, isWss) {
    if (isWss) {
      this.socket = tls.connect({ socket: rawSocket, servername: targetHost }, () => this._sendHandshake());
    } else {
      this.socket = rawSocket;
      this._sendHandshake();
    }
    this._bindSocket(this.socket);
  }

  _bindSocket(s) {
    s.on("data", (chunk) => this._onData(chunk));
    s.on("error", (err) => this._handleError(err));
    s.on("close", () => {
      this.readyState = PureWebSocket.CLOSED;
      if (this.onclose) this.onclose({ code: 1006, reason: "Socket closed" });
    });
  }

  _sendHandshake() {
    this.secKey = crypto.randomBytes(16).toString("base64");
    const path = (this.url.pathname || "/") + (this.url.search || "");
    const headers = [
      `GET ${path} HTTP/1.1`,
      `Host: ${this.url.hostname}`,
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Key: ${this.secKey}`,
      "Sec-WebSocket-Version: 13",
      "\r\n"
    ].join("\r\n");
    this.socket.write(headers);
  }

  _handleError(err) {
    if (this.onerror) this.onerror(err);
    this.close();
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (!this.handshakeDone) {
      const idx = this.buffer.indexOf("\r\n\r\n");
      if (idx !== -1) {
        const header = this.buffer.slice(0, idx).toString("utf8");
        if (header.includes("101 Switching Protocols")) {
          this.handshakeDone = true;
          this.readyState = PureWebSocket.OPEN;
          this.buffer = this.buffer.slice(idx + 4);
          if (this.onopen) this.onopen();
        } else {
          this._handleError(new Error(`Handshake failed: ${header.split("\r\n")[0]}`));
          return;
        }
      } else {
        return;
      }
    }

    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0];
      const b1 = this.buffer[1];
      const opcode = b0 & 0x0f;
      const isMasked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (this.buffer.length < 4) break;
        len = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buffer.length < 10) break;
        len = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }

      let mask = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) break;
        mask = this.buffer.slice(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + len) break;

      let payload = this.buffer.slice(offset, offset + len);
      this.buffer = this.buffer.slice(offset + len);

      if (isMasked && mask) {
        const unmasked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) unmasked[i] = payload[i] ^ mask[i % 4];
        payload = unmasked;
      }

      if (opcode === 0x01) {
        const text = payload.toString("utf8");
        if (this.onmessage) this.onmessage({ data: text });
      } else if (opcode === 0x09) {
        const pong = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
        try { this.socket.write(pong); } catch {}
      } else if (opcode === 0x08) {
        this.readyState = PureWebSocket.CLOSED;
        try { this.socket.end(); } catch {}
        if (this.onclose) this.onclose({ code: 1000, reason: "Normal close" });
        return;
      }
    }
  }

  send(data) {
    if (this.readyState !== PureWebSocket.OPEN || !this.socket) return;
    const payload = Buffer.from(String(data), "utf8");
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x81;
      header[1] = 0x80 | len;
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    const maskOffset = header.length - 4;
    const mask = crypto.randomBytes(4);
    mask.copy(header, maskOffset);
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    try { this.socket.write(Buffer.concat([header, masked])); } catch {}
  }

  close() {
    this.readyState = PureWebSocket.CLOSING;
    try {
      if (this.socket) {
        const mask = crypto.randomBytes(4);
        const closeFrame = Buffer.concat([Buffer.from([0x88, 0x82]), mask, Buffer.from([0x03 ^ mask[0], 0xe8 ^ mask[1]])]);
        this.socket.write(closeFrame);
        this.socket.end();
      }
    } catch {}
    this.readyState = PureWebSocket.CLOSED;
  }
}

let WsClass = globalThis.WebSocket || PureWebSocket;

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
let followTargetName = getArg("target", "");
let autoBow = args.includes("--auto");
let airWalk = args.includes("--air") || args.includes("--fly");
let followPlayer = args.includes("--follow") || args.includes("--f");
let corridorMode = args.includes("--corridor") || args.includes("--rows2") || args.includes("--guard");
let lectureMode = args.includes("--lecture") || args.includes("--rows") || args.includes("--hang");
let lectureRows = 3;
const rowsArg = getArg("rows", "") || getArg("hang", "");
if (rowsArg && !isNaN(parseInt(rowsArg, 10))) {
  lectureRows = Math.max(2, parseInt(rowsArg, 10));
  lectureMode = true;
}
let lectureFacing = getArg("facing", "front");
let lectureOrient = (args.includes("--doc") || getArg("orient", "") === "doc") ? "doc" : "ngang";
let randomLook = !args.includes("--uniform");
let greetIncludeName = !args.includes("--no-name");
let lookSeed = Math.floor(Math.random() * 10000);
const SERVER_URL = "wss://didenchua.online/ws";

// Cấu hình Proxy / VPN để vượt giới hạn IP kết nối
let proxyList = [];
const rawProxy = getArg("proxy", "") || getArg("vpn", "");
if (rawProxy) {
  proxyList = rawProxy.split(",").map((p) => p.trim()).filter(Boolean);
}
const proxyFile = getArg("proxy-file", "") || getArg("proxies", "");
if (proxyFile && fs.existsSync(proxyFile)) {
  try {
    const lines = fs.readFileSync(proxyFile, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
    proxyList = proxyList.concat(lines);
  } catch (err) {
    console.warn(`[PROXY] Không đọc được file ${proxyFile}: ${err.message}`);
  }
}
let autoFreeProxy = args.includes("--free-proxy") || args.includes("--auto-proxy") || args.includes("--free");

function getProxyForDisciple(index, attempt = 0) {
  if (!proxyList || proxyList.length === 0) return null;
  const idx = ((index - 1) + attempt) % proxyList.length;
  return proxyList[idx];
}

function fetchFreeProxies() {
  return new Promise((resolve) => {
    const url = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=4000&country=all";
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const lines = data.split("\n").map((s) => s.trim()).filter((s) => s && s.includes(":"));
        if (lines.length > 0) {
          proxyList = lines.map((p) => (p.startsWith("socks5://") ? p : `socks5://${p}`));
          console.log(`\x1b[32m[PROXY] Đã tự động tải về ${proxyList.length} Proxy SOCKS5 miễn phí!\x1b[0m`);
        } else {
          console.log("\x1b[31m[PROXY] Không lấy được proxy tự động, sẽ thử kết nối trực tiếp.\x1b[0m");
        }
        resolve(proxyList);
      });
    }).on("error", (err) => {
      console.log(`\x1b[31m[PROXY] Lỗi tải proxy: ${err.message}\x1b[0m`);
      resolve([]);
    });
  });
}

// Tùy chọn trang phục, màu áo, pháp khí, tràng hạt, bồ đoàn ngẫu nhiên
const DISCIPLE_LOOK_OPTIONS = {
  kinds: ["tieu", "ni"],
  robes: ["nau", "lam", "xam", "vang", "cam", "trang", "tieu", "sen", "xuan", "vulan", "tangoc"],
  skins: ["sang", "hong", "dong", "nau"],
  beads: ["go", "bode", "tram", "hophach", "ngoc", "mun", "manao", "maivang", "bachngoc", "hongngoc", "tuDan", "thachAnh", "bachHop", "bode108"],
  cushions: ["xam", "nau", "vang", "son", "sen", "laSen", "gam"],
  phapkhi: ["mo", "huong", "gio", "gaytruc", "kinh", "trentram", "truong", "nonla", "denlong", "chuong", "bat", "gaythan"]
};

function generateRandomDiscipleLook(index, seed = 0) {
  const rng = (offset) => {
    const x = Math.sin(index * 133.7 + seed * 99.1 + offset * 77.3) * 10000;
    return Math.floor((x - Math.floor(x)) * 1000000);
  };
  const kinds = DISCIPLE_LOOK_OPTIONS.kinds;
  const robes = DISCIPLE_LOOK_OPTIONS.robes;
  const skins = DISCIPLE_LOOK_OPTIONS.skins;
  const beads = DISCIPLE_LOOK_OPTIONS.beads;
  const cushions = DISCIPLE_LOOK_OPTIONS.cushions;
  const phapkhi = DISCIPLE_LOOK_OPTIONS.phapkhi;
  return {
    kind: kinds[rng(1) % kinds.length],
    robe: robes[rng(2) % robes.length],
    skin: skins[rng(3) % skins.length],
    beads: beads[rng(4) % beads.length],
    cushion: cushions[rng(5) % cushions.length],
    phapkhi: phapkhi[rng(6) % phapkhi.length]
  };
}

// Quản lý danh sách người chơi khác trong phòng để đệ tử bám theo
const roomOtherPlayers = new Map();

function isOurDisciple(id, name) {
  if (!id && !name) return false;
  if (disciples.some((d) => d.myId === id)) return true;
  if (name && disciples.some((d) => d.name === name)) return true;
  if (name && (name.startsWith("Đệ tử ngầm") || name.startsWith("Đệ tử #"))) return true;
  return false;
}

function registerOrUpdatePeer(peer) {
  if (!peer || peer.id == null) return;
  if (isOurDisciple(peer.id, peer.name)) return;
  const strId = String(peer.id);
  const existing = roomOtherPlayers.get(peer.id) || {};
  roomOtherPlayers.set(peer.id, {
    id: peer.id,
    name: peer.name || existing.name || `Đạo hữu #${strId.slice(0, 4)}`,
    x: typeof peer.x === "number" ? peer.x : (existing.x || 0),
    y: typeof peer.y === "number" ? peer.y : (existing.y || 0),
    z: typeof peer.z === "number" ? peer.z : (existing.z || 0),
    ry: typeof peer.ry === "number" ? peer.ry : (existing.ry || 0),
    s: typeof peer.s === "number" ? peer.s : (existing.s || 0),
    lastUpdate: Date.now()
  });
}

function removePeer(id) {
  if (id == null) return;
  roomOtherPlayers.delete(id);
  roomOtherPlayers.delete(Number(id));
  roomOtherPlayers.delete(String(id));
}

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
  const cols = targetCount > 100 ? 16 : (targetCount > 30 ? 12 : 8);
  const col = (index - 1) % cols;
  const row = Math.floor((index - 1) / cols);
  const xSpacing = cols > 10 ? 0.9 : 1.2;
  const xStart = -((cols - 1) * xSpacing) / 2;
  const rowStagger = (row % 2 === 1) ? (xSpacing * 0.4) : 0;
  return {
    x: Math.round((xStart + col * xSpacing + rowStagger) * 100) / 100,
    z: Math.round((-2.6 - (row * 0.85)) * 100) / 100
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
    this.proxyAttempt = 0;
    this.currentProxy = null;
  }

  connect() {
    if (this.stopped) return;
    const proxy = getProxyForDisciple(this.index, this.proxyAttempt);
    this.currentProxy = proxy;
    try {
      if (proxy) {
        this.log(`Đang kết nối qua Proxy: ${proxy}...`, "\x1b[35m");
        this.ws = new PureWebSocket(SERVER_URL, { proxy });
      } else if (globalThis.WebSocket) {
        this.ws = new globalThis.WebSocket(SERVER_URL);
      } else {
        this.ws = new PureWebSocket(SERVER_URL);
      }
    } catch (err) {
      this.log(`Lỗi tạo kết nối: ${err.message}`, "\x1b[31m");
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.proxyAttempt = 0;
      this.log(`Đã mở socket${this.currentProxy ? ` (via ${this.currentProxy})` : ""}, đang gửi handshake...`, "\x1b[36m");
      const look = randomLook
        ? generateRandomDiscipleLook(this.index, lookSeed)
        : { kind: "tieu", robe: "nau", skin: "dong", beads: "go", cushion: "vang", phapkhi: "mo" };
      this.look = look;
      const helloPacket = {
        t: "hello",
        v: 2,
        cid: this.cid,
        adopt: false,
        name: this.name,
        kind: look.kind,
        robe: look.robe,
        skin: look.skin,
        bio: "Đệ tử trợ lực terminal",
        beads: look.beads,
        cushion: look.cushion,
        phapkhi: look.phapkhi,
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
          if (Array.isArray(msg.peers)) msg.peers.forEach(registerOrUpdatePeer);
          if (formationMode !== "roam") {
            this.enterChanhDien();
          }
        } else if (msg.t === "room") {
          this.room = msg.room;
          if (Array.isArray(msg.peers)) msg.peers.forEach(registerOrUpdatePeer);
        } else if (msg.t === "join" && msg.peer) {
          registerOrUpdatePeer(msg.peer);
        } else if (msg.t === "leave" && msg.id) {
          removePeer(msg.id);
        } else if (msg.t === "state" && msg.id) {
          const p = roomOtherPlayers.get(msg.id);
          if (p) {
            if (typeof msg.x === "number") p.x = msg.x;
            if (typeof msg.y === "number") p.y = msg.y;
            if (typeof msg.z === "number") p.z = msg.z;
            if (typeof msg.ry === "number") p.ry = msg.ry;
            if (typeof msg.s === "number") p.s = msg.s;
            p.lastUpdate = Date.now();
          }
        } else if (msg.t === "states" && Array.isArray(msg.a)) {
          for (const [id, x, y, z, ry, s] of msg.a) {
            const p = roomOtherPlayers.get(id);
            if (p) {
              p.x = x; p.y = y; p.z = z; p.ry = ry; p.s = s;
              p.lastUpdate = Date.now();
            }
          }
        } else if (msg.t === "emote" && msg.e === "lay" && msg.id) {
          // Khi người chơi mục tiêu (Acc chính) lạy, toàn bộ đệ tử lập tức lạy theo!
          if (this.lastTargetPlayerId && String(msg.id) === String(this.lastTargetPlayerId)) {
            this.bow();
          }
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
    if (this.ws && (this.ws.readyState === 1 || this.ws.readyState === PureWebSocket.OPEN)) {
      try {
        this.ws.send(JSON.stringify(obj));
        return true;
      } catch { }
    }
    return false;
  }

  enterChanhDien() {
    this.send({ t: "visit", zone: "Chánh điện" });
    const row = Math.floor((this.index - 1) / 6);
    const col = (this.index - 1) % 6;
    const airAlt = airWalk ? (2.0 + (row * 0.7) + ((col % 3) * 0.25)) : 0;
    const y = Math.round((2.4 + airAlt) * 100) / 100;
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
    this.proxyAttempt++;
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, 3000);
  }

  reconnect() {
    this.cleanupTimers();
    if (this.ws) {
      try { this.ws.close(); } catch { }
    }
    this.connected = false;
    this.ready = false;
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, 400);
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
    // Chênh lệch thời gian xuất phát (0 - 5s)
    d.idleTimer = (idx * 6) % 25;
    d.lastStateSend = 0;
    // Tốc độ cá nhân hóa riêng biệt (từ 0.23m đến 0.41m / 200ms) để không đi ngang hàng nhau
    d.baseSpeed = 0.23 + ((idx * 7) % 10) * 0.02;
    // Trần độ cao khinh công riêng cho từng đệ tử (2.2m - 4.7m)
    d.maxAltitude = 2.2 + ((idx * 9) % 6) * 0.5;
    d.takeoffSpeed = 0.14 + ((idx * 5) % 5) * 0.02;
    d.landingSpeed = 0.10 + ((idx * 3) % 4) * 0.02;

    // Khởi tạo trạng thái bay so le
    if (!airWalk) {
      d.flightState = "ground";
      d.flightAltitude = 0;
      d.flightTimer = 0;
    } else {
      const mod = idx % 4;
      if (mod === 0) {
        d.flightState = "ground";
        d.flightAltitude = 0;
        d.flightTimer = 35 + ((idx * 7) % 35);
      } else if (mod === 1) {
        d.flightState = "takeoff";
        d.flightAltitude = Math.round((d.maxAltitude * 0.3) * 100) / 100;
        d.flightTimer = 0;
      } else if (mod === 2) {
        d.flightState = "flying";
        d.flightAltitude = d.maxAltitude;
        d.flightTimer = 45 + ((idx * 11) % 45);
      } else {
        d.flightState = "landing";
        d.flightAltitude = Math.round((d.maxAltitude * 0.7) * 100) / 100;
        d.flightTimer = 0;
      }
    }

    // Phân tán rải rác các mục tiêu khác nhau
    const lm = MAP_LANDMARKS[(idx * 3 + Math.floor(Math.random() * 3)) % MAP_LANDMARKS.length];
    const angle = (idx * 1.35) + Math.random() * Math.PI;
    const radius = 2.0 + Math.random() * Math.max(2, lm.radius - 2);
    d.targetWaypoint = {
      x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
      z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
      zone: lm.zone
    };
  });

  if (roamTimer) clearInterval(roamTimer);
  roamTimer = setInterval(() => {
    if (formationMode !== "roam") return;
    const now = Date.now();
    disciples.forEach((d) => {
      if (!d.ready || !d.ws) return;

      // Chu kỳ Bay lên - Lượn trên không - Hạ xuống đất luân phiên (nếu bật khinh công)
      if (airWalk) {
        if (!d.flightState) d.flightState = "ground";
        if (d.maxAltitude == null) d.maxAltitude = 2.2 + ((d.index * 9) % 6) * 0.5;
        if (d.takeoffSpeed == null) d.takeoffSpeed = 0.14 + ((d.index * 5) % 5) * 0.02;
        if (d.landingSpeed == null) d.landingSpeed = 0.10 + ((d.index * 3) % 4) * 0.02;

        if (d.flightState === "ground") {
          d.flightAltitude = 0;
          d.flightTimer = (d.flightTimer || 0) - 1;
          // Đi dưới đất đủ lâu thì bắt đầu khinh công bay lên
          if (d.flightTimer <= 0) {
            d.flightState = "takeoff";
          }
        } else if (d.flightState === "takeoff") {
          // Bay lên từ từ, êm ái
          d.flightAltitude = (d.flightAltitude || 0) + d.takeoffSpeed;
          if (d.flightAltitude >= d.maxAltitude) {
            d.flightAltitude = d.maxAltitude;
            d.flightState = "flying";
            d.flightTimer = 50 + ((d.index * 13) % 50);
          }
        } else if (d.flightState === "flying") {
          // Lượn sóng nhẹ bồng bềnh
          const bob = Math.sin((now / 1500) + d.index * 1.5) * 0.2;
          d.flightAltitude = Math.round((d.maxAltitude + bob) * 100) / 100;
          d.flightTimer = (d.flightTimer || 0) - 1;
          if (d.flightTimer <= 0) {
            d.flightState = "landing";
          }
        } else if (d.flightState === "landing") {
          // Từ từ hạ cánh xuống mặt đất
          d.flightAltitude = (d.flightAltitude || 0) - d.landingSpeed;
          // Khi chạm đất: chuyển sang đi bộ tiếp đất, tuyệt đối không bao giờ âm (chống độn thổ)
          if (d.flightAltitude <= 0) {
            d.flightAltitude = 0;
            d.flightState = "ground";
            d.flightTimer = 40 + ((d.index * 11) % 50);
          }
        }
      } else {
        d.flightState = "ground";
        d.flightAltitude = 0;
      }

      // Safe altitude >= 0
      const safeAlt = Math.max(0, d.flightAltitude || 0);

      if (!d.pos) {
        const initG = getGroundY(d.offset.x, d.offset.z);
        d.pos = {
          x: d.offset.x,
          y: Math.max(initG, Math.round((initG + safeAlt) * 100) / 100),
          z: d.offset.z,
          ry: Math.PI
        };
      }

      // BÁM THEO NGƯỜI CHƠI (ACC CHÍNH HOẶC MỤC TIÊU CỤ THỂ)
      let targetPlayer = null;
      if (followPlayer) {
        const players = Array.from(roomOtherPlayers.values()).filter((p) => !isOurDisciple(p.id, p.name));
        if (players.length > 0) {
          if (followTargetName) {
            targetPlayer = players.find((p) => p.name && p.name.toLowerCase().includes(followTargetName.toLowerCase()));
          }
          if (!targetPlayer) {
            // Mặc định: Tập trung toàn bộ đệ tử theo người chơi chính (thường là Acc chính của bạn)
            targetPlayer = players[0];
          }
        }
      }

      if (targetPlayer) {
        d.lastTargetPlayerId = targetPlayer.id;
        let localSlot = 0;
        const readyList = disciples
          .filter((otherD) => otherD.ready && otherD.ws && otherD.ws.readyState === 1)
          .sort((a, b) => a.index - b.index);
        const foundIdx = readyList.indexOf(d);
        localSlot = foundIdx >= 0 ? foundIdx : (d.index - 1);

        const playerRy = targetPlayer.ry || 0;

        // Vector tiến (Forward) theo hướng người chơi đang quay mặt:
        const fX = Math.sin(playerRy);
        const fZ = Math.cos(playerRy);

        // Vector vuông góc sang tay trái (Left) của người chơi:
        const leftX = Math.cos(playerRy);
        const leftZ = -Math.sin(playerRy);

        // Vector vuông góc sang tay phải (Right) của người chơi:
        const rightX = -Math.cos(playerRy);
        const rightZ = Math.sin(playerRy);

        let slotX, slotZ, slotRy;
        if (lectureMode) {
          // ĐỘI HÌNH NGỒI THEO HÀNG (NGHE THUYẾT PHÁP) - TỰ CHIA ĐỆ TỬ THEO SỐ HÀNG ĐÃ NHẬP
          const readyFollowers = disciples.filter((x) => x.ready && x.ws && x.ws.readyState === 1);
          const total = Math.max(1, readyFollowers.length);
          const K = Math.min(total, Math.max(2, lectureRows));

          let rowIndex, colOffset;
          if (lectureOrient === "doc") {
            const numCols = K;
            rowIndex = Math.floor(localSlot / numCols);
            const colIndex = localSlot % numCols;
            colOffset = colIndex - (numCols - 1) / 2;
          } else {
            const numRows = K;
            const cols = Math.ceil(total / numRows);
            rowIndex = Math.floor(localSlot / cols);
            const countInRow = Math.min(cols, total - rowIndex * cols);
            const colIndex = localSlot % cols;
            colOffset = colIndex - (countInRow - 1) / 2;
          }

          const colSpacing = 1.15;
          const rowSpacing = 1.25;
          const baseDist = 1.6 + rowIndex * rowSpacing;

          if (lectureFacing === "front") {
            slotX = targetPlayer.x + fX * baseDist + rightX * (colOffset * colSpacing);
            slotZ = targetPlayer.z + fZ * baseDist + rightZ * (colOffset * colSpacing);
            slotRy = playerRy + Math.PI;
          } else {
            slotX = targetPlayer.x - fX * baseDist + rightX * (colOffset * colSpacing);
            slotZ = targetPlayer.z - fZ * baseDist + rightZ * (colOffset * colSpacing);
            slotRy = playerRy;
          }
        } else if (corridorMode) {
          // ĐỘI HÌNH 2 HÀNG DANH DỰ THẲNG TẮP (TẠO LỐI ĐI Ở GIỮA)
          const isLeft = (localSlot % 2 === 0);
          const rowInCorridor = Math.floor(localSlot / 2);
          const corridorHalfWidth = 1.35; // Lối đi ở giữa rộng 2.7m
          const baseFollowDist = 1.2 + rowInCorridor * 1.15; // Mỗi hàng cách nhau 1.15m

          const latX = isLeft ? leftX : rightX;
          const latZ = isLeft ? leftZ : rightZ;

          slotX = targetPlayer.x - fX * baseFollowDist + latX * corridorHalfWidth;
          slotZ = targetPlayer.z - fZ * baseFollowDist + latZ * corridorHalfWidth;
          slotRy = playerRy;
        } else {
          const totalFollowers = disciples.filter((x) => x.ready).length;
          const formationWidth = totalFollowers > 30 ? 9 : (totalFollowers > 10 ? 5 : 3);
          const row = Math.floor(localSlot / formationWidth);
          const col = (localSlot % formationWidth) - Math.floor(formationWidth / 2);
          const baseFollowDist = 1.8 + row * 0.85;

          slotX = targetPlayer.x - fX * baseFollowDist + rightX * (col * 0.95);
          slotZ = targetPlayer.z - fZ * baseFollowDist + rightZ * (col * 0.95);
          slotRy = playerRy;
        }

        const dx = slotX - d.pos.x;
        const dz = slotZ - d.pos.z;
        const distToSlot = Math.hypot(dx, dz);
        const distToPlayer = Math.hypot(targetPlayer.x - d.pos.x, targetPlayer.z - d.pos.z);

        let currentSpeed = 0.28;
        if (distToSlot > 6.0 || distToPlayer > 8.0) {
          currentSpeed = 0.55;
        } else if (distToSlot > 2.5 || distToPlayer > 4.5) {
          currentSpeed = 0.40;
        }

        if (distToSlot > 0.03) {
          if (distToSlot <= currentSpeed) {
            d.pos.x = Math.round(slotX * 100) / 100;
            d.pos.z = Math.round(slotZ * 100) / 100;
          } else {
            d.pos.x = Math.round((d.pos.x + (dx / distToSlot) * currentSpeed) * 100) / 100;
            d.pos.z = Math.round((d.pos.z + (dz / distToSlot) * currentSpeed) * 100) / 100;
          }
          d.pos.ry = Math.round(slotRy * 100) / 100;
          const moveGroundY = getGroundY(d.pos.x, d.pos.z);
          d.pos.y = Math.max(moveGroundY, Math.round((moveGroundY + safeAlt) * 100) / 100);
          d.lastStateSend = now;

          const isWalking = distToSlot > 0.12;
          d.send({
            t: "state",
            x: d.pos.x,
            y: d.pos.y,
            z: d.pos.z,
            ry: d.pos.ry,
            s: isWalking ? 1 : (targetPlayer.s === 2 ? 2 : 0)
          });
          return;
        } else {
          d.pos.x = Math.round(slotX * 100) / 100;
          d.pos.z = Math.round(slotZ * 100) / 100;
          d.pos.ry = Math.round(slotRy * 100) / 100;
          const moveGroundY = getGroundY(d.pos.x, d.pos.z);
          d.pos.y = Math.max(moveGroundY, Math.round((moveGroundY + safeAlt) * 100) / 100);

          if (!d.lastStateSend || now - d.lastStateSend >= 1200) {
            d.lastStateSend = now;
            const followState = (targetPlayer.s === 2) ? 2 : 0;
            d.send({
              t: "state",
              x: d.pos.x,
              y: d.pos.y,
              z: d.pos.z,
              ry: d.pos.ry,
              s: followState
            });
          }
          return;
        }
      }

      // Nghỉ chân tại chỗ: chỉ gửi keepalive mỗi 2.5s để tiết kiệm đường truyền
      if (d.idleTimer > 0) {
        d.idleTimer--;
        if (!d.lastStateSend || now - d.lastStateSend > 2500) {
          d.lastStateSend = now;
          const curG = getGroundY(d.pos.x, d.pos.z);
          d.pos.y = Math.max(curG, Math.round((curG + safeAlt) * 100) / 100);
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

      // Chọn địa danh mới nếu chưa có (rải rác các khu)
      if (!d.targetWaypoint) {
        const lm = MAP_LANDMARKS[(d.index * 3 + Math.floor(Math.random() * MAP_LANDMARKS.length)) % MAP_LANDMARKS.length];
        const angle = Math.random() * Math.PI * 2;
        const radius = 2.0 + Math.random() * Math.max(2, lm.radius - 2);
        d.targetWaypoint = {
          x: Math.round((lm.x + Math.cos(angle) * radius) * 100) / 100,
          z: Math.round((lm.z + Math.sin(angle) * radius) * 100) / 100,
          zone: lm.zone
        };
      }

      const dx = d.targetWaypoint.x - d.pos.x;
      const dz = d.targetWaypoint.z - d.pos.z;
      const dist = Math.hypot(dx, dz);

      // Đã tới điểm đến: nghỉ chân chênh lệch nhau từ 2s đến 7s
      if (dist < 1.5) {
        d.idleTimer = 10 + Math.floor(Math.random() * 15) + ((d.index * 5) % 10);
        d.targetWaypoint = null;
        const curG = getGroundY(d.pos.x, d.pos.z);
        d.pos.y = Math.max(curG, Math.round((curG + safeAlt) * 100) / 100);
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

      // Tốc độ cá nhân hóa riêng biệt để không bao giờ đi ngang hàng nhau
      const baseSpeed = d.baseSpeed || (0.23 + ((d.index * 7) % 10) * 0.02);
      const stepDist = baseSpeed + (Math.sin(now / 1200 + d.index) * 0.02);
      const moveX = (dx / dist) * Math.min(stepDist, dist);
      const moveZ = (dz / dist) * Math.min(stepDist, dist);
      d.pos.x = Math.round((d.pos.x + moveX) * 100) / 100;
      d.pos.z = Math.round((d.pos.z + moveZ) * 100) / 100;
      const moveGroundY = getGroundY(d.pos.x, d.pos.z);
      // TUYỆT ĐỐI KHÔNG ĐỘN THỔ: luôn >= moveGroundY
      d.pos.y = Math.max(moveGroundY, Math.round((moveGroundY + safeAlt) * 100) / 100);
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
  disciples.forEach((d) => {
    d.idleTimer = 0;
    d.targetWaypoint = null;
    d.flightState = "ground";
    d.flightAltitude = 0;
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

let isShoutingGreeting = false;

function formatGreetingMessage(customMsg) {
  let tpl = (customMsg || "Chào").trim();
  if (!greetIncludeName) {
    if (/{name}|{ten}/i.test(tpl)) {
      return tpl.replace(/{name}|{ten}/gi, "").replace(/\s+/g, " ").trim() || "Chào";
    }
    return tpl;
  }
  const otherPlayers = Array.from(knownPlayers.values());
  const targetPlayer = otherPlayers.length > 0 ? otherPlayers[0] : null;
  const targetName = targetPlayer ? (targetPlayer.name || "Đạo hữu") : "Sư phụ";
  if (/{name}|{ten}/i.test(tpl)) {
    return tpl.replace(/{name}|{ten}/gi, targetName);
  }
  return `${tpl} ${targetName}`;
}

async function shoutGreeting(customMsg) {
  if (isShoutingGreeting) return;
  const readyDisciples = disciples.filter((d) => d.ready && d.ws);
  if (readyDisciples.length === 0) {
    console.log("\x1b[33m[CHÀO] Chưa có đệ tử nào sẵn sàng!\x1b[0m");
    return;
  }
  isShoutingGreeting = true;
  try {
    const msg = formatGreetingMessage(customMsg);
    console.log(`\x1b[32m[ĐỒNG THANH CHÀO] Toàn bộ ${readyDisciples.length} đệ tử ở tất cả các hàng bắt đầu hô: "${msg}"\x1b[0m`);
    const delay = readyDisciples.length > 25 ? 40 : 60;
    for (let i = 0; i < readyDisciples.length; i++) {
      const d = readyDisciples[i];
      try {
        d.send({ t: "emote", e: "chap" });
        d.send({ t: "chat", text: msg });
      } catch {}
      if (i < readyDisciples.length - 1) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    isShoutingGreeting = false;
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
  console.log(`\x1b[32m▶ Bám theo người :\x1b[0m ${followPlayer ? "BẬT (Tự động đi theo người chơi khác)" : "TẮT (Đi dạo tự do)"}`);
  console.log(`\x1b[32m▶ Tự động lạy    :\x1b[0m ${autoBow ? "BẬT (Mỗi 7.5s)" : "TẮT (Nhấn Space / Enter để lạy)"}`);
  let proxyStatus = "TẮT (Kết nối trực tiếp)";
  if (autoFreeProxy) {
    proxyStatus = `TỰ ĐỘNG CÀO (${proxyList.length} SOCKS5 Free)`;
  } else if (proxyList.length === 1) {
    proxyStatus = `BẬT (${proxyList[0]})`;
  } else if (proxyList.length > 1) {
    proxyStatus = `XOAY VÒNG (${proxyList.length} proxy)`;
  }
  console.log(`\x1b[32m▶ Proxy / VPN    :\x1b[0m ${proxyStatus}`);
  console.log(`\x1b[32m▶ Tài nguyên     :\x1b[0m 0% GPU, < 15MB RAM, 0 tab trình duyệt, 0 npm packages`);
  console.log("\x1b[1;36m------------------------------------------------------------------------\x1b[0m");
  console.log("\x1b[1;37mLỆNH ĐIỀU KHIỂN:\x1b[0m");
  console.log("  • \x1b[1;33mNhấn phím Space hoặc Enter\x1b[0m: Toàn bộ đệ tử lạy ngay lập tức");
  console.log("  • \x1b[1;33mGõ 'roam' + Enter\x1b[0m         : Cho đệ tử tản ra đi dạo tự do khắp bản đồ chùa");
  console.log("  • \x1b[1;33mGõ 'hall' + Enter\x1b[0m         : Triệu tập toàn bộ đệ tử về Chánh điện xếp hàng");
  console.log("  • \x1b[1;33mGõ 'air' hoặc 'fly' + Enter\x1b[0m : Bật/tắt chế độ Đi trên không (Khinh công)");
  console.log("  • \x1b[1;33mGõ 'follow' hoặc 'f' + Enter\x1b[0m: Bật/tắt chế độ Tự đi theo người chơi khác");
  console.log("  • \x1b[1;33mGõ 'corridor' hoặc 'hang2'\x1b[0m   : Bật/tắt đội hình 2 hàng danh dự tạo lối đi");
  console.log("  • \x1b[1;33mGõ 'rows <số hàng>' hoặc 'hang <n>'\x1b[0m: Ngồi theo hàng nghe thuyết pháp (VD: rows 4)");
  console.log("  • \x1b[1;33mGõ 'ngang' / 'doc' + Enter\x1b[0m  : Chuyển đổi giữa Hàng Ngang ↔ Hàng Dọc");
  console.log("  • \x1b[1;33mGõ 'front' / 'behind'\x1b[0m       : Ngồi trước mặt đối diện hoặc sau lưng sư phụ");
  console.log("  • \x1b[1;33mGõ 'greet <câu>' hoặc 'chao'\x1b[0m: Cho các đệ tử chắp tay hô chào");
  console.log("  • \x1b[1;33mGõ 'kemten' hoặc 'tagname'\x1b[0m   : Bật/tắt kèm tên người theo dõi khi chat");
  console.log("  • \x1b[1;33mGõ 'proxy <url>' + Enter\x1b[0m  : Đổi proxy (VD: proxy socks5://127.0.0.1:40000)");
  console.log("  • \x1b[1;33mGõ 'freeproxy' + Enter\x1b[0m    : Tự động cào danh sách Proxy SOCKS5 miễn phí");
  console.log("  • \x1b[1;33mGõ 'noproxy' + Enter\x1b[0m      : Tắt proxy, trở về kết nối trực tiếp");
  console.log("  • \x1b[1;33mGõ 'count <số>' + Enter\x1b[0m   : Đổi số lượng đệ tử (VD: count 6)");
  console.log("  • \x1b[1;33mGõ 'name <tên>' + Enter\x1b[0m   : Đổi tên đệ tử (VD: name Thích Tuệ Minh)");
  console.log("  • \x1b[1;33mGõ 'auto' + Enter\x1b[0m        : Bật/tắt tự động lạy theo chu kỳ");
  console.log("  • \x1b[1;33mGõ 'status' + Enter\x1b[0m      : Kiểm tra trạng thái đệ tử");
  console.log("  • \x1b[1;33mGõ 'room <tên>' + Enter\x1b[0m  : Đổi phòng (VD: room chua-2)");
  console.log("  • \x1b[1;33mGõ 'exit' hoặc Ctrl+C\x1b[0m    : Thoát chương trình");
  console.log("\x1b[1;36m========================================================================\x1b[0m\n");
}

async function startAll() {
  if (autoFreeProxy && proxyList.length === 0) {
    console.log("\x1b[33m[PROXY] Đang tự động cào danh sách Proxy SOCKS5 sống miễn phí...\x1b[0m");
    await fetchFreeProxies();
  }
  printHeader();
  disciples.forEach((d, idx) => {
    setTimeout(() => d.connect(), idx * 250);
  });
}

startAll();

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
    if (!isNaN(newCount) && newCount >= 1 && newCount <= 499) {
      adjustDiscipleCount(newCount);
    } else {
      console.log("\x1b[31m[LỖI] Số lượng đệ tử phải là số từ 1 đến 499!\x1b[0m");
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
    console.log(`\x1b[36m[KHINH CÔNG] Đã ${airWalk ? "BẬT (chu kỳ tự bay lên & lượn xuống mặt đất không độn thổ)" : "TẮT (tiếp đất bình thường)"} chế độ Đi trên không!\x1b[0m`);
    disciples.forEach((d, idx) => {
      if (!airWalk) {
        d.flightState = "ground";
        d.flightAltitude = 0;
      } else if (!d.flightState || d.flightState === "ground") {
        d.flightState = (idx % 2 === 0) ? "takeoff" : "ground";
        d.flightTimer = 30 + ((idx * 9) % 30);
      }
      if (d.pos) {
        let altitude = 0;
        if (airWalk) {
          if (formationMode === "hall") {
            const row = Math.floor((d.index - 1) / 6);
            const col = (d.index - 1) % 6;
            altitude = 2.0 + (row * 0.7) + ((col % 3) * 0.25);
          } else {
            altitude = Math.max(0, d.flightAltitude || 0);
          }
        }
        const baseY = (formationMode === "hall") ? 2.4 : getGroundY(d.pos.x, d.pos.z);
        // Tuyệt đối không độn thổ: d.pos.y luôn >= baseY
        d.pos.y = Math.max(baseY, Math.round((baseY + altitude) * 100) / 100);
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
  } else if (cmd === "follow" || cmd === "f" || cmd === "bamtheo") {
    followPlayer = !followPlayer;
    console.log(`\x1b[36m[BÁM THEO] Đã ${followPlayer ? "BẬT (tự động chia đều bám theo người chơi khác)" : "TẮT (trở về đi dạo tự do)"} chế độ Đi theo người chơi khác!\x1b[0m`);
    if (followPlayer && formationMode !== "roam") {
      startRoaming();
    }
  } else if (cmd === "corridor" || cmd === "hang2" || cmd === "loidi") {
    corridorMode = !corridorMode;
    if (corridorMode) lectureMode = false;
    console.log(`\x1b[36m[2 HÀNG DANH DỰ] Đã ${corridorMode ? "BẬT (xếp 2 hàng tạo lối đi thông thoáng ở giữa)" : "TẮT (trở về cánh cung)"}!\x1b[0m`);
  } else if (cmd.startsWith("rows ") || cmd.startsWith("hang ")) {
    const num = parseInt(cmd.replace(/^(rows|hang)\s+/, ""), 10);
    if (!isNaN(num) && num >= 2) {
      lectureRows = Math.min(30, num);
      lectureMode = true;
      corridorMode = false;
      const total = disciples.filter((x) => x.ready).length;
      const other = Math.ceil(Math.max(1, total) / lectureRows);
      const orientText = lectureOrient === "doc" ? `${lectureRows} hàng dọc (mỗi hàng dài ~${other} đệ tử)` : `${lectureRows} hàng ngang (mỗi hàng ~${other} đệ tử)`;
      console.log(`\x1b[35m[NGỒI THEO HÀNG] Đã BẬT: Chia đều ${total} đệ tử thành ${orientText}! Hướng ngồi: ${lectureFacing === "front" ? "Trước mặt đối diện" : "Sau lưng"}\x1b[0m`);
    } else {
      console.log("\x1b[31m[LỖI] Số hàng phải lớn hơn hoặc bằng 2!\x1b[0m");
    }
  } else if (cmd === "hangngang" || cmd === "ngang") {
    lectureOrient = "ngang";
    const total = disciples.filter((x) => x.ready).length;
    const cols = Math.ceil(Math.max(1, total) / lectureRows);
    console.log(`\x1b[35m[KIỂU HÀNG] Đã chuyển sang xếp theo HÀNG NGANG (${lectureRows} hàng ngang, mỗi hàng ~${cols} đệ tử ngồi cạnh nhau)!\x1b[0m`);
  } else if (cmd === "hangdoc" || cmd === "doc") {
    lectureOrient = "doc";
    const total = disciples.filter((x) => x.ready).length;
    const rows = Math.ceil(Math.max(1, total) / lectureRows);
    console.log(`\x1b[35m[KIỂU HÀNG] Đã chuyển sang xếp theo HÀNG DỌC (${lectureRows} hàng dọc, mỗi hàng dài ~${rows} đệ tử xếp thẳng ra sau)!\x1b[0m`);
  } else if (cmd.startsWith("facing ") || cmd === "front" || cmd === "behind") {
    if (cmd === "front" || cmd.includes("front") || cmd.includes("truoc")) {
      lectureFacing = "front";
      console.log(`\x1b[35m[HƯỚNG NGỒI] Đã chuyển sang: TRƯỚC MẶT ĐỐI DIỆN!\x1b[0m`);
    } else {
      lectureFacing = "behind";
      console.log(`\x1b[35m[HƯỚNG NGỒI] Đã chuyển sang: SAU LƯNG!\x1b[0m`);
    }
  } else if (cmd === "lecture" || cmd === "thuyetphap") {
    lectureMode = !lectureMode;
    if (lectureMode) corridorMode = false;
    const orientText = lectureOrient === "doc" ? `${lectureRows} hàng dọc` : `${lectureRows} hàng ngang`;
    console.log(`\x1b[35m[NGHE THUYẾT PHÁP] Đã ${lectureMode ? `BẬT (ngồi theo ${orientText})` : "TẮT (về cánh cung)"}!\x1b[0m`);
  } else if (cmd === "look" || cmd === "trangphuc" || cmd === "randomlook") {
    randomLook = !randomLook;
    lookSeed = Math.floor(Math.random() * 10000);
    console.log(`\x1b[35m[TRANG PHỤC] Đã ${randomLook ? "BẬT ngẫu nhiên trang phục & pháp khí đa dạng" : "TẮT (áo nâu truyền thống)"}!\x1b[0m`);
  } else if (cmd.startsWith("greet") || cmd.startsWith("chao")) {
    const parts = line.trim().split(/\s+/);
    const custom = parts.slice(1).join(" ").trim();
    shoutGreeting(custom);
  } else if (cmd === "tagname" || cmd === "kemten" || cmd === "greetname") {
    greetIncludeName = !greetIncludeName;
    console.log(`\x1b[35m[KÈM TÊN CHAT] Đã ${greetIncludeName ? "BẬT (kèm tên người theo dõi)" : "TẮT (chỉ chat nội dung bạn nhập)"}!\x1b[0m`);
  } else if (cmd.startsWith("proxy ") || cmd === "proxy") {
    const newProxy = line.trim().replace(/^proxy\s*/, "").trim();
    if (!newProxy) {
      console.log(`\x1b[36m[PROXY HIỆN TẠI] ${proxyList.length ? proxyList.join(", ") : "Không dùng (Kết nối trực tiếp)"}\x1b[0m`);
    } else {
      proxyList = [newProxy];
      autoFreeProxy = false;
      console.log(`\x1b[32m[PROXY] Đã đặt proxy mới: ${newProxy}! Đang kết nối lại các đệ tử...\x1b[0m`);
      disciples.forEach((d) => d.reconnect());
    }
  } else if (cmd === "freeproxy" || cmd === "autoproxy") {
    autoFreeProxy = true;
    console.log("\x1b[33m[PROXY] Đang tải mới danh sách Proxy SOCKS5 miễn phí...\x1b[0m");
    fetchFreeProxies().then(() => {
      disciples.forEach((d) => d.reconnect());
    });
  } else if (cmd === "noproxy" || cmd === "tatproxy") {
    proxyList = [];
    autoFreeProxy = false;
    console.log("\x1b[33m[PROXY] Đã TẮT proxy, chuyển về kết nối trực tiếp!\x1b[0m");
    disciples.forEach((d) => d.reconnect());
  } else if (cmd.startsWith("target ") || cmd === "target") {
    const rawT = line.trim().replace(/^target\s*/, "").trim();
    if (!rawT || rawT === "auto" || rawT === "all") {
      followTargetName = "";
      console.log(`\x1b[36m[MỤC TIÊU] Đã chuyển về tự động tập trung theo Acc chính trong chùa!\x1b[0m`);
    } else {
      followTargetName = rawT;
      console.log(`\x1b[36m[MỤC TIÊU] Đã đặt mục tiêu bám theo: "${followTargetName}"!\x1b[0m`);
    }
    if (!followPlayer) {
      followPlayer = true;
      if (formationMode !== "roam") startRoaming();
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

