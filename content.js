(() => {
  if (window.__ATD_AUTO_TASK_LOADED__) return;
  window.__ATD_AUTO_TASK_LOADED__ = true;

  // --- CHẾ ĐỘ PHÂN TÁCH DANH TÍNH ĐA TAB / CLONE TAB (?clone=1, ?clone=2, ...) ---
  const urlParams = new URLSearchParams(window.location.search);
  const currentCloneId = urlParams.get("clone");
  const isCloneTab = Boolean(currentCloneId);

  if (isCloneTab) {
    try {
      const prefix = `atd_clone_${currentCloneId}_`;
      const origGet = Storage.prototype.getItem;
      const origSet = Storage.prototype.setItem;
      const origRemove = Storage.prototype.removeItem;

      const isolatedKeys = new Set([
        "anduyen.cid",
        "anduyen.profile",
        "anduyen.adopt",
        "anduyen.today",
        "anduyen.bag.xam",
        "anduyen.bag.words",
        "atd_tasks",
        "atd_done_once"
      ]);

      Storage.prototype.getItem = function(key) {
        if (this === window.localStorage && isolatedKeys.has(key)) {
          return sessionStorage.getItem(prefix + key);
        }
        return origGet.apply(this, arguments);
      };

      Storage.prototype.setItem = function(key, val) {
        if (this === window.localStorage && isolatedKeys.has(key)) {
          return sessionStorage.setItem(prefix + key, String(val));
        }
        return origSet.apply(this, arguments);
      };

      Storage.prototype.removeItem = function(key) {
        if (this === window.localStorage && isolatedKeys.has(key)) {
          return sessionStorage.removeItem(prefix + key);
        }
        return origRemove.apply(this, arguments);
      };

      console.log(`[AutoTask] Đã kích hoạt Clone Tab #${currentCloneId} · Phân tách tài khoản độc lập!`);
      const origDocTitle = document.title;
      document.title = `[Clone #${currentCloneId}] ${origDocTitle || "An Tự Duyên"}`;
    } catch (e) {
      console.warn("[AutoTask] Clone storage hook error:", e);
    }
  }

  // --- HỆ THỐNG ĐỒNG BỘ LẠY ĐỒNG TÂM & BẮT NHỊP WEBSOCKET SWARM ---
  const TAB_ID = Math.random().toString(36).slice(2, 8);
  const swarmChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("atd_swarm_sync") : null;
  let activeWs = null;
  let lastPeerBowTime = 0;
  let lastOwnBowTime = 0;
  let autoDongTam = true;
  let currentZone = "";
  let lastKnownPlace = "";
  let peerBowEvents = [];
  let minPeersToBow = isCloneTab ? 1 : Number(localStorage.getItem("atd_dt_min") || "2");
  let lastLandedCraneTime = 0;
  let lastHacData = null;

  function triggerBowAction() {
    const now = Date.now();
    if (now - lastOwnBowTime < 4800) return false;

    // Chỉ lạy khi nhân vật đang đứng ở nơi có nút Lạy (Chánh điện, Quan Âm, Nguyệt Lão, Bảo Tháp)
    const layBtn = findActionBtn("Lạy");
    if (!layBtn || layBtn.disabled) return false;

    lastOwnBowTime = now;
    fireClick(layBtn);
    return true;
  }

  function broadcastSwarmBow() {
    if (swarmChannel) {
      try {
        swarmChannel.postMessage({ type: "SWARM_BOW", from: TAB_ID, time: Date.now() });
      } catch {}
    }
  }

  if (swarmChannel) {
    swarmChannel.onmessage = (event) => {
      const data = event.data;
      if (!data || data.from === TAB_ID) return;
      if (data.type === "SWARM_BOW" && autoDongTam) {
        const now = Date.now();
        const peerId = `Tab_${data.from}`;
        peerBowEvents = peerBowEvents.filter((e) => now - e.time <= 4500 && e.id !== peerId);
        peerBowEvents.push({ id: peerId, time: now });
        lastPeerBowTime = now;

        const count = peerBowEvents.length;
        if (count >= minPeersToBow) {
          log(`✦ SÓNG LẠY ĐỒNG TÂM: Đã gom đủ ${count}/${minPeersToBow} người (có Tab Swarm) -> Lập tức lạy cùng!`, "ok");
          if (triggerBowAction()) {
            peerBowEvents = [];
          }
        } else {
          log(`[Đồng tâm Swarm] Có ${count}/${minPeersToBow} lượt lạy từ Tab khác · Chờ thêm để đủ ≥${minPeersToBow} người…`, "wait");
        }
      }
    };
  }

  // Quản lý mở các Tab Clone (độc lập tài khoản) để cùng túc trực Chánh điện & Lạy đồng tâm
  let nextCloneCounter = 1;
  function openNewCloneTab(specificIndex) {
    const id = specificIndex || nextCloneCounter++;
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set("clone", String(id));
    const curRoom = targetUrl.searchParams.get("phong");
    if (!curRoom) {
      targetUrl.searchParams.set("phong", "chua1");
    }
    window.open(targetUrl.toString(), "_blank");
    log(`👥 Đã mở Tab Clone #${id} (độc lập danh tính) · Tự động vào Chánh điện lạy cùng!`, "ok");
  }

  function openMultipleClones(total = 3) {
    log(`🚀 Đang mở ${total} Tab Clone độc lập danh tính vào Chánh điện…`, "step");
    for (let i = 1; i <= total; i++) {
      setTimeout(() => {
        openNewCloneTab(i);
      }, (i - 1) * 700);
    }
  }

  // Danh mục phân loại tác vụ cho hệ thống Tabs
  const TASK_CATEGORIES = [
    { id: "all", label: "🌟 Tất cả" },
    { id: "tutap", label: "📿 Tu tập" },
    { id: "huong", label: "🕯️ Hương & Lạy" },
    { id: "congqua", label: "🌸 Công quả" },
    { id: "linhvat", label: "🐾 Linh thú" }
  ];

  // Danh sách nhiệm vụ đầy đủ khớp với giao thức & bản cập nhật mới nhất (main-C2FINDTG.js)
  const ALL_TASKS = [
    // 📿 Tu tập & Khóa lễ
    { id: "thoikhoa", label: "Thời khóa", category: "tutap", once: true },
    { id: "tangkinh", label: "Tàng Kinh Các", category: "tutap", once: true },
    { id: "bode", label: "Hạt bồ đề", category: "tutap", once: true },
    { id: "mo", label: "Gõ mõ", category: "tutap", once: false },
    { id: "beads", label: "Chuỗi hạt", category: "tutap", once: false },
    { id: "claim", label: "Nhận thưởng", category: "tutap", once: false },

    // 🕯️ Lễ bái & Hương
    { id: "incense", label: "Hương & Lạy", category: "huong", once: false },
    { id: "dongtam", label: "Lạy đồng tâm", category: "huong", once: false },
    { id: "san_incense", label: "Hương Sân chùa", category: "huong", once: true },
    { id: "qa_incense", label: "Hương Quan Âm", category: "huong", once: true },
    { id: "am_incense", label: "Hương Am riêng", category: "huong", once: true },
    { id: "bell", label: "Thỉnh chuông", category: "huong", once: true },
    { id: "lamp", label: "Thắp đèn", category: "huong", once: true },

    // 🌸 Công quả & Duyên lành
    { id: "garden", label: "Vườn hoa & Dâng hoa", category: "congqua", once: true },
    { id: "quet", label: "Quét lá", category: "congqua", once: true },
    { id: "ca", label: "Phóng sinh", category: "congqua", once: true },
    { id: "hoadang", label: "Hoa đăng", category: "congqua", once: true },
    { id: "xinxam", label: "Xin xăm", category: "congqua", once: true },
    { id: "thaydo", label: "Xin chữ", category: "congqua", once: true },
    { id: "hoavang", label: "Hóa vàng", category: "congqua", once: true },

    // 🐾 Linh thú & Dạo cảnh
    { id: "linhthu", label: "Vườn Linh Thú", category: "linhvat", once: true },
    { id: "choan", label: "Cho ăn thú", category: "linhvat", once: true },
    { id: "cuoitrau", label: "Cưỡi trâu", category: "linhvat", once: true },
    { id: "cuoihac", label: "Cưỡi hạc", category: "linhvat", once: true }
  ];

  // Chỉ mục địa điểm trong mảng Zi của main-C2FINDTG.js (Menu -> Bản đồ)
  const PLACES = {
    CONG_TAM_QUAN: 0,
    HAC_TRANG: 1,
    BAI_CHAN_TRAU: 2,
    RUA_THAN: 3,
    SAN_CHUA: 4,
    CHANH_DIEN: 5,
    BAO_THAP: 6,
    HO_SEN: 7,
    VUON_THIEN: 8,
    GAC_CHUONG: 9,
    THAP_NGHI: 10,
    AM_RIENG: 11,
    PHAP_DUONG: 12,
    TANG_KINH_CAC: 13,
    THAY_DO: 14,
    GIENG_NGOC: 15,
    TUONG_DI_LAC: 16,
    DEN_NGUYET_LAO: 17,
    VUON_LINH_THU: 18,
    VUON_HOA: 19
  };

  // Trạng thái chuỗi 108 hạt bồ đề từ Server ({ t: "bode", got })
  let bodeGot = localStorage.getItem("atd_bode_got") || "";

  // Toàn bộ 108 tọa độ hạt bồ đề khắp chùa [x, y, z, zoneIdx, isNightOnly]
  const BODE_SEEDS = [
    [2.2,0,115.8,0,0],[-2.6,.3,143.8,0,0],[-12.2,0,99.8,0,0],[12.6,0,99.8,0,0],[3,.3,130.2,0,1],[-.2,0,103,0,0],[-5.8,0,119.8,0,0],[4.6,0,96.6,0,0],[-2.6,.3,135.8,0,0],
    [-1.8,0,78.2,1,0],[14.2,0,64.6,1,0],[15.8,0,87,1,0],[-5,0,59.8,1,0],[-5.8,0,95,1,1],[-17.8,0,83,1,0],[-17,0,68.6,1,0],[6.2,0,94.2,1,0],[3,0,67.8,1,0],
    [-.2,0,35.8,2,0],[-6.6,0,52.6,2,0],[11,0,49.4,2,0],[-16.2,0,35,2,0],[9.4,0,23,2,1],[-5,0,21.4,2,0],[10.2,0,38.2,2,0],[-9,0,42.2,2,0],[-8.2,0,30.2,2,0],
    [-24.2,0,31.8,3,0],[28.6,1.8,10.2,3,0],[25.4,.3,57.4,3,0],[-25.8,.3,57.4,3,0],[28.6,0,35,3,1],[-28.2,1.8,10.2,3,0],[-25,.3,44.6,3,0],[24.6,.3,22.2,3,0],[27,.3,46.2,3,0],
    [1.4,2.4,-4.2,4,0],[-18.6,2.4,-29,4,0],[19,2.4,-29,4,0],[-20.2,2.4,3,4,0],[19.8,2.4,3,4,1],[-.2,2.4,-23.4,4,0],[-13.8,2.4,-13,4,0],[15.8,2.4,-13,4,0],[-8.2,2.4,3,4,0],
    [-.2,4.6,-67.4,5,0],[-3.4,4.6,-47.4,5,0],[12.6,4.6,-55.4,5,0],[-13,4.6,-59.4,5,0],[12.6,4.6,-69.8,5,1],[-10.6,4.6,-72.2,5,0],[1.4,4.6,-57,5,0],[4.6,0,-76.2,5,0],[5.4,4.6,-48.2,5,0],
    [40.6,0,33.4,6,0],[67,0,-.2,6,0],[33.4,0,1.4,6,0],[71,0,32.6,6,0],[29.4,0,19,6,1],[71,0,15.8,6,0],[44.6,0,44.6,6,0],[29.4,0,31,6,0],[34.2,.13,11,6,0],
    [-39.4,0,24.6,7,0],[-43.4,0,5.4,7,0],[-54.6,0,30.2,7,0],[-29,1.8,12.6,7,0],[-54.6,0,13.4,7,1],[-44.2,0,38.2,7,0],[-29,0,31.8,7,0],[-49,0,22.2,7,0],[-38.6,0,14.2,7,0],
    [-32.2,0,-30.6,8,0],[-56.2,0,-43.4,8,0],[-53.8,0,-18.6,8,0],[-36.2,0,-44.2,8,0],[-35.4,0,-17.8,8,1],[-29,1.8,-39.4,8,0],[-29,1.8,-24.2,8,0],[-57,0,-24.2,8,0],[-34.6,0,-23.4,8,0],
    [41.4,5.43,-51.4,9,0],[31,0,-44.2,9,0],[51.8,5.02,-53.8,9,0],[47.8,5.14,-46.6,9,0],[45.4,5.09,-57.8,9,1],[43,5.2,-47.4,9,0],[30.2,0,-48.2,9,0],[51,5.2,-49.8,9,0],[49.4,5.03,-57,9,0],
    [-46.6,0,81.4,10,0],[-37.8,0,67,10,0],[-37.8,0,95,10,0],[-53.8,0,67,10,0],[-53.8,0,95,10,1],[-37,0,79.8,10,0],[-45.8,0,71.8,10,0],[-45.8,0,91,10,0],[-53.8,0,75.8,10,0],
    [14.2,0,75.8,11,0],[19,0,67,11,0],[15.8,0,84.6,11,0],[10.2,0,67,11,0],[10.2,0,81.4,11,1],[19,0,79.8,11,0],[8.6,0,75,11,0],[14.2,0,70.2,11,0],[19,0,71.8,11,0]
  ];

  const todayDateStr = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  function loadDoneOnce() {
    try {
      const raw = localStorage.getItem("atd_done_once");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === todayDateStr() && Array.isArray(parsed.tasks)) {
          return new Set(parsed.tasks);
        }
      }
    } catch {}
    return new Set();
  }

  function saveDoneOnce() {
    try {
      localStorage.setItem("atd_done_once", JSON.stringify({
        day: todayDateStr(),
        tasks: Array.from(doneOnce)
      }));
    } catch {}
  }

  function loadServerChores() {
    try {
      const raw = localStorage.getItem("atd_server_chores");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === todayDateStr()) {
          return {
            quet: Boolean(parsed.quet),
            den: Boolean(parsed.den),
            ca: Boolean(parsed.ca),
            tk: Boolean(parsed.tk)
          };
        }
      }
    } catch {}
    return { quet: false, den: false, ca: false, tk: false };
  }

  function saveServerChores() {
    try {
      localStorage.setItem("atd_server_chores", JSON.stringify({
        day: todayDateStr(),
        quet: Boolean(serverChores.quet),
        den: Boolean(serverChores.den),
        ca: Boolean(serverChores.ca),
        tk: Boolean(serverChores.tk)
      }));
    } catch {}
  }

  const serverChores = loadServerChores();
  const enabledTasks = new Set(ALL_TASKS.map((t) => t.id));
  const doneOnce = loadDoneOnce();

  // Đồng bộ ban đầu nếu serverChores đã lưu
  if (serverChores.quet) doneOnce.add("quet");
  if (serverChores.ca) doneOnce.add("ca");
  if (serverChores.den) doneOnce.add("lamp");
  if (serverChores.tk) doneOnce.add("thoikhoa");

  function syncServerMessage(msg) {
    if (!msg || !msg.t) return;
    let changed = false;

    // 1. Chores từ welcome hoặc chores
    if (msg.t === "welcome" && msg.chores) {
      if (typeof msg.chores.quet === "boolean" && serverChores.quet !== msg.chores.quet) {
        serverChores.quet = msg.chores.quet;
        changed = true;
      }
      if (typeof msg.chores.ca === "boolean" && serverChores.ca !== msg.chores.ca) {
        serverChores.ca = msg.chores.ca;
        changed = true;
      }
      if (typeof msg.chores.den === "boolean" && serverChores.den !== msg.chores.den) {
        serverChores.den = msg.chores.den;
        changed = true;
      }
    } else if (msg.t === "chores" && msg.c) {
      if (typeof msg.c.quet === "boolean" && serverChores.quet !== msg.c.quet) {
        serverChores.quet = msg.c.quet;
        changed = true;
      }
      if (typeof msg.c.ca === "boolean" && serverChores.ca !== msg.c.ca) {
        serverChores.ca = msg.c.ca;
        changed = true;
      }
      if (typeof msg.c.den === "boolean" && serverChores.den !== msg.c.den) {
        serverChores.den = msg.c.den;
        changed = true;
      }
    } else if (msg.t === "merit" && msg.me) {
      // 2. Merit & Quests từ server
      if (typeof msg.me.tk === "boolean" && serverChores.tk !== msg.me.tk) {
        serverChores.tk = msg.me.tk;
        changed = true;
      }
      if (Array.isArray(msg.me.quests)) {
        for (const q of msg.me.quests) {
          const isDone = Boolean(q.claimed || (q.have >= q.need));
          if (!isDone) continue;
          if (q.id === "quet" || q.id === "leaf") {
            if (!serverChores.quet) { serverChores.quet = true; changed = true; }
          } else if (q.id === "ca" || q.id === "fish") {
            if (!serverChores.ca) { serverChores.ca = true; changed = true; }
          } else if (q.id === "den" || q.id === "lamp") {
            if (!serverChores.den) { serverChores.den = true; changed = true; }
          } else if (q.id === "tk" || q.id === "khoe" || q.id === "thoikhoa") {
            if (!serverChores.tk) { serverChores.tk = true; changed = true; }
          } else if (q.id === "tangkinh") {
            doneOnce.add("tangkinh");
          } else if (q.id === "bell") {
            doneOnce.add("bell");
          } else if (q.id === "garden") {
            doneOnce.add("garden");
          }
        }
      }
    }

    if (serverChores.quet && !doneOnce.has("quet")) { doneOnce.add("quet"); changed = true; }
    if (serverChores.ca && !doneOnce.has("ca")) { doneOnce.add("ca"); changed = true; }
    if (serverChores.den && !doneOnce.has("lamp")) { doneOnce.add("lamp"); changed = true; }
    if (serverChores.tk && !doneOnce.has("thoikhoa")) { doneOnce.add("thoikhoa"); changed = true; }

    // 3. Tiến độ Hạt bồ đề từ Server ({ t: "bode", got })
    if (msg.t === "bode" && typeof msg.got === "string") {
      bodeGot = msg.got;
      try { localStorage.setItem("atd_bode_got", msg.got); } catch {}
      if ([...msg.got].every((c) => c === "1")) {
        doneOnce.add("bode");
      }
      changed = true;
    }
    if (msg.t === "bode-nhat" && typeof msg.i === "number") {
      if (bodeGot && bodeGot.length === 108) {
        bodeGot = bodeGot.slice(0, msg.i) + "1" + bodeGot.slice(msg.i + 1);
        try { localStorage.setItem("atd_bode_got", bodeGot); } catch {}
        if ([...bodeGot].every((c) => c === "1")) {
          doneOnce.add("bode");
        }
      }
      changed = true;
    }

    if (changed) {
      saveServerChores();
      saveDoneOnce();
      try { updateTagUI(); } catch {}
      try { updateTodayStatsUI(); } catch {}
    }
  }

  function queryServerMerit() {
    try {
      if (activeWs && activeWs.readyState === WebSocket.OPEN) {
        activeWs.send(JSON.stringify({ t: "merit" }));
      }
    } catch {}
  }

  // Hook WebSocket để đón bắt các gói tin lạy của người chơi khác trong điện
  try {
    const origSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(...args) {
      activeWs = this;
      if (!this._atdMsgHooked) {
        this._atdMsgHooked = true;
        this.addEventListener("message", (evt) => {
          try {
            const data = typeof evt.data === "string" ? JSON.parse(evt.data) : null;
            if (data && data.t === "linhvat" && data.hac) {
              lastHacData = data.hac;
            }
          } catch {}
        });
      }
      try {
        const payload = typeof args[0] === "string" ? JSON.parse(args[0]) : null;
        if (payload) {
          if (payload.t === "lv-xuong") {
            lastLandedCraneTime = Date.now();
          }
          if (payload.t === "visit" && payload.zone) {
            currentZone = payload.zone;
            lastKnownPlace = payload.zone;
          }
          if (payload.t === "emote" && payload.e === "lay") {
            lastOwnBowTime = Date.now();
            broadcastSwarmBow();
          }
          if (payload.t === "viec") {
            if (payload.k === "quet") {
              serverChores.quet = true;
              doneOnce.add("quet");
              saveServerChores();
              saveDoneOnce();
              try { updateTagUI(); } catch {}
              try { updateTodayStatsUI(); } catch {}
            } else if (payload.k === "ca") {
              serverChores.ca = true;
              doneOnce.add("ca");
              saveServerChores();
              saveDoneOnce();
              try { updateTagUI(); } catch {}
              try { updateTodayStatsUI(); } catch {}
            } else if (payload.k === "den") {
              serverChores.den = true;
              doneOnce.add("lamp");
              saveServerChores();
              saveDoneOnce();
              try { updateTagUI(); } catch {}
              try { updateTodayStatsUI(); } catch {}
            }
          }
          if (payload.t === "tk-done") {
            serverChores.tk = true;
            doneOnce.add("thoikhoa");
            saveServerChores();
            saveDoneOnce();
            try { updateTagUI(); } catch {}
            try { updateTodayStatsUI(); } catch {}
          }
        }
      } catch {}
      return origSend.apply(this, args);
    };

    const origOnMessageDesc = Object.getOwnPropertyDescriptor(WebSocket.prototype, "onmessage");
    if (origOnMessageDesc && origOnMessageDesc.set) {
      Object.defineProperty(WebSocket.prototype, "onmessage", {
        set(fn) {
          activeWs = this;
          const wrapped = function(event) {
            try {
              if (typeof event.data === "string") {
                const msg = JSON.parse(event.data);
                syncServerMessage(msg);

                // Bắt gói tin emote lạy của người khác trong phòng
                if (msg.t === "emote" && msg.e === "lay") {
                  const now = Date.now();
                  const peerId = msg.id || "Người chơi";
                  peerBowEvents = peerBowEvents.filter((e) => now - e.time <= 4500 && e.id !== peerId);
                  peerBowEvents.push({ id: peerId, time: now });
                  lastPeerBowTime = now;

                  const count = peerBowEvents.length;
                  if (autoDongTam) {
                    if (count >= minPeersToBow) {
                      log(`✦ SÓNG LẠY ĐỒNG TÂM: Đã gom đủ ${count}/${minPeersToBow} người cùng lạy -> Lập tức lạy cùng để tối đa công đức!`, "ok");
                      if (triggerBowAction()) {
                        broadcastSwarmBow();
                        peerBowEvents = [];
                      }
                    } else {
                      log(`[Radar Đồng tâm] Đang có ${count}/${minPeersToBow} người vừa lạy (${peerId}) · Chờ thêm để đủ sóng ≥${minPeersToBow} người…`, "wait");
                    }
                  }
                }
                // Nhận công đức từ chùa
                if (msg.t === "merit" && msg.gain) {
                  log(`✦ Nhận công đức từ chùa: +${msg.gain}`, "ok");
                }
              }
            } catch {}
            return fn.call(this, event);
          };
          return origOnMessageDesc.set.call(this, wrapped);
        },
        get() {
          return origOnMessageDesc.get.call(this);
        }
      });
    }
  } catch (err) {
    console.warn("[ATD] WebSocket hook:", err);
  }

  let running = false;
  let runId = 0;
  let loopMode = true;
  let enableKhoe = false;
  let tkReadCursor = 0;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.display !== "none" &&
      s.visibility !== "hidden" &&
      Number(s.opacity) !== 0
    );
  };

  const norm = (s) =>
    (s || "").replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");

  function log(message, kind = "info") {
    const el = $("#atd-log");
    if (!el) return;
    const row = document.createElement("div");
    row.className = `atd-log-row ${kind}`;
    const time = new Date().toLocaleTimeString("vi-VN");
    row.textContent = `[${time}] ${message}`;
    el.prepend(row);
    while (el.children.length > 120) el.lastElementChild.remove();
  }

  function setStatus(message, state = "info") {
    const el = $("#atd-status");
    if (el) el.textContent = message;
    const dot = $("#atd-status-dot");
    if (dot) {
      dot.className = "atd-status-dot " + (running ? "running" : state);
    }
    const fab = $("#atd-fab");
    if (fab) {
      fab.title = `An Tự Duyên Auto Task: ${message} (Bấm để mở)`;
    }
  }

  function checkRun(myRun) {
    if (!running || myRun !== runId) {
      throw new Error("__ATD_STOPPED__");
    }
  }

  function sleep(ms, myRun) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        if (myRun !== undefined && (!running || myRun !== runId)) {
          reject(new Error("__ATD_STOPPED__"));
        } else {
          resolve();
        }
      }, ms);
    });
  }

  async function waitFor(predicate, timeoutMs = 3000, myRun, intervalMs = 120) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      if (myRun !== undefined) checkRun(myRun);
      const res = predicate();
      if (res) return res;
      await sleep(intervalMs, myRun);
    }
    return null;
  }

  function getToastText() {
    const t = $(".toast.show");
    return t ? norm(t.textContent) : "";
  }

  function findActionBtn(labelPrefix) {
    const p = norm(labelPrefix);
    const barBtns = $$(".action-bar button").filter(visible);
    for (const b of barBtns) {
      const txt = norm(b.innerText || b.textContent);
      if (txt === p || txt.startsWith(p) || txt.includes(p)) return b;
    }
    return null;
  }

  // Hỗ trợ click an toàn cho cả HTMLElement (.click) và SVGElement (<g class="m-place" data-place="..."> trên Bản đồ)
  function fireClick(el) {
    if (!el) return false;
    if (typeof el.click === "function") {
      el.click();
    } else {
      el.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window
        })
      );
    }
    return true;
  }

  function clickMenu(menuId) {
    const btn = $(`[data-menu="${menuId}"]`);
    if (!btn) return false;
    return fireClick(btn);
  }

  // Bật/tắt "Camera tự theo sau lưng" (De.autoFollow) đồng bộ qua .sheet.settings để cố định góc nhìn khi di chuyển W/A/S/D
  function setCameraAutoFollow(wantEnabled) {
    const stSheet = $(".sheet.settings");
    if (!stSheet) return null;
    const wasOpen = stSheet.classList.contains("open");
    const prevVis = stSheet.style.visibility;
    let previousState = null;
    try {
      stSheet.style.visibility = "hidden";
      if (!wasOpen) clickMenu("caidat");
      const haTab = $('.tabs button[data-tab="ha"]', stSheet);
      if (haTab) fireClick(haTab);
      const cb = $('input[data-toggle="autoCam"]', stSheet);
      if (cb) {
        previousState = cb.checked;
        if (cb.checked !== wantEnabled) {
          cb.checked = wantEnabled;
          cb.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      if (!wasOpen) {
        fireClick($(".sheet-close", stSheet));
      }
    } catch { } finally {
      stSheet.style.visibility = prevVis;
    }
    return previousState;
  }

  // Mô phỏng nhấn giữ phím di chuyển (w, a, s, d, shift)
  async function holdKeys(keys, durationMs, myRun, stopIfFn = null) {
    checkRun(myRun);
    const sendKey = (type, k) => {
      window.dispatchEvent(
        new KeyboardEvent(type, {
          key: k,
          bubbles: true,
          cancelable: true
        })
      );
    };
    try {
      for (const k of keys) sendKey("keydown", k);
      const step = 60;
      let elapsed = 0;
      while (elapsed < durationMs) {
        checkRun(myRun);
        if (stopIfFn && stopIfFn()) break;
        const wait = Math.min(step, durationMs - elapsed);
        await sleep(wait, myRun);
        elapsed += wait;
      }
    } finally {
      for (const k of keys) sendKey("keyup", k);
    }
  }

  // Đóng mọi bảng/modal đang mở và thoát chế độ tĩnh tâm / am riêng nếu cần
  async function closeAllModals(myRun) {
    checkRun(myRun);
    if (document.body.classList.contains("tinh-tam")) {
      fireClick($(".calm [data-act='out']"));
      await sleep(250, myRun);
    }
    if ($(".chant.open")) {
      fireClick($(".chant.open .chant-close"));
      await sleep(250, myRun);
    }
    if ($(".beads.open")) {
      fireClick($(".beads.open .beads-close"));
      await sleep(250, myRun);
    }
    for (const libClose of $$(".lib.open .lib-close")) {
      fireClick(libClose);
      await sleep(200, myRun);
    }
    for (const sheetClose of $$(".sheet.open .sheet-close")) {
      fireClick(sheetClose);
      await sleep(200, myRun);
    }
    const shareNo = $(".tk-invite.open .tk-no");
    if (shareNo) {
      fireClick(shareNo);
      await sleep(150, myRun);
    }
    const choreStop = $(".chore-pill.show button");
    if (choreStop && visible(choreStop)) {
      fireClick(choreStop);
      await sleep(200, myRun);
    }
    if (document.body.classList.contains("in-am")) {
      const outBtn = findActionBtn("Ra khỏi am");
      if (outBtn) {
        fireClick(outBtn);
        await sleep(950, myRun);
      }
    }
    if (document.body.classList.contains("in-phap")) {
      const outBtn = findActionBtn("Ra ngoài");
      if (outBtn) {
        fireClick(outBtn);
        await sleep(950, myRun);
      }
    }
  }

  // Kiểm tra thông minh xem nhân vật có đang ở sẵn vị trí đó không để tránh mở Bản đồ dịch chuyển thừa
  function isAlreadyAtPlace(placeIdx, placeName) {
    const pName = norm(placeName || "");

    // 1. Chánh điện: Bắt buộc phải có nút "Lạy" và một trong các nút đặc trưng trong điện (hương/đèn/tụng kinh/dâng hoa)
    if (placeIdx === PLACES.CHANH_DIEN || pName.includes("chanh dien")) {
      if (findActionBtn("Lạy") && (findActionBtn("Thắp hương") || findActionBtn("Thắp đèn") || findActionBtn("Tụng kinh") || findActionBtn("Dâng hoa"))) {
        return true;
      }
      if (currentZone && norm(currentZone).includes("chanh dien") && findActionBtn("Lạy")) return true;
      return false;
    }

    // 2. Gác chuông
    if (placeIdx === PLACES.GAC_CHUONG || pName.includes("chuong")) {
      if (findActionBtn("Thỉnh chuông")) return true;
      if (currentZone && norm(currentZone).includes("chuong")) return true;
      return false;
    }

    // 3. Vườn hoa
    if (placeIdx === PLACES.VUON_HOA || pName.includes("vuon hoa")) {
      if (findActionBtn("Luống hoa")) return true;
      if (currentZone && norm(currentZone).includes("vuon hoa")) return true;
      return false;
    }

    // 4. Hồ sen · Cầu Duyên
    if (placeIdx === PLACES.HO_SEN || pName.includes("ho sen")) {
      if (findActionBtn("Thả hoa đăng") || findActionBtn("Xin xăm") || findActionBtn("Kết duyên") || findActionBtn("Phóng sinh")) return true;
      if (currentZone && norm(currentZone).includes("ho sen")) return true;
      return false;
    }

    // 5. Vườn Linh Thú
    if (placeIdx === PLACES.VUON_LINH_THU || pName.includes("linh thu")) {
      if (findActionBtn("Linh thú")) return true;
      if (currentZone && norm(currentZone).includes("linh thu")) return true;
      return false;
    }

    // 6. Bàn thầy đồ (Xin chữ)
    if (placeIdx === PLACES.THAY_DO || pName.includes("xin chu") || pName.includes("thay do")) {
      if (findActionBtn("Xin chữ")) return true;
      if (currentZone && norm(currentZone).includes("thay do")) return true;
      return false;
    }

    // 7. Tàng Kinh Các
    if (placeIdx === PLACES.TANG_KINH_CAC || pName.includes("tang kinh")) {
      if (findActionBtn("Vào Tàng Kinh Các") || $(".lib.tk.open")) return true;
      if (currentZone && norm(currentZone).includes("tang kinh")) return true;
      return false;
    }

    // 8. Am riêng
    if (placeIdx === PLACES.AM_RIENG || pName.includes("am")) {
      if (findActionBtn("Ra khỏi am")) return true;
      if (currentZone && norm(currentZone).includes("am rieng")) return true;
      return false;
    }

    // 9. Sân chùa
    if (placeIdx === PLACES.SAN_CHUA || pName.includes("san chua")) {
      if (findActionBtn("Quét lá")) return true;
      if (currentZone && norm(currentZone).includes("san chua")) return true;
      return false;
    }

    // 9b. Hạc trắng (Hồ trước cổng)
    if (placeIdx === PLACES.HAC_TRANG || pName.includes("hac")) {
      if (findActionBtn("Hạc trắng") || $(".sheet.hac.open")) return true;
      if (currentZone && norm(currentZone).includes("hac")) return true;
      return false;
    }

    // 9c. Bãi chăn trâu
    if (placeIdx === PLACES.BAI_CHAN_TRAU || pName.includes("trau")) {
      if (findActionBtn("Trâu") || $(".sheet.trau.open")) return true;
      if (currentZone && norm(currentZone).includes("trau")) return true;
      return false;
    }

    // 9d. Rùa thần
    if (placeIdx === PLACES.RUA_THAN || pName.includes("rua")) {
      if (findActionBtn("Rùa thần") || $(".sheet.rua.open")) return true;
      if (currentZone && norm(currentZone).includes("rua")) return true;
      return false;
    }

    // 10. So khớp qua currentZone
    if (currentZone && pName && norm(currentZone) === pName) {
      return true;
    }

    return false;
  }

  // Di chuyển nhân vật tới khu vực qua Menu -> Bản đồ (đồng bộ tọa độ state & gói visit lên Server)
  async function teleportToPlace(placeIdx, placeName, myRun) {
    await closeAllModals(myRun);

    // Nếu đã ở sẵn vị trí đó rồi thì không mở bản đồ và không dịch chuyển lại
    if (isAlreadyAtPlace(placeIdx, placeName)) {
      log(`Đang ở sẵn ${placeName} · Bỏ qua dịch chuyển.`, "info");
      lastKnownPlace = placeName;
      return true;
    }

    if (!clickMenu("bando")) {
      log("Không tìm thấy nút Bản đồ trong Menu.", "warn");
      return false;
    }
    const mapSheet = await waitFor(() => $(".sheet.map.open"), 2000, myRun);
    if (!mapSheet) {
      log("Không mở được Bản đồ.", "warn");
      return false;
    }

    let target = null;
    const pNorm = norm(placeName || "");

    // 1. ƯU TIÊN HÀNG ĐẦU: Tìm theo tên địa điểm trên bản đồ SVG (aria-label="Đi tới ...", textContent, title)
    // Giúp tự động thích ứng nếu game tiếp tục cập nhật/chèn thêm địa điểm mới trong tương lai
    if (pNorm) {
      const candidates = $$("[data-place]", mapSheet);
      target = candidates.find((el) => {
        const aria = norm(el.getAttribute("aria-label") || "");
        const txt = norm(el.textContent || "");
        const title = norm(el.getAttribute("title") || "");
        return aria.includes(pNorm) || txt.includes(pNorm) || title.includes(pNorm);
      });
      if (!target && pNorm.includes("chanh dien")) {
        target = candidates.find((el) => {
          const aria = norm(el.getAttribute("aria-label") || "");
          const txt = norm(el.textContent || "");
          return aria.includes("chanh dien") || txt.includes("chanh dien");
        });
      }
      if (!target && pNorm.includes("ho sen")) {
        target = candidates.find((el) => {
          const aria = norm(el.getAttribute("aria-label") || "");
          const txt = norm(el.textContent || "");
          return aria.includes("ho sen") || txt.includes("ho sen");
        });
      }
    }

    // 2. Dự phòng tìm qua data-place index nếu không khớp tên
    if (!target && typeof placeIdx === "number") {
      target = $(`[data-place="${placeIdx}"]`, mapSheet);
    }

    if (!target) {
      fireClick($(".sheet-close", mapSheet));
      log(`Không tìm thấy điểm đến "${placeName}" trên Bản đồ.`, "warn");
      return false;
    }

    fireClick(target);
    lastKnownPlace = placeName;
    log(`Di chuyển tới: ${placeName}`, "info");

    // Chờ hiệu ứng chuyển cảnh (420ms) + đồng bộ gói { t: "visit" } và { t: "state" }
    await sleep(1000, myRun);

    // Xác nhận đã tới Chánh điện thành công (chờ nút Lạy xuất hiện trong toolbar)
    if (pNorm.includes("chanh dien")) {
      const arrived = await waitFor(
        () => findActionBtn("Lạy") || (currentZone && norm(currentZone).includes("chanh dien")),
        3000,
        myRun
      );
      if (!arrived) {
        log("Cảnh báo: Đang chuyển vào Chánh điện, đợi giao diện tải...", "wait");
      }
    }

    return true;
  }

  // Di chuyển tới Đài Quan Âm (R3): dùng cơ chế ys.goTo("quanam") qua nút [data-go] hoặc đi bộ từ Hồ sen
  async function teleportToQuanAm(myRun) {
    await closeAllModals(myRun);

    // Kiểm tra xem đã ở sẵn Đài Quan Âm chưa
    if (findActionBtn("Thắp hương") && findActionBtn("Lạy") && !findActionBtn("Thắp đèn") && !findActionBtn("Tụng kinh")) {
      log("Đang ở sẵn Đài Quan Âm · Bỏ qua dịch chuyển.", "info");
      lastKnownPlace = "Đài Quan Âm";
      return true;
    }
    if (lastKnownPlace === "Đài Quan Âm" && findActionBtn("Thắp hương")) {
      log("Đang ở sẵn Đài Quan Âm · Bỏ qua dịch chuyển.", "info");
      return true;
    }

    if (clickMenu("nhiemvu")) {
      const meritSheet = await waitFor(() => $(".sheet.merit.open"), 1800, myRun);
      if (meritSheet) {
        for (const tabId of ["nv", "tuan", "nm"]) {
          const tabBtn = $(`[data-tab="${tabId}"]`, meritSheet);
          if (tabBtn && !tabBtn.classList.contains("on")) {
            fireClick(tabBtn);
            await sleep(180, myRun);
          }
          const goBtn = $("[data-go]", meritSheet);
          if (goBtn) {
            goBtn.dataset.go = "quanam";
            fireClick(goBtn);
            lastKnownPlace = "Đài Quan Âm";
            log("Di chuyển tới: Đài Quan Âm", "info");
            await sleep(1000, myRun);
            return true;
          }
        }
        fireClick($(".sheet-close", meritSheet));
        await sleep(200, myRun);
      }
    }
    // Dự phòng nếu mọi nhiệm vụ đều đã ẩn nút Đến: dịch chuyển tới Hồ sen rồi đi bộ dọc bờ hồ tới Đài Quan Âm
    const ok = await teleportToPlace(PLACES.HO_SEN, "Hồ sen · Cầu Duyên", myRun);
    if (!ok) return false;
    log("Đi bộ dọc bờ hồ tới Đài Quan Âm…", "info");
    await holdKeys(["d", "Shift"], 3200, myRun, () => !!findActionBtn("Thắp hương"));
    lastKnownPlace = "Đài Quan Âm";
    await sleep(350, myRun);
    return true;
  }

  // 1. Thời khóa hàng ngày ({ t: "incense" }, { t: "emote", e: "lay" }, { t: "tk-done" }, tùy chọn { t: "khoe" })
  async function runThoiKhoa(myRun) {
    await closeAllModals(myRun);
    if (!clickMenu("thoikhoa")) return false;
    const sheet = await waitFor(() => $(".sheet.thoikhoa.open"), 2000, myRun);
    if (!sheet) return false;

    let goBtn = $('[data-act="go"]', sheet);
    if (goBtn && visible(goBtn)) {
      const txt = norm(goBtn.textContent);
      if (txt.includes("bắt đầu")) {
        log("Thời khóa: Bắt đầu dâng hương ở Sân chùa…", "ok");
        fireClick(goBtn);
        // Nhân vật tự dịch chuyển ra Sân chùa, đi tới lư hương E8 và thắp hương
        const reopened = await waitFor(
          () => $(".sheet.thoikhoa.open [data-act='go']"),
          9500,
          myRun
        );
        if (reopened) {
          await sleep(400, myRun);
        }
      }
    }

    const sheetAfter = $(".sheet.thoikhoa.open");
    goBtn = sheetAfter ? $('[data-act="go"]', sheetAfter) : null;
    if (goBtn && visible(goBtn)) {
      const txt = norm(goBtn.textContent);
      if (txt.includes("lạy") || txt.includes("tiếp")) {
        log("Thời khóa: Thực hiện 3 lạy & hoàn tất Thời khóa ({ t: 'tk-done' })…", "ok");
        fireClick(goBtn);
        // Chờ 5.6 giây lễ lạy + gửi { t: "tk-done" }
        await sleep(6300, myRun);
      }
    } else {
      log("Thời khóa hôm nay đã hoàn thành từ trước.", "ok");
    }

    if (enableKhoe) {
      const shareBtn = $(".sheet.thoikhoa.open [data-act='share']");
      if (shareBtn && visible(shareBtn)) {
        log("Gửi sự kiện chia sẻ ảnh ({ t: 'khoe' })…", "ok");
        fireClick(shareBtn);
        await sleep(800, myRun);
      }
    }

    fireClick($(".sheet.thoikhoa.open .sheet-close"));
    await sleep(300, myRun);
    return true;
  }

  // 2. Tàng Kinh Các ({ t: "tk-read", id })
  async function runTangKinh(myRun) {
    await closeAllModals(myRun);
    if (!clickMenu("tangkinh")) return false;
    // Chờ hiệu ứng chuyển cảnh + tải danh sách đền chùa
    const card = await waitFor(
      () => $(".lib.tk.open .tk-cards .lib-card[data-id]"),
      4500,
      myRun
    );
    if (!card) {
      log("Chưa tải được danh sách bài đọc Tàng Kinh Các.", "warn");
      await closeAllModals(myRun);
      return false;
    }
    const cards = $$(".lib.tk.open .tk-cards .lib-card[data-id]");
    const pick = cards[tkReadCursor % cards.length] || card;
    tkReadCursor++;
    const title = pick.querySelector("b")?.textContent || pick.dataset.id;
    fireClick(pick);
    log(`Đã đọc bài Tàng Kinh Các: ${title} ({ t: "tk-read" })`, "ok");
    await sleep(900, myRun);
    fireClick($(".lib.tk.open .lib-close"));
    await sleep(350, myRun);
    return true;
  }

  // 2b. Tự động tìm & nhặt 108 hạt bồ đề khắp chùa ({ t: "bode-nhat" })
  async function runBoDe(myRun) {
    await closeAllModals(myRun);
    log("Bắt đầu tự động tìm & nhặt 108 hạt bồ đề khắp chùa…", "info");

    let totalCollected = 0;
    let pickedCount = 0;

    // Duyệt qua 12 khu vực trong chùa (0 đến 11)
    for (let zone = 0; zone < 12; zone++) {
      if (!checkRun(myRun)) return false;

      let zoneExhausted = false;
      let attempts = 0;

      while (!zoneExhausted && attempts < 9) {
        if (!checkRun(myRun)) return false;
        attempts++;

        // 1. Mở Sổ hạt bồ đề để lấy nút "Đi tìm" của khu vực này
        await closeAllModals(myRun);
        if (!clickMenu("bode")) {
          log("Không tìm thấy mục Hạt bồ đề trong Menu.", "warn");
          break;
        }

        const bodeSheet = await waitFor(() => $(".sheet.bode.open"), 2500, myRun);
        if (!bodeSheet) break;

        const totalEl = $(".bode-total b", bodeSheet);
        if (totalEl) totalCollected = parseInt(totalEl.textContent) || 0;

        if (totalCollected >= 108) {
          log("Chúc mừng! Đã nhặt trọn vẹn 108/108 hạt bồ đề khắp chùa! (Được Tràng hạt bồ đề 108).", "ok");
          fireClick($(".sheet-close", bodeSheet));
          return true;
        }

        const goBtn = $(`[data-go="${zone}"]`, bodeSheet);
        if (!goBtn) {
          // Khu này đã hoàn tất 9/9 hạt
          zoneExhausted = true;
          fireClick($(".sheet-close", bodeSheet));
          await sleep(250, myRun);
          break;
        }

        const zoneLi = goBtn.closest("li");
        const zoneName = zoneLi ? (zoneLi.querySelector("b")?.textContent || `Khu ${zone}`) : `Khu ${zone}`;

        // 2. Bấm "Đi tìm" để game tự teleport nhân vật tới sát hạt bồ đề (cách 2.3m)
        fireClick(goBtn);
        await sleep(1300, myRun);

        const toast = getToastText();
        if (toast.includes("ban đêm") || toast.includes("18 giờ")) {
          log(`${zoneName}: Hạt còn lại chỉ hiện ban đêm (18h-6h) · Chuyển khu tiếp theo.`, "info");
          zoneExhausted = true;
          break;
        }

        // 3. Tìm chỉ số hạt bồ đề gần nhất trong zone này chưa nhặt
        let targetIdx = -1;
        if (bodeGot && bodeGot.length === 108) {
          for (let i = 0; i < 108; i++) {
            if (BODE_SEEDS[i][3] === zone && bodeGot[i] !== "1") {
              targetIdx = i;
              break;
            }
          }
        }

        if (targetIdx >= 0 && activeWs && activeWs.readyState === WebSocket.OPEN) {
          activeWs.send(JSON.stringify({ t: "bode-nhat", i: targetIdx }));
          pickedCount++;
          log(`✦ Đã nhặt hạt bồ đề tại ${zoneName} (Hạt #${targetIdx + 1})`, "ok");
          await sleep(1200, myRun);
        } else {
          // Thử gửi cho các hạt trong zone
          for (let i = 0; i < 108; i++) {
            if (BODE_SEEDS[i][3] === zone && (!bodeGot || bodeGot[i] !== "1")) {
              activeWs?.send(JSON.stringify({ t: "bode-nhat", i }));
              await sleep(150, myRun);
            }
          }
          await sleep(900, myRun);
        }
      }
    }

    await closeAllModals(myRun);
    log(`Hoàn thành chu kỳ nhặt hạt bồ đề! (Đã thu thập: ${totalCollected}/108 hạt).`, "ok");
    return true;
  }

  // 3. Thắp hương & Lạy Phật tại Chánh điện ({ t: "incense" }, { t: "emote", e: "lay" })
  async function runIncenseChanhDien(myRun) {
    const ok = await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
    if (!ok) return false;

    const huongBtn = await waitFor(() => findActionBtn("Thắp hương"), 2000, myRun);
    if (huongBtn) {
      fireClick(huongBtn);
      log("Dâng hương tại Chánh điện ({ t: 'incense' })…", "ok");
      await sleep(3200, myRun);
    }

    // Nếu minPeersToBow > 1 hoặc đang bật Lạy đồng tâm: không lạy lẻ ở đây để tránh lãng phí ngưỡng công đức
    if (minPeersToBow <= 1 && !enabledTasks.has("dongtam")) {
      const layBtn = findActionBtn("Lạy");
      if (layBtn && !layBtn.disabled) {
        fireClick(layBtn);
        broadcastSwarmBow();
        log("Lạy Phật tại Chánh điện ({ t: 'emote', e: 'lay' })…", "ok");
        await sleep(5800, myRun);
      }
    } else {
      log(`Dâng hương Chánh điện xong · Giữ nhịp lạy để chỉ lạy khi đủ sóng ≥${minPeersToBow} người ở tác vụ Lạy đồng tâm.`, "info");
    }
    return true;
  }

  // 3b. Lạy Phật đồng tâm đa người & Swarm ({ t: "emote", e: "lay" })
  async function runDongTam(myRun) {
    const ok = await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
    if (!ok) return false;

    // Nếu người dùng CHỈ BẬT DUY NHẤT 1 tác vụ "Lạy đồng tâm" (1/18):
    // Cho nhân vật đứng túc trực yên tại Chánh điện, liên tục lắng nghe người khác lạy & Swarm, KHÔNG dịch chuyển lại
    if (enabledTasks.size === 1 && enabledTasks.has("dongtam")) {
      log(`Chế độ Túc trực Chánh điện: Đang canh sóng lạy đông người (chỉ lạy khi đủ ≥${minPeersToBow} người cùng lạy)…`, "ok");
      setStatus(`Túc trực Chánh điện · Chờ sóng lạy ≥${minPeersToBow} người`);

      let waitSeconds = 0;
      while (running && myRun === runId) {
        if (!checkRun(myRun)) return false;

        await sleep(1000, myRun);
        waitSeconds++;

        if (waitSeconds % 5 === 0) {
          const recent = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
          setStatus(`Túc trực Chánh điện (${waitSeconds}s) · Sóng hiện tại: ${recent}/${minPeersToBow} người`);
        }

        // Định kỳ kiểm tra nếu nhân vật chưa ở Chánh điện (hoặc bị chuyển cảnh ra ngoài) thì dịch chuyển vào lại
        if (waitSeconds % 12 === 0) {
          if (!isAlreadyAtPlace(PLACES.CHANH_DIEN, "Chánh điện")) {
            log("Phát hiện nhân vật chưa ở trong Chánh điện · Tự động di chuyển vào Chánh điện...", "warn");
            await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
          }
        }
      }
      return true;
    }

    log(`Chánh điện: Bật radar lắng nghe nhịp lạy đồng tâm từ người khác & Swarm (mục tiêu ≥${minPeersToBow} người)…`, "ok");
    const prevBow = lastPeerBowTime;
    const startWait = Date.now();
    let caught = false;

    // Chờ tối đa 12 giây xem có gom đủ số người trong điện cùng lạy không
    while (Date.now() - startWait < 12000) {
      if (!checkRun(myRun)) return false;
      const count = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
      if (count >= minPeersToBow || (minPeersToBow === 1 && lastPeerBowTime > prevBow)) {
        caught = true;
        break;
      }
      await sleep(400, myRun);
    }

    if (caught) {
      const curCount = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
      log(`✦ SÓNG LẠY ĐỒNG TÂM: Đã khớp sóng ${curCount >= minPeersToBow ? curCount : minPeersToBow} người cùng lạy -> Thực hiện lạy đồng tâm!`, "ok");
      triggerBowAction();
      broadcastSwarmBow();
      await sleep(5800, myRun);

      if (minPeersToBow <= 2) {
        log("Thực hiện thêm nhịp lạy đồng tâm #2…", "ok");
        triggerBowAction();
        broadcastSwarmBow();
        await sleep(5800, myRun);
      }
      log("Hoàn tất chuỗi lạy đồng tâm.", "ok");
    } else {
      const curCount = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
      log(`Chưa gom đủ sóng đông người (hiện có ${curCount}/${minPeersToBow} người) · Bỏ qua lượt này để bảo toàn số lạy, không lạy lẻ khi chưa đủ người.`, "info");
    }

    return true;
  }

  // 3c. Thắp hương tại đại lư hương giữa Sân chùa ({ t: "san-incense" })
  async function runSanIncense(myRun) {
    const ok = await teleportToPlace(PLACES.SAN_CHUA, "Sân chùa", myRun);
    if (!ok) return false;

    // Nút "Thắp hương" giữa sân chùa có id "sanhuong" trong action bar
    const huongBtn = await waitFor(() => findActionBtn("Thắp hương"), 2000, myRun);
    if (huongBtn) {
      fireClick(huongBtn);
      log("Dâng ba nén hương vào đại lư giữa Sân chùa ({ t: 'san-incense' })…", "ok");
      await sleep(3500, myRun);
      return true;
    } else if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ t: "san-incense" }));
      log("Đã gửi gói Thắp hương Sân chùa ({ t: 'san-incense' })…", "ok");
      await sleep(1500, myRun);
      return true;
    }
    log("Chưa thấy nút Thắp hương tại Sân chùa.", "warn");
    return false;
  }

  // 4. Thắp hương tại Đài Quan Âm ({ t: "qa-incense" })
  async function runQaIncense(myRun) {
    const ok = await teleportToQuanAm(myRun);
    if (!ok) return false;

    const huongBtn = await waitFor(() => findActionBtn("Thắp hương"), 2500, myRun);
    if (!huongBtn) {
      log("Chưa thấy nút Thắp hương tại Đài Quan Âm.", "warn");
      return false;
    }
    fireClick(huongBtn);
    log("Dâng hương tại Đài Quan Âm ({ t: 'qa-incense' })…", "ok");
    await sleep(3200, myRun);
    return true;
  }

  // 5. Thắp hương trong Am riêng ({ t: "am-in" }, { t: "am-incense" }, { t: "am-out" })
  async function runAmIncense(myRun) {
    await closeAllModals(myRun);
    if (!clickMenu("amrieng")) return false;
    await sleep(1100, myRun);

    // Nếu chưa đăng nhập tài khoản, game sẽ mở bảng Hồ sơ (.sheet.journal.open)
    if ($(".sheet.journal.open")) {
      log("Chưa đăng nhập tài khoản Sổ công đức nên chưa có Am riêng; bỏ qua.", "warn");
      fireClick($(".sheet.journal.open .sheet-close"));
      await sleep(250, myRun);
      return true;
    }

    const inAm = await waitFor(
      () => document.body.classList.contains("in-am"),
      2500,
      myRun
    );
    if (!inAm) {
      log("Chưa vào được Am riêng.", "warn");
      return false;
    }

    const huongBtn = await waitFor(() => findActionBtn("Thắp hương"), 2000, myRun);
    if (huongBtn) {
      fireClick(huongBtn);
      await sleep(400, myRun);
      if (getToastText().includes("chưa có lư hương")) {
        log("Am riêng chưa đặt lư hương trên bàn thờ; bỏ qua.", "warn");
      } else {
        log("Dâng hương trong Am riêng ({ t: 'am-incense' })…", "ok");
        await sleep(2800, myRun);
      }
    }

    const outBtn = findActionBtn("Ra khỏi am");
    if (outBtn) {
      fireClick(outBtn);
      await sleep(1000, myRun);
    }
    return true;
  }

  // 6. Thỉnh chuông tại Gác chuông ({ t: "bell" })
  async function runBell(myRun) {
    const ok = await teleportToPlace(PLACES.GAC_CHUONG, "Gác chuông", myRun);
    if (!ok) return false;

    const bellBtn = await waitFor(() => findActionBtn("Thỉnh chuông"), 2000, myRun);
    if (!bellBtn) {
      log("Chưa thấy nút Thỉnh chuông tại Gác chuông.", "warn");
      return false;
    }
    fireClick(bellBtn);
    log("Thỉnh chuông tại Gác chuông ({ t: 'bell' })…", "ok");
    await sleep(3200, myRun);
    return true;
  }

  // 7. Thắp đèn tại Chánh điện ({ t: "lamp" })
  async function runLamp(myRun) {
    const ok = await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
    if (!ok) return false;

    const lampBtn = await waitFor(() => findActionBtn("Thắp đèn"), 2000, myRun);
    if (!lampBtn) return false;

    // Hàm Yr() trong src.js kiểm tra query ?gio= trước khi kiểm tra giờ thực (16:30–21:30)
    const oldUrl = location.href;
    const tempUrl = new URL(location.href);
    const hadGio = tempUrl.searchParams.has("gio");
    if (!hadGio) {
      tempUrl.searchParams.set("gio", "19");
      history.replaceState(null, "", tempUrl);
    }

    try {
      fireClick(lampBtn);
      await sleep(350, myRun);
      const toast = getToastText();
      if (toast.includes("đã thắp một ngọn đèn rồi")) {
        log("Hôm nay bạn đã thắp đèn Chánh điện rồi.", "ok");
        return true;
      }
      log("Thắp đèn dâng Phật tại Chánh điện ({ t: 'lamp' })…", "ok");
      await sleep(2900, myRun);
    } finally {
      if (!hadGio) {
        history.replaceState(null, "", oldUrl);
      }
    }
    return true;
  }

  // 8. Vườn hoa: Gieo hạt, Tưới cây, Hái hoa & Dâng hoa ({ t: "plant" }, { t: "water" }, { t: "pick" }, { t: "offer-flowers" })
  async function runGarden(myRun) {
    const ok = await teleportToPlace(PLACES.VUON_HOA, "Vườn hoa", myRun);
    if (!ok) return false;

    const openGardenSheet = async () => {
      const btn = await waitFor(() => findActionBtn("Luống hoa"), 2000, myRun);
      if (!btn) return null;
      if (!$(".sheet.garden.open")) {
        fireClick(btn);
      }
      return await waitFor(() => $(".sheet.garden.open"), 1800, myRun);
    };

    let sheet = await openGardenSheet();
    if (!sheet) return false;
    await sleep(400, myRun);

    // 8a. Nếu luống đang trống -> Gieo hạt Sen (hoặc giống đầu tiên)
    const seedBtn = $('[data-plant="sen"]', sheet) || $("[data-plant]", sheet);
    if (seedBtn && visible(seedBtn)) {
      fireClick(seedBtn);
      log("Đã gieo hạt giống tại Vườn hoa ({ t: 'plant' }).", "ok");
      await sleep(900, myRun);
    }

    // 8b. Nếu hoa đã nở (stage === 3) -> Hái hoa ({ t: "pick" })
    sheet = $(".sheet.garden.open") || (await openGardenSheet());
    if (sheet) {
      const pickBtn = $('[data-act="pick"]', sheet);
      if (pickBtn && visible(pickBtn) && !pickBtn.disabled) {
        fireClick(pickBtn);
        log("Đã hái hoa nở tại Vườn hoa ({ t: 'pick' }).", "ok");
        await sleep(900, myRun);
        // Gieo lại hạt mới sau khi hái
        const replantBtn =
          $('[data-plant="sen"]', sheet) || $("[data-plant]", sheet);
        if (replantBtn && visible(replantBtn)) {
          fireClick(replantBtn);
          log("Đã gieo lại hạt giống mới sau khi hái.", "ok");
          await sleep(800, myRun);
        }
      }
    }

    // 8c. Nếu cây chưa tưới hôm nay -> Tưới hoa ({ t: "water", pid: "" })
    sheet = $(".sheet.garden.open") || (await openGardenSheet());
    if (sheet) {
      const waterBtn = $('[data-act="water"]:not([disabled])', sheet);
      if (waterBtn && visible(waterBtn)) {
        fireClick(waterBtn);
        log("Đang tưới hoa ({ t: 'water' })…", "ok");
        // Nhân vật tự đi tới luống hoa, cúi tưới và gửi gói { t: "water" }
        await sleep(3400, myRun);
        sheet = await openGardenSheet();
        await sleep(400, myRun);
      } else {
        log("Luống hoa của bạn hôm nay đã được tưới.", "info");
      }
    }

    // 8d. Kiểm tra lại nếu vừa tưới xong cây nở hoa -> Hái hoa
    sheet = $(".sheet.garden.open");
    if (sheet) {
      const pickAfter = $('[data-act="pick"]', sheet);
      if (pickAfter && visible(pickAfter) && !pickAfter.disabled) {
        fireClick(pickAfter);
        log("Hoa vừa nở sau khi tưới · đã hái hoa ({ t: 'pick' }).", "ok");
        await sleep(900, myRun);
      }
    }

    // 8e. Nếu đang có hoa trong tay ([data-act="hall"]) -> Mang vào Chánh điện dâng Phật ({ t: "offer-flowers" })
    sheet = $(".sheet.garden.open");
    const toHallBtn = sheet ? $('[data-act="hall"]', sheet) : null;
    if (toHallBtn && visible(toHallBtn)) {
      fireClick(toHallBtn);
      log("Mang hoa vừa hái vào Chánh điện…", "info");
      await sleep(1100, myRun);
      const offerBtn = await waitFor(() => findActionBtn("Dâng hoa"), 2000, myRun);
      if (offerBtn) {
        fireClick(offerBtn);
        log("Dâng hoa lên bàn thờ Phật ({ t: 'offer-flowers' })…", "ok");
        await sleep(3400, myRun);
      }
    } else if (sheet) {
      fireClick($(".sheet-close", sheet));
      await sleep(250, myRun);
    }

    return true;
  }

  // 9. Quét lá sân chùa ({ t: "viec", k: "quet" })
  async function runQuetLa(myRun) {
    const prevAutoCam = setCameraAutoFollow(false);
    try {
      const ok = await teleportToPlace(PLACES.SAN_CHUA, "Sân chùa", myRun);
      if (!ok) return false;

      // Nếu đang dở lượt quét cũ thì tắt trước để tạo lượt lá mới gọn ngay trước mặt
      const oldStop = $(".chore-pill.show button");
      if (oldStop && visible(oldStop)) {
        fireClick(oldStop);
        await sleep(200, myRun);
      }

      const quetBtn = await waitFor(() => findActionBtn("Quét lá"), 2000, myRun);
      if (!quetBtn) return false;

      // Khi bấm "Quét lá", QL.start() gọi Math.random() để rải 20 chiếc lá quanh nhân vật.
      // Gom 20 chiếc lá rải thành một luồng thẳng gọn 1.6m–2.7m ngay trước mặt (hướng Bắc -z)
      // để nhân vật chỉ cần đi thẳng 1 đường ngắn là quét sạch 20/20 lá, không phải chạy vòng tròn.
      const origRandom = Math.random;
      let randStep = 0;
      try {
        Math.random = () => {
          const leafIdx = Math.floor(randStep / 3);
          const mod = randStep++ % 3;
          if (mod === 0) return 0.736 + (leafIdx % 5) * 0.007; // Góc hướng thẳng phía trước (-z)
          if (mod === 1) return 0.02 + (leafIdx % 20) * 0.011; // Khoảng cách 1.6m..2.65m trước mặt
          return (leafIdx * 0.37) % 1;
        };
        fireClick(quetBtn);
      } finally {
        Math.random = origRandom;
      }
      await sleep(350, myRun);

      // Kiểm tra thông báo: nếu Do.quet === true thì hôm nay đã nhận công đức quét lá rồi
      const toast = getToastText();
      if (toast.includes("gió lại thổi lá rụng")) {
        log("Quét lá hôm nay đã được ghi nhận công đức từ trước.", "ok");
        fireClick($(".chore-pill.show button"));
        await sleep(250, myRun);
        return true;
      }

      log("Đang bước thẳng tới quét gọn 20 chiếc lá phía trước…", "ok");
      const isSweepingDone = () => !$(".chore-pill.show");

      // Chỉ cần đi bộ thẳng về phía trước (phím W) ~2.5m là quét hết 20/20 chiếc lá
      await holdKeys(["w"], 750, myRun, isSweepingDone);

      // Dự phòng nếu còn sót lá (ví dụ tiện ích chưa reload manifest): đi thẳng 3 nhịp nhẹ nhàng, không xoay vòng
      if (!isSweepingDone()) {
        await holdKeys(["s"], 1100, myRun, isSweepingDone);
        await holdKeys(["a"], 550, myRun, isSweepingDone);
        await holdKeys(["w"], 1200, myRun, isSweepingDone);
        await holdKeys(["d"], 1100, myRun, isSweepingDone);
        await holdKeys(["s"], 1200, myRun, isSweepingDone);
      }

      if (isSweepingDone()) {
        log("Đã quét sạch 20/20 lá sân chùa ({ t: 'viec', k: 'quet' })!", "ok");
      } else {
        fireClick($(".chore-pill.show button"));
        log("Đã kết thúc lượt quét sân.", "info");
      }
      await sleep(400, myRun);
      return true;
    } finally {
      if (prevAutoCam !== null) setCameraAutoFollow(prevAutoCam);
    }
  }

  // 10. Phóng sinh tại Hồ sen ({ t: "viec", k: "ca" })
  async function runPhongSinh(myRun) {
    const prevAutoCam = setCameraAutoFollow(false);
    try {
      const ok = await teleportToPlace(PLACES.HO_SEN, "Hồ sen · Cầu Duyên", myRun);
      if (!ok) return false;

      // Điểm dịch chuyển Hồ sen (35.5, 0, 12) nằm trên Cầu Duyên (vùng bị loại trừ |z - 12| <= 1.7 trong tg()).
      // Với De.yaw = -Math.PI/2 tại Hồ sen: phím "w" đi về hướng Đông (+x), phím "d" bước về hướng Nam (+z, quay mặt ra mặt hồ).
      log("Di chuyển ra mép hồ sen để thả cá…", "info");
      await holdKeys(["w"], 550, myRun);
      await holdKeys(["d"], 240, myRun);
      await sleep(250, myRun);

      for (let attempt = 0; attempt < 3; attempt++) {
        const caBtn = await waitFor(() => findActionBtn("Phóng sinh"), 1500, myRun);
        if (!caBtn) return false;
        fireClick(caBtn);
        await sleep(450, myRun);
        const toast = getToastText();
        if (toast.includes("lại gần mép hồ")) {
          await holdKeys(["d"], 280, myRun);
          await sleep(200, myRun);
          continue;
        }
        log("Đã thả cá phóng sinh tại Hồ sen ({ t: 'viec', k: 'ca' }).", "ok");
        await sleep(1200, myRun);
        return true;
      }
      return true;
    } finally {
      if (prevAutoCam !== null) setCameraAutoFollow(prevAutoCam);
    }
  }

  // 11. Thả hoa đăng tại Hồ sen ({ t: "lantern", color, text })
  async function runHoaDang(myRun) {
    await closeAllModals(myRun);
    let denBtn = findActionBtn("Thả hoa đăng");
    if (!denBtn) {
      const ok = await teleportToPlace(PLACES.HO_SEN, "Hồ sen · Cầu Duyên", myRun);
      if (!ok) return false;
      denBtn = await waitFor(() => findActionBtn("Thả hoa đăng"), 2000, myRun);
    }
    if (!denBtn) {
      log("Không tìm thấy nút Thả hoa đăng tại Hồ sen.", "warn");
      return false;
    }

    fireClick(denBtn);
    const sheet = await waitFor(() => $(".sheet.lantern.open"), 2000, myRun);
    if (!sheet) {
      log("Không mở được giao diện Thả hoa đăng.", "warn");
      return false;
    }

    // Chọn lời nguyện có sẵn từ danh sách chips hoặc gán nội dung mẫu
    const chips = $$(".chips button", sheet);
    if (chips.length > 0) {
      const pickChip = chips[Math.floor(Math.random() * chips.length)];
      fireClick(pickChip);
      await sleep(200, myRun);
    } else {
      const textarea = $("textarea", sheet);
      if (textarea) {
        textarea.value = "Cầu cho cả nhà luôn bình an, mạnh khỏe và vạn sự như ý.";
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    const releaseBtn = $("button.release", sheet);
    if (!releaseBtn) {
      fireClick($(".sheet-close", sheet));
      return false;
    }

    fireClick(releaseBtn);
    log("Đã thả hoa đăng cầu an tại Hồ sen ({ t: 'lantern' }).", "ok");
    await sleep(1500, myRun);

    const shareNo = $(".tk-invite.open .tk-no");
    if (shareNo) fireClick(shareNo);
    await closeAllModals(myRun);
    return true;
  }

  // 12. Xin xăm duyên tại Hồ sen ({ t: "xam", n })
  async function runXinXam(myRun) {
    await closeAllModals(myRun);
    let xamBtn = findActionBtn("Xin xăm");
    if (!xamBtn) {
      const ok = await teleportToPlace(PLACES.HO_SEN, "Hồ sen · Cầu Duyên", myRun);
      if (!ok) return false;
      xamBtn = await waitFor(() => findActionBtn("Xin xăm"), 2000, myRun);
    }
    if (!xamBtn) {
      log("Không tìm thấy nút Xin xăm tại Hồ sen.", "warn");
      return false;
    }

    fireClick(xamBtn);
    const sheet = await waitFor(() => $(".sheet.fortune.open"), 2000, myRun);
    if (!sheet) {
      log("Không mở được giao diện Xin xăm duyên.", "warn");
      return false;
    }

    const shakeBtn = $("button.shake", sheet);
    if (!shakeBtn) {
      fireClick($(".sheet-close", sheet));
      return false;
    }

    fireClick(shakeBtn);
    log("Đang lắc ống xăm duyên tại Hồ sen…", "info");

    const resultHead = await waitFor(() => $(".sheet.fortune.open .paper-head"), 3500, myRun);
    const queText = resultHead ? resultHead.textContent.trim() : "Quẻ xăm";

    log(`Đã xin được: ${queText} ({ t: 'xam' }).`, "ok");
    await sleep(1200, myRun);

    const againBtn = $(".sheet.fortune.open .again") || $(".sheet.fortune.open .sheet-close");
    if (againBtn) fireClick(againBtn);
    await sleep(300, myRun);
    await closeAllModals(myRun);
    return true;
  }

  // 13. Vườn Linh Thú ({ t: "linhthu" })
  async function runLinhThu(myRun) {
    const ok = await teleportToPlace(PLACES.VUON_LINH_THU, "Vườn Linh Thú", myRun);
    if (!ok) return false;

    const petBtn = await waitFor(() => findActionBtn("Linh thú") || findActionBtn("Cho ăn"), 2000, myRun);
    if (petBtn) {
      log("Thăm Vườn Linh Thú & tương tác linh thú cưng…", "ok");
      await sleep(1500, myRun);
    }
    return true;
  }

  // 13b. Cho ăn Linh Thú ({ t: "pet-feed" }, { t: "emote", e: "gieo" })
  async function runChoAn(myRun) {
    const ok = await teleportToPlace(PLACES.VUON_LINH_THU, "Vườn Linh Thú", myRun);
    if (!ok) return false;

    const feedBtn = await waitFor(() => findActionBtn("Cho ăn"), 2000, myRun);
    if (feedBtn) {
      fireClick(feedBtn);
      log("Rắc hạt cho các linh thú trong vườn ăn ({ t: 'pet-feed' })…", "ok");
      await sleep(2200, myRun);
      return true;
    } else if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ t: "emote", e: "gieo" }));
      await sleep(400, myRun);
      activeWs.send(JSON.stringify({ t: "pet-feed" }));
      log("Đã gửi gói Cho ăn linh thú ({ t: 'pet-feed' }).", "ok");
      await sleep(1500, myRun);
      return true;
    }
    return false;
  }

  // 13c. Cưỡi trâu dạo cảnh Thập Mục Ngưu Đồ ({ t: "lv-cuoi" })
  async function runCuoiTrau(myRun) {
    const ok = await teleportToPlace(PLACES.BAI_CHAN_TRAU, "Bãi chăn trâu", myRun);
    if (!ok) return false;

    const trauBtn = await waitFor(() => findActionBtn("Trâu"), 2500, myRun);
    if (trauBtn) {
      fireClick(trauBtn);
      log("Trải nghiệm cưỡi trâu thong thả đi dạo (Thập Mục Ngưu Đồ)…", "ok");
      await sleep(3500, myRun);

      const xuongBtn = findActionBtn("Xuống trâu");
      if (xuongBtn) {
        fireClick(xuongBtn);
        await sleep(1000, myRun);
      }
      return true;
    }
    return false;
  }

  // Bỏ qua giới hạn giờ cưỡi Hạc: đặt tham số gio=17 vào URL (trong khung giờ chiều 16–19h của Hạc)
  function setCraneHourOverride() {
    try {
      const url = new URL(window.location.href);
      const cur = url.searchParams.get("gio");
      const num = Number(cur);
      const inHours = !Number.isNaN(num) && ((num >= 5 && num < 9) || (num >= 16 && num < 19));
      if (!inHours) {
        url.searchParams.set("gio", "17");
        window.history.replaceState({}, "", url.toString());
      }
    } catch (e) {
      console.warn("[AutoTask] setCraneHourOverride error:", e);
    }
  }

  // Mở khóa Hạc trắng (Bonded + Fly): Dispatch gói tin linhvat giả lập vào client
  function enableHacFly() {
    setCraneHourOverride();
    if (activeWs) {
      try {
        const fakeHac = {
          s: 7,
          today: false,
          w: -1,
          bonded: true,
          l: 1,
          fly: ["tron", "dua"],
          intro: false
        };
        const evt = new MessageEvent("message", {
          data: JSON.stringify({ t: "linhvat", hac: fakeHac })
        });
        if (typeof activeWs.onmessage === "function") {
          activeWs.onmessage(evt);
        }
        activeWs.dispatchEvent(evt);
      } catch (err) {
        console.warn("[AutoTask] enableHacFly dispatch error:", err);
      }
    }
  }

  // 13c2. Cưỡi Hạc trắng bay ngắm cảnh chùa (Bỏ qua giới hạn giờ / Lố giờ)
  async function runCuoiHac(myRun, flyKind = "tron") {
    log("🦅 Chuẩn bị cưỡi Hạc trắng (Bỏ qua giới hạn giờ)…", "step");
    enableHacFly();

    const ok = await teleportToPlace(PLACES.HAC_TRANG, "Hạc trắng", myRun);
    if (!ok) return false;

    await sleep(1000, myRun);
    enableHacFly();

    let hacBtn = findActionBtn("Hạc trắng");
    if (!hacBtn) {
      clickMenu("linhvat");
    } else {
      fireClick(hacBtn);
    }

    const sheet = await waitFor(() => $(".sheet.hac.open"), 2500, myRun);
    if (!sheet) {
      enableHacFly();
      clickMenu("linhvat");
      await sleep(1000, myRun);
    }

    enableHacFly();
    await sleep(300, myRun);

    let flyBtn = $(`[data-fly="${flyKind}"]`) || $(`[data-fly]`);
    if (!flyBtn) {
      enableHacFly();
      await sleep(400, myRun);
      flyBtn = $(`[data-fly="${flyKind}"]`) || $(`[data-fly]`);
    }

    if (flyBtn) {
      const isTron = (flyBtn.getAttribute("data-fly") || flyKind) === "tron";
      log(`🦅 Hạc cất cánh · ${isTron ? "Theo hạc ngắm toàn cảnh chùa (~1.5 phút)" : "Theo hạc bay lên chùa (~15s)"}…`, "ok");
      fireClick(flyBtn);

      const maxWait = isTron ? 100000 : 25000;
      const startTime = Date.now();
      while (Date.now() - startTime < maxWait) {
        if (myRun !== runId) return false;
        await sleep(1000, myRun);
        const toast = $(".toast");
        if (toast && toast.textContent && (toast.textContent.includes("hạ cánh") || toast.textContent.includes("tới sân chùa"))) {
          break;
        }
      }

      log("🦅 Hạc đã hạ cánh an toàn. A Di Đà Phật!", "ok");
      await sleep(1200, myRun);
      return true;
    } else {
      log("⚠️ Chưa tìm thấy nút cưỡi hạc, hãy thử lại khi đứng cạnh Hạc ở bờ hồ.", "warn");
      return false;
    }
  }

  // Nút hành động trực tiếp: Cưỡi Hạc ngay lập tức (Bỏ qua lố giờ)
  async function triggerDirectCuoiHac(flyKind = "tron") {
    if (running) {
      log("Đang có tiến trình chạy Auto. Vui lòng bấm Dừng trước khi cưỡi hạc thủ công, hoặc bật tác vụ 'Cưỡi hạc' để tự động bay.", "warn");
      return;
    }
    const isTron = flyKind === "tron";
    log(`🦅 Bắt đầu cưỡi Hạc trắng (${isTron ? "Ngắm toàn cảnh chùa ~1.5 phút" : "Bay lên sân chùa ~15s"}) · Bỏ qua giới hạn giờ…`, "step");
    setStatus("🦅 Đang chuẩn bị cưỡi Hạc trắng…");

    setCraneHourOverride();
    enableHacFly();

    const ok = await teleportToPlace(PLACES.HAC_TRANG, "Hạc trắng", null);
    if (!ok) {
      setStatus("Sẵn sàng · bấm Chạy để tự động thực hiện");
      return;
    }

    await sleep(1000);
    enableHacFly();

    let hacBtn = findActionBtn("Hạc trắng");
    if (!hacBtn) {
      clickMenu("linhvat");
    } else {
      fireClick(hacBtn);
    }

    let sheet = await waitFor(() => $(".sheet.hac.open"), 2500);
    if (!sheet) {
      enableHacFly();
      clickMenu("linhvat");
      await sleep(1000);
      sheet = $(".sheet.hac.open");
    }

    enableHacFly();
    await sleep(300);

    let flyBtn = $(`[data-fly="${flyKind}"]`) || $(`[data-fly]`);
    if (!flyBtn) {
      enableHacFly();
      await sleep(400);
      flyBtn = $(`[data-fly="${flyKind}"]`) || $(`[data-fly]`);
    }

    if (flyBtn) {
      log(`🦅 Hạc cất cánh · ${isTron ? "Theo hạc ngắm chùa (~1.5 phút)" : "Theo hạc lên chùa (~15s)"}!`, "ok");
      setStatus(`🦅 Đang bay cùng Hạc trắng (${isTron ? "Ngắm cảnh chùa" : "Lên sân chùa"})…`);
      fireClick(flyBtn);

      const maxWait = isTron ? 100000 : 25000;
      const startTime = Date.now();
      while (Date.now() - startTime < maxWait) {
        await sleep(1000);
        const toast = $(".toast");
        if (toast && toast.textContent && (toast.textContent.includes("hạ cánh") || toast.textContent.includes("tới sân chùa"))) {
          break;
        }
      }

      log("🦅 Hạc đã hạ cánh. Chúc bạn một ngày an vui, vạn sự cát tường! A Di Đà Phật!", "ok");
      setStatus("Sẵn sàng · bấm Chạy để tự động thực hiện");
    } else {
      log("⚠️ Chưa tìm thấy nút bay của Hạc, hãy thử bấm lại khi đứng cạnh Hạc ở bờ hồ nhé.", "warn");
      setStatus("Sẵn sàng · bấm Chạy để tự động thực hiện");
    }
  }

  // 13d. Hóa vàng & Hồi hướng gia tiên ({ t: "hoa-vang" }, { t: "hv-hoihuong" })
  async function runHoaVang(myRun) {
    await closeAllModals(myRun);
    let hvBtn = findActionBtn("Hóa vàng");
    if (!hvBtn) {
      await teleportToPlace(PLACES.SAN_CHUA, "Sân chùa", myRun);
      hvBtn = await waitFor(() => findActionBtn("Hóa vàng"), 2000, myRun);
    }

    if (hvBtn) {
      fireClick(hvBtn);
    } else if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      activeWs.send(JSON.stringify({ t: "hoa-vang", k: "vang" }));
      await sleep(1200, myRun);
      activeWs.send(JSON.stringify({ t: "hv-hoihuong" }));
      log("Đã gửi gói Hóa vàng & Hồi hướng gia tiên ({ t: 'hoa-vang' }).", "ok");
      return true;
    }

    const panel = await waitFor(() => $(".hv-panel"), 3000, myRun);
    if (panel) {
      // 1. Thực hiện Hóa tiền vàng
      const goldBtn = $('[data-k="vang"]', panel);
      if (goldBtn && !goldBtn.disabled) {
        fireClick(goldBtn);
        await sleep(500, myRun);
        const allBtn = await waitFor(() => $('[data-act="all"]', $(".hv-panel")), 2000, myRun);
        if (allBtn) {
          fireClick(allBtn);
          log("Đang hóa tiền vàng tưởng nhớ gia tiên ({ t: 'hoa-vang' })…", "ok");
          await sleep(3500, myRun);
        }
      } else {
        log("Hôm nay đã hóa tiền vàng rồi.", "info");
      }

      // 2. Thực hiện Hồi hướng công đức
      const hhBtn = $('[data-act="hh"]', $(".hv-panel") || panel);
      if (hhBtn && visible(hhBtn)) {
        fireClick(hhBtn);
        log("Hồi hướng công đức gia tiên ({ t: 'hv-hoihuong' })…", "ok");
        await sleep(1500, myRun);
      }

      fireClick($(".hv-panel .sheet-close"));
      await sleep(350, myRun);
      return true;
    }
    return false;
  }

  // 14. Xin chữ Thầy đồ ({ t: "chu-xin", chu })
  async function runThayDo(myRun) {
    await closeAllModals(myRun);
    if (!clickMenu("thaydo")) return false;
    const sheet = await waitFor(() => $(".sheet.thaydo.open"), 2500, myRun);
    if (!sheet) return false;

    // Chờ dữ liệu { t: "chu" } từ Server bật các nút .td-wish
    await sleep(900, myRun);
    const wishBtn = $(".td-wish:not([disabled])", sheet);
    if (wishBtn && visible(wishBtn)) {
      const wishText = wishBtn.textContent.trim();
      fireClick(wishBtn);
      log(`Xin chữ Thầy đồ: "${wishText}" ({ t: "chu-xin" })…`, "ok");
      await sleep(1500, myRun);
    } else {
      log("Hôm nay đã xin chữ Thầy đồ rồi.", "info");
    }

    fireClick($(".sheet.thaydo.open .sheet-close"));
    await sleep(300, myRun);
    return true;
  }

  // 13. Gõ mõ tụng kinh ({ t: "mo", n: $h })
  // Lưu ý kỹ thuật: Nút .chant-auto của game gọi this.next(false) nên KHÔNG cộng biến $h.
  // Bấm trực tiếp .chant-mo đủ 108 nhịp theo từng đợt nhanh (auto-click) và ngắt nhịp giữa các đợt để chu kỳ 2 giây đẩy gói { t: "mo", n: $h }.
  async function runMo(myRun) {
    await closeAllModals(myRun);
    let tungBtn = findActionBtn("Tụng kinh");
    if (!tungBtn) {
      const ok = await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
      if (!ok) return false;
      tungBtn = await waitFor(() => findActionBtn("Tụng kinh"), 2000, myRun);
    }
    if (!tungBtn) return false;

    fireClick(tungBtn);
    const chantPanel = await waitFor(() => $(".chant.open"), 2000, myRun);
    if (!chantPanel) return false;

    // Chọn bài "Niệm Phật" (108 câu) để đếm trọn vòng 108 tiếng mõ
    const niemPhatTab = $('.chant-tabs button[data-id="niemphat"]', chantPanel);
    if (niemPhatTab && !niemPhatTab.classList.contains("on")) {
      fireClick(niemPhatTab);
      await sleep(150, myRun);
    }

    const moBtn = $(".chant-mo", chantPanel);
    if (!moBtn) return false;

    const totalKnocks = 108;
    const burstSize = 18; // 6 đợt x 18 nhịp = 108 nhịp (mỗi gói 2s gửi <= 18 nhịp an toàn)
    const clickDelayMs = 28; // Tốc độ bấm nhanh kiểu auto-click (~35 nhịp/giây trong mỗi đợt)
    const burstPauseMs = 1650; // Ngắt nhịp chờ chu kỳ 2s của game gửi gói { t: "mo", n }

    log(
      `Đang gõ mõ ${totalKnocks} nhịp (chia ${totalKnocks / burstSize} đợt auto-click x ${burstSize} nhịp)…`,
      "ok"
    );

    let doneKnocks = 0;
    while (doneKnocks < totalKnocks) {
      checkRun(myRun);
      if (!$(".chant.open")) break;

      const batch = Math.min(burstSize, totalKnocks - doneKnocks);
      for (let i = 0; i < batch; i++) {
        checkRun(myRun);
        if (!$(".chant.open")) break;
        fireClick(moBtn);
        doneKnocks++;
        await sleep(clickDelayMs, myRun);
      }

      if (doneKnocks < totalKnocks && $(".chant.open")) {
        await sleep(burstPauseMs, myRun);
      }
    }

    // Chờ chu kỳ 2 giây của game gửi hết $h còn lại trước khi đóng
    await sleep(2100, myRun);
    fireClick($(".chant.open .chant-close"));
    await sleep(350, myRun);
    return true;
  }

  // 14. Lần chuỗi hạt ({ t: "beads", n: Gh })
  // Lần đủ 108 hạt theo từng đợt nhanh (auto-click) và ngắt nhịp giữa các đợt để chu kỳ 2 giây đẩy gói { t: "beads", n: Gh }.
  async function runBeads(myRun) {
    await closeAllModals(myRun);
    let hatBtn = await waitFor(() => findActionBtn("Tràng hạt"), 1500, myRun);
    if (!hatBtn) {
      const ok = await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
      if (!ok) return false;
      hatBtn = await waitFor(() => findActionBtn("Tràng hạt"), 2000, myRun);
    }
    if (!hatBtn) return false;

    fireClick(hatBtn);
    const beadsPanel = await waitFor(() => $(".beads.open"), 2000, myRun);
    if (!beadsPanel) return false;

    const totalBeads = 108;
    const burstSize = 18; // 6 đợt x 18 hạt = 108 hạt
    const clickDelayMs = 28; // Tốc độ lần hạt nhanh kiểu auto-click (~35 hạt/giây trong mỗi đợt)
    const burstPauseMs = 1650; // Ngắt nhịp chờ chu kỳ 2s của game gửi gói { t: "beads", n }

    log(
      `Đang lần ${totalBeads} hạt tràng hạt (chia ${totalBeads / burstSize} đợt auto-click x ${burstSize} hạt)…`,
      "ok"
    );

    let doneBeads = 0;
    while (doneBeads < totalBeads) {
      checkRun(myRun);
      if (!$(".beads.open")) break;

      const batch = Math.min(burstSize, totalBeads - doneBeads);
      for (let i = 0; i < batch; i++) {
        checkRun(myRun);
        if (!$(".beads.open")) break;
        beadsPanel.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: 100,
            bubbles: true,
            cancelable: true
          })
        );
        doneBeads++;
        await sleep(clickDelayMs, myRun);
      }

      if (doneBeads < totalBeads && $(".beads.open")) {
        await sleep(burstPauseMs, myRun);
      }
    }

    // Chờ chu kỳ 2 giây của game đẩy gói { t: "beads", n: Gh } cuối cùng
    await sleep(2100, myRun);
    fireClick($(".beads.open .beads-close"));
    await sleep(350, myRun);
    return true;
  }

  // 15. Nhận thưởng nhiệm vụ ngày, tuần, nhập môn & lễ ({ t: "claim", q: id }, { t: "claim-le" })
  async function runClaim(myRun) {
    await closeAllModals(myRun);
    if (!clickMenu("nhiemvu")) return false;

    const sheet = await waitFor(() => $(".sheet.merit.open"), 2000, myRun);
    if (!sheet) return false;
    await sleep(350, myRun);

    let claimedCount = 0;
    for (const tabId of ["nv", "tuan", "nm"]) {
      checkRun(myRun);
      const tabBtn = $(`[data-tab="${tabId}"]`, sheet);
      if (tabBtn) {
        fireClick(tabBtn);
        await sleep(300, myRun);
      }

      // Nhận thưởng lễ hội nếu đủ tiến độ ({ t: "claim-le" })
      const claimLeBtn = $("[data-claimle]:not([disabled])", sheet);
      if (claimLeBtn && visible(claimLeBtn)) {
        fireClick(claimLeBtn);
        claimedCount++;
        log("Đã nhận thưởng Lễ hội ({ t: 'claim-le' })!", "ok");
        await sleep(500, myRun);
      }

      // Nhận tất cả nếu có nút [data-claimall]
      const claimAllBtn = $("[data-claimall]:not([disabled])", sheet);
      if (claimAllBtn && visible(claimAllBtn)) {
        fireClick(claimAllBtn);
        claimedCount++;
        log(`Đã bấm Nhận tất cả ở mục ${tabId.toUpperCase()}!`, "ok");
        await sleep(600, myRun);
      }

      // Nhận từng nhiệm vụ đủ tiến độ ({ t: "claim", q: id })
      const readyBtns = $$("[data-claim]:not([disabled])", sheet).filter(visible);
      for (const btn of readyBtns) {
        const qId = btn.dataset.claim;
        fireClick(btn);
        claimedCount++;
        log(`Đã nhận thưởng nhiệm vụ: ${qId} ({ t: "claim" })`, "ok");
        await sleep(450, myRun);
      }
    }

    if (claimedCount === 0) {
      log("Đã kiểm tra bảng Nhiệm vụ: hiện chưa có mốc thưởng mới cần nhận.", "info");
    }

    fireClick($(".sheet.merit.open .sheet-close"));
    await sleep(300, myRun);
    return true;
  }

  const RUNNERS = {
    thoikhoa: runThoiKhoa,
    tangkinh: runTangKinh,
    bode: runBoDe,
    incense: runIncenseChanhDien,
    dongtam: runDongTam,
    san_incense: runSanIncense,
    qa_incense: runQaIncense,
    am_incense: runAmIncense,
    bell: runBell,
    lamp: runLamp,
    garden: runGarden,
    quet: runQuetLa,
    ca: runPhongSinh,
    hoadang: runHoaDang,
    xinxam: runXinXam,
    hoavang: runHoaVang,
    linhthu: runLinhThu,
    choan: runChoAn,
    cuoitrau: runCuoiTrau,
    cuoihac: runCuoiHac,
    thaydo: runThayDo,
    mo: runMo,
    beads: runBeads,
    claim: runClaim
  };

  function getGameTodayStats() {
    try {
      const today = todayDateStr();
      const raw = localStorage.getItem("anduyen.today");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.day === today) {
          return {
            beads: Number(parsed.beads || 0),
            bows: Number(parsed.bows || 0),
            incense: Number(parsed.incense || 0)
          };
        }
      }
    } catch {}
    return { beads: 0, bows: 0, incense: 0 };
  }

  function updateTodayStatsUI() {
    const grid = $("#atd-today-stats");
    if (!grid) return;

    const stats = getGameTodayStats();
    const bowsCap = stats.bows >= 30;
    const beadsDone = stats.beads >= 108;

    const isQuetDone = Boolean(serverChores.quet || doneOnce.has("quet"));
    const isCaDone = Boolean(serverChores.ca || doneOnce.has("ca"));
    const isTkDone = Boolean(serverChores.tk || doneOnce.has("thoikhoa"));
    const bodeCount = bodeGot ? [...bodeGot].filter((c) => c === "1").length : 0;

    const items = [
      {
        id: "bow",
        label: "Lạy Phật",
        val: `${stats.bows} lạy`,
        badge: bowsCap
          ? `<span class="atd-badge-cap" title="Đã đạt trần công đức lạy tự do hôm nay (≥30 lạy). Vẫn tính vào tích luỹ 1.000 lạy Thiền trượng & lạy đôi.">Kịch trần (≥30)</span>`
          : `<span class="atd-badge-ok">${stats.bows}/30</span>`
      },
      {
        id: "beads",
        label: "Tràng hạt",
        val: `${stats.beads} hạt`,
        badge: beadsDone
          ? `<span class="atd-badge-done" title="Đã trọn chuỗi 108 hạt niệm Phật hôm nay">Đủ 108</span>`
          : `<span class="atd-badge-ok">${stats.beads}/108</span>`
      },
      {
        id: "bode",
        label: "Hạt bồ đề",
        val: `${bodeCount}/108`,
        badge: bodeCount >= 108
          ? `<span class="atd-badge-done" title="Đã nhặt đủ 108 hạt bồ đề khắp chùa">Đủ 108</span>`
          : `<span class="atd-badge-ok">${bodeCount}/108</span>`
      },
      {
        id: "incense",
        label: "Dâng hương",
        val: `${stats.incense} lượt`,
        badge: stats.incense >= 3
          ? `<span class="atd-badge-done">Đủ 3 am/điện</span>`
          : `<span class="atd-badge-ok">${stats.incense} lượt</span>`
      },
      {
        id: "thoikhoa",
        label: "Thời khóa",
        val: isTkDone ? "Đã khóa lễ" : "Chưa làm",
        badge: isTkDone
          ? `<span class="atd-badge-done">Xong</span>`
          : `<span class="atd-badge-ok">Chưa làm</span>`
      },
      {
        id: "quet",
        label: "Quét lá",
        val: isQuetDone ? "Đã sạch sân" : "Chưa quét",
        badge: isQuetDone
          ? `<span class="atd-badge-done">Đã nhận</span>`
          : `<span class="atd-badge-ok">Chưa quét</span>`
      },
      {
        id: "ca",
        label: "Phóng sinh",
        val: isCaDone ? "Đã thả cá" : "Chưa thả",
        badge: isCaDone
          ? `<span class="atd-badge-done">Đã nhận</span>`
          : `<span class="atd-badge-ok">Chưa thả</span>`
      },
      {
        id: "hoavang",
        label: "Hóa vàng",
        val: doneOnce.has("hoavang") ? "Đã hóa" : "Chưa hóa",
        badge: doneOnce.has("hoavang")
          ? `<span class="atd-badge-done">Xong</span>`
          : `<span class="atd-badge-ok">Chưa làm</span>`
      }
    ];

    grid.innerHTML = items.map((item) => `
      <div class="atd-today-item" data-stat="${item.id}" style="cursor:pointer;" title="Bấm vào để đổi trạng thái Đã làm / Chưa làm">
        <span>${item.label}</span>
        <b>${item.val} ${item.badge}</b>
      </div>
    `).join("");

    $$(".atd-today-item", grid).forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.stat;
        if (id === "quet") {
          const current = Boolean(serverChores.quet || doneOnce.has("quet"));
          serverChores.quet = !current;
          if (serverChores.quet) doneOnce.add("quet");
          else doneOnce.delete("quet");
          log(`Đã chuyển thủ công Quét lá: ${serverChores.quet ? "Đã nhận" : "Chưa làm"}`, "info");
        } else if (id === "ca") {
          const current = Boolean(serverChores.ca || doneOnce.has("ca"));
          serverChores.ca = !current;
          if (serverChores.ca) doneOnce.add("ca");
          else doneOnce.delete("ca");
          log(`Đã chuyển thủ công Phóng sinh: ${serverChores.ca ? "Đã nhận" : "Chưa làm"}`, "info");
        } else if (id === "thoikhoa") {
          const current = Boolean(serverChores.tk || doneOnce.has("thoikhoa"));
          serverChores.tk = !current;
          if (serverChores.tk) doneOnce.add("thoikhoa");
          else doneOnce.delete("thoikhoa");
          log(`Đã chuyển thủ công Thời khóa: ${serverChores.tk ? "Xong" : "Chưa làm"}`, "info");
        } else {
          return;
        }
        saveServerChores();
        saveDoneOnce();
        updateTagUI();
        updateTodayStatsUI();
      });
    });
  }

  function updateTagUI() {
    for (const t of ALL_TASKS) {
      const el = $(`#atd-panel [data-task="${t.id}"]`);
      if (!el) continue;
      const isDone = Boolean(t.once && doneOnce.has(t.id));
      el.classList.toggle("on", enabledTasks.has(t.id));
      el.classList.toggle("done", isDone);
      el.title = isDone
        ? `${t.label}: Đã xong hôm nay (Tự động bỏ qua khi chạy Auto. Chuột phải để đặt lại nếu muốn chạy lại)`
        : `${t.label}: ${t.once ? "Chạy 1 lần rồi bỏ qua ở các vòng lặp sau" : "Lặp lại mỗi chu kỳ"}`;
    }
    const countEl = $("#atd-task-count");
    if (countEl) {
      const activeCount = ALL_TASKS.filter(
        (t) => enabledTasks.has(t.id) && !(t.once && doneOnce.has(t.id))
      ).length;
      const doneCount = ALL_TASKS.filter(
        (t) => enabledTasks.has(t.id) && t.once && doneOnce.has(t.id)
      ).length;
      if (doneCount > 0) {
        countEl.textContent = `(${activeCount} chờ chạy · ${doneCount} xong)`;
      } else {
        countEl.textContent = `(${enabledTasks.size}/${ALL_TASKS.length})`;
      }
    }

    TASK_CATEGORIES.forEach((cat) => {
      const countSpan = $(`#atd-panel [data-tab-count="${cat.id}"]`);
      if (!countSpan) return;
      const tasksInCat = cat.id === "all"
        ? ALL_TASKS
        : ALL_TASKS.filter((t) => t.category === cat.id);
      const activeInCat = tasksInCat.filter((t) => enabledTasks.has(t.id)).length;
      countSpan.textContent = `(${activeInCat})`;
    });

    updateTodayStatsUI();
  }

  async function mainLoop(myRun) {
    let cycle = 1;
    try {
      while (running && myRun === runId) {
        const skipped = ALL_TASKS.filter(
          (t) => enabledTasks.has(t.id) && t.once && doneOnce.has(t.id)
        );
        const activeList = ALL_TASKS.filter(
          (t) => enabledTasks.has(t.id) && !(t.once && doneOnce.has(t.id))
        );

        if (activeList.length === 0) {
          stop("Tất cả tác vụ đã chọn đều đã hoàn thành hôm nay.");
          return;
        }

        if (cycle === 1 && skipped.length > 0) {
          log(`Tự động bỏ qua ${skipped.length} tác vụ đã hoàn thành: ${skipped.map((t) => t.label).join(", ")}.`, "info");
        }

        log(`=== Bắt đầu chu kỳ #${cycle} (${activeList.length} tác vụ cần làm) ===`, "info");

        for (let i = 0; i < activeList.length; i++) {
          checkRun(myRun);
          const task = activeList[i];
          setStatus(
            `Chu kỳ #${cycle} · ${task.label} (${i + 1}/${activeList.length})`
          );

          try {
            const ok = await RUNNERS[task.id](myRun);
            if (ok && task.once) {
              doneOnce.add(task.id);
              saveDoneOnce();
              updateTagUI();
            } else {
              updateTodayStatsUI();
            }
          } catch (err) {
            if (err?.message === "__ATD_STOPPED__") throw err;
            log(`Lỗi ở tác vụ ${task.label}: ${err?.message || err}`, "error");
          }

          await sleep(1200, myRun);
        }

        if (!loopMode) {
          stop("Đã chạy xong toàn bộ danh sách nhiệm vụ!");
          return;
        }

        cycle++;
        setStatus("Đang nghỉ 4 giây trước chu kỳ lặp tiếp theo…");
        await sleep(4000, myRun);
      }
    } catch (err) {
      if (err?.message !== "__ATD_STOPPED__") {
        log(`Lỗi vòng lặp: ${err?.message || err}`, "error");
        stop("Đã dừng do gặp lỗi.");
      }
    }
  }

  function start() {
    if (running) return;
    running = true;
    runId++;
    const startBtn = $("#atd-start");
    const stopBtn = $("#atd-stop");
    if (startBtn) startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;
    $("#atd-fab")?.classList.add("running");
    setStatus("Đang khởi chạy chuỗi nhiệm vụ tự động…", "running");
    log("Bắt đầu chạy Auto Nhiệm Vụ.", "ok");
    mainLoop(runId);
  }

  function stop(message = "Đã dừng.") {
    running = false;
    runId++;
    const startBtn = $("#atd-start");
    const stopBtn = $("#atd-stop");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    $("#atd-fab")?.classList.remove("running");
    setStatus(message, "warn");
    log(message, "warn");
  }

  function resetDailyState() {
    doneOnce.clear();
    serverChores.quet = false;
    serverChores.ca = false;
    serverChores.den = false;
    serverChores.tk = false;
    saveServerChores();
    saveDoneOnce();
    updateTagUI();
    updateTodayStatsUI();
    log("Đã đặt lại trạng thái các nhiệm vụ 1 lần/ngày.", "info");
  }

  // Quản lý vị trí & thu gọn / mở rộng menu
  // Mặc định đặt tại top: 105px; right: 18px (cách hàng nút Cài đặt của game an toàn > 45px)
  const DEFAULT_POS = { top: 105, right: 18 };

  function loadPosition() {
    try {
      const saved = JSON.parse(localStorage.getItem("atd_pos") || "null");
      // Nếu vị trí lưu cũ nằm quá cao (< 95px) từng gây đè nút Cài đặt, tự động chuyển về vị trí mới
      if (saved && typeof saved.top === "number" && saved.top >= 95) {
        return saved;
      }
    } catch {}
    return DEFAULT_POS;
  }

  function savePosition(pos) {
    try {
      localStorage.setItem("atd_pos", JSON.stringify(pos));
    } catch {}
  }

  function applyPosition(el, pos) {
    if (!el) return;
    const p = pos || loadPosition();
    if (typeof p.left === "number") {
      const maxLeft = Math.max(8, window.innerWidth - (el.offsetWidth || 340) - 8);
      const left = Math.max(8, Math.min(maxLeft, p.left));
      el.style.left = `${left}px`;
      el.style.right = "auto";
    } else {
      const right = typeof p.right === "number" ? p.right : 18;
      el.style.right = `${right}px`;
      el.style.left = "auto";
    }

    const maxTop = Math.max(8, window.innerHeight - (el.offsetHeight || 50) - 8);
    const top = Math.max(8, Math.min(maxTop, p.top || 105));
    el.style.top = `${top}px`;
  }

  function setCollapsed(collapsed) {
    const fab = $("#atd-fab");
    const panel = $("#atd-panel");
    const pos = loadPosition();

    if (collapsed) {
      if (panel) {
        panel.classList.add("hidden");
        panel.style.display = "none";
      }
      if (fab) {
        fab.style.display = "flex";
        applyPosition(fab, pos);
      }
      try { localStorage.setItem("atd_collapsed", "1"); } catch {}
    } else {
      if (fab) {
        fab.style.display = "none";
      }
      if (panel) {
        panel.style.display = "block";
        panel.classList.remove("hidden");
        applyPosition(panel, pos);
      }
      try { localStorage.setItem("atd_collapsed", "0"); } catch {}
    }
  }

  function openPanel() {
    setCollapsed(false);
  }

  function closePanel() {
    setCollapsed(true);
  }

  function attachDraggable(handleEl, targetEl, onDragEnd) {
    let isDown = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;
    let hasMoved = false;

    handleEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      // Không kéo thả khi click vào nút con bên trong handle (ví dụ nút '-' thu gọn)
      if (e.target.closest("button") && e.target.closest("button") !== handleEl) return;

      isDown = true;
      hasMoved = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = targetEl.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      try { handleEl.setPointerCapture(e.pointerId); } catch {}
    });

    handleEl.addEventListener("pointermove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 5) {
        hasMoved = true;
      }
      if (!hasMoved) return;

      const maxLeft = Math.max(8, window.innerWidth - targetEl.offsetWidth - 8);
      const maxTop = Math.max(8, window.innerHeight - targetEl.offsetHeight - 8);
      const curLeft = Math.max(8, Math.min(maxLeft, initialLeft + dx));
      const curTop = Math.max(8, Math.min(maxTop, initialTop + dy));

      targetEl.style.left = `${curLeft}px`;
      targetEl.style.top = `${curTop}px`;
      targetEl.style.right = "auto";
    });

    const onPointerUp = (e) => {
      if (!isDown) return;
      isDown = false;
      try { handleEl.releasePointerCapture(e.pointerId); } catch {}
      if (hasMoved) {
        const rect = targetEl.getBoundingClientRect();
        const pos = { left: Math.round(rect.left), top: Math.round(rect.top) };
        savePosition(pos);
        if (onDragEnd) onDragEnd(pos);
      }
    };

    handleEl.addEventListener("pointerup", onPointerUp);
    handleEl.addEventListener("pointercancel", onPointerUp);

    return () => hasMoved;
  }

  function mount() {
    if ($("#atd-fab") || $("#atd-panel")) return;

    // 1. Nút tròn Hoa Sen thu gọn (#atd-fab)
    const fab = document.createElement("button");
    fab.id = "atd-fab";
    fab.type = "button";
    fab.title = "An Tự Duyên Auto Task (Bấm để mở bảng điều khiển)";
    fab.setAttribute("aria-label", "Auto Task");
    fab.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 3c-1.5 3.5-1.5 7.5 0 11 1.5-3.5 1.5-7.5 0-11z" fill="rgba(255,255,255,0.22)"/>
        <path d="M12 14c-2.5-1.5-5.5-2-8.5-1 1.8 3.5 4.5 5.5 8.5 6 4-.5 6.7-2.5 8.5-6-3-1-6-.5-8.5 1z" fill="rgba(255,255,255,0.18)"/>
        <path d="M12 14c-1.5-3-4.5-5.5-8-6 .5 3.5 2.5 6.5 5.5 8"/>
        <path d="M12 14c1.5-3 4.5-5.5 8-6-.5 3.5-2.5 6.5-5.5 8"/>
        <circle cx="12" cy="14" r="1.5" fill="currentColor"/>
      </svg>
      <span id="atd-fab-badge"></span>
    `;
    document.documentElement.appendChild(fab);

    // Kéo thả nút tròn
    const fabMoved = attachDraggable(fab, fab);

    fab.addEventListener("click", () => {
      if (fabMoved()) return;
      setCollapsed(false);
    });

    // 2. Bảng điều khiển Menu chính (#atd-panel)
    const panel = document.createElement("section");
    panel.id = "atd-panel";
    panel.innerHTML = `
      <div class="atd-head">
        <div class="atd-brand">
          <div class="atd-brand-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#e5bc72" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3c-1.5 3.5-1.5 7.5 0 11 1.5-3.5 1.5-7.5 0-11z" fill="rgba(229,188,114,0.3)"/>
              <path d="M12 14c-2.5-1.5-5.5-2-8.5-1 1.8 3.5 4.5 5.5 8.5 6 4-.5 6.7-2.5 8.5-6-3-1-6-.5-8.5 1z" fill="rgba(229,188,114,0.2)"/>
              <path d="M12 14c-1.5-3-4.5-5.5-8-6 .5 3.5 2.5 6.5 5.5 8"/>
              <path d="M12 14c1.5-3 4.5-5.5 8-6-.5 3.5-2.5 6.5-5.5 8"/>
            </svg>
          </div>
          <div>
            <strong>An Tự Duyên · Auto 2.0 ${isCloneTab ? `<span style="color:#34d399;font-size:11px;font-weight:600;">[Clone #${currentCloneId}]</span>` : ''}</strong>
            <small>${isCloneTab ? 'Tab Clone · Tự động túc trực lạy đồng tâm' : 'Tự động di chuyển & làm trọn nhiệm vụ'}</small>
          </div>
        </div>
        <button id="atd-min" title="Thu gọn bảng điều khiển" aria-label="Thu gọn">−</button>
      </div>
      <div id="atd-body">
        <div class="atd-status">
          <span class="atd-status-dot" id="atd-status-dot"></span>
          <span id="atd-status">Sẵn sàng · bấm Chạy để tự động thực hiện</span>
        </div>
        <div class="atd-config">
          <div class="atd-config-head">
            <span class="atd-config-title">Tác vụ tự động <span id="atd-task-count">(${enabledTasks.size}/${ALL_TASKS.length})</span></span>
            <div class="atd-mini-btns">
              <button id="atd-all" type="button" title="Bật tất cả tác vụ trong tab này">Chọn hết</button>
              <button id="atd-clear" type="button" title="Bỏ chọn các tác vụ trong tab này">Bỏ chọn</button>
              <button id="atd-farm" type="button" title="Chỉ bật Mõ & Chuỗi hạt">Chỉ Mõ/Hạt</button>
            </div>
          </div>
          <div class="atd-tab-bar" id="atd-task-tabs">
            ${TASK_CATEGORIES.map(
              (cat) =>
                `<button type="button" class="atd-task-tab ${cat.id === "all" ? "active" : ""}" data-tab="${cat.id}">${cat.label} <span class="atd-tab-count" data-tab-count="${cat.id}"></span></button>`
            ).join("")}
          </div>
          <div class="atd-tags">
            ${ALL_TASKS.map(
              (t) =>
                `<button type="button" class="atd-tag on" data-task="${t.id}" data-category="${t.category}" title="${t.once ? "Chạy 1 lần rồi bỏ qua ở các vòng lặp sau" : "Lặp lại mỗi chu kỳ"}">${t.label}</button>`
            ).join("")}
          </div>
          <div class="atd-opts">
            <label class="atd-switch-row">
              <span class="atd-switch">
                <input type="checkbox" id="atd-loop" checked>
                <span class="atd-slider"></span>
              </span>
              <span>Tự động lặp (Mõ, Hạt, Hương, Đồng tâm, Thưởng)</span>
            </label>
            <label class="atd-switch-row">
              <span class="atd-switch">
                <input type="checkbox" id="atd-khoe">
                <span class="atd-slider"></span>
              </span>
              <span>Kèm lưu ảnh Thời khóa ({ t: "khoe" })</span>
            </label>
            <label class="atd-switch-row">
              <span class="atd-switch">
                <input type="checkbox" id="atd-dongtam" checked>
                <span class="atd-slider"></span>
              </span>
              <span>Bắt nhịp Lạy đồng tâm & Swarm đa tab</span>
            </label>
            <div class="atd-peers-row">
              <div class="atd-peers-label">
                <span>Canh lạy cùng lúc:</span>
                <small id="atd-dt-status">Mục tiêu: ≥${minPeersToBow} người</small>
              </div>
              <div class="atd-peers-ctrl">
                <div class="atd-mini-btns" id="atd-dongtam-targets">
                  <button type="button" class="atd-dt-opt ${minPeersToBow === 1 ? 'on' : ''}" data-target="1" title="≥1 người (bất kỳ ai lạy là theo ngay)">1</button>
                  <button type="button" class="atd-dt-opt ${minPeersToBow === 2 ? 'on' : ''}" data-target="2" title="≥2 người cùng lạy">2</button>
                  <button type="button" class="atd-dt-opt ${minPeersToBow === 3 ? 'on' : ''}" data-target="3" title="≥3 người cùng lạy">3</button>
                  <button type="button" class="atd-dt-opt ${minPeersToBow === 5 ? 'on' : ''}" data-target="5" title="≥5 người cùng lạy">5</button>
                </div>
                <div class="atd-num-stepper" title="Tùy chỉnh số lượng người canh lạy cùng lúc">
                  <button type="button" id="atd-dt-dec" title="Giảm 1 người">−</button>
                  <input type="number" id="atd-dt-input" min="1" max="99" value="${minPeersToBow}" title="Nhập số người cần canh lạy cùng lúc">
                  <button type="button" id="atd-dt-inc" title="Tăng 1 người">+</button>
                </div>
              </div>
            </div>
            <div class="atd-clone-ctrl-box" id="atd-clone-ctrl-box">
              <div class="atd-clone-title">
                <span>👥 <b>Nhân bản Tab Clone (Swarm đa tab)</b>:</span>
              </div>
              <div class="atd-clone-btns">
                <button type="button" class="atd-clone-btn" id="atd-btn-add-clone" title="Mở thêm 1 tab Clone mới độc lập danh tính để cùng lạy">
                  👥 +1 Clone lạy cùng
                </button>
                <button type="button" class="atd-clone-btn highlight" id="atd-btn-add-3clones" title="Mở nhanh 3 tab Clone tự vào Chánh điện túc trực lạy">
                  🚀 Mở 3 Clone
                </button>
              </div>
            </div>
            <div class="atd-hac-quick-box" id="atd-hac-quick-box">
              <div class="atd-hac-title">
                <span>🦅 <b>Cưỡi Hạc trắng</b> (Bỏ qua lố giờ):</span>
              </div>
              <div class="atd-hac-btns">
                <button type="button" class="atd-hac-btn" id="atd-btn-hac-tron" title="Hạc đưa bạn bay 1 vòng lớn quanh chùa (~1.5 phút)">
                  🦅 Ngắm chùa (~1.5p)
                </button>
                <button type="button" class="atd-hac-btn ghost" id="atd-btn-hac-dua" title="Hạc đưa bạn từ hồ bay qua cổng lên sân chùa (~15s)">
                  🛫 Lên chùa (15s)
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="atd-today-box">
          <div class="atd-today-head">
            <span>📊 Tiến độ & Ngưỡng hôm nay</span>
            <button id="atd-refresh-today" type="button" title="Làm mới tiến độ">↻</button>
          </div>
          <div class="atd-today-grid" id="atd-today-stats"></div>
        </div>
        <div class="atd-actions">
          <button id="atd-start" type="button">▶ Chạy Auto</button>
          <button id="atd-stop" type="button" disabled>■ Dừng</button>
          <button id="atd-reset" type="button" title="Chạy lại các nhiệm vụ ngày đã đánh dấu xong">↻ Ngày mới</button>
        </div>
        <div class="atd-log-title">
          <span>Nhật ký hoạt động</span>
          <small style="font-weight:400;opacity:0.65;font-size:10px;">tự động lưu</small>
        </div>
        <div id="atd-log" aria-live="polite"></div>
        <p class="atd-note">Tiện ích tự động di chuyển nhân vật qua Bản đồ/Menu để khớp vị trí (<code>visit</code>, <code>state</code>, <code>am-in</code>), kiểm tra điều kiện tiên quyết và giữ nhịp gửi gói tin an toàn.</p>
      </div>`;
    document.documentElement.appendChild(panel);

    // Kéo thả panel bằng thanh tiêu đề
    const head = $(".atd-head", panel);
    attachDraggable(head, panel);

    // Nút thu gọn
    $("#atd-min", panel).addEventListener("click", (e) => {
      e.stopPropagation();
      setCollapsed(true);
    });

    $("#atd-start", panel).addEventListener("click", start);
    $("#atd-stop", panel).addEventListener("click", () => stop("Đã dừng theo yêu cầu."));
    $("#atd-reset", panel).addEventListener("click", resetDailyState);

    $("#atd-loop", panel).addEventListener("change", (e) => {
      loopMode = e.target.checked;
    });
    $("#atd-khoe", panel).addEventListener("change", (e) => {
      enableKhoe = e.target.checked;
    });
    $("#atd-dongtam", panel).addEventListener("change", (e) => {
      autoDongTam = e.target.checked;
      log(autoDongTam ? "Đã bật radar Bắt nhịp Lạy đồng tâm & Swarm." : "Đã tắt Bắt nhịp Lạy đồng tâm.", "info");
    });

    function setMinPeers(val) {
      const num = Math.max(1, Math.min(99, Math.round(Number(val) || 2)));
      minPeersToBow = num;
      try { localStorage.setItem("atd_dt_min", String(num)); } catch {}

      const input = $("#atd-dt-input", panel);
      if (input && Number(input.value) !== num) input.value = num;

      const status = $("#atd-dt-status", panel);
      if (status) status.textContent = `Mục tiêu: ≥${num} người`;

      $$(".atd-dt-opt", panel).forEach((b) => {
        b.classList.toggle("on", Number(b.dataset.target) === num);
      });

      log(`Mục tiêu Lạy đồng tâm: Đặt canh từ ≥${num} người lạy cùng lúc.`, "ok");
    }

    $$(".atd-dt-opt", panel).forEach((btn) => {
      btn.addEventListener("click", () => {
        setMinPeers(btn.dataset.target);
      });
    });

    const dtInput = $("#atd-dt-input", panel);
    if (dtInput) {
      dtInput.addEventListener("change", () => {
        setMinPeers(dtInput.value);
      });
      dtInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          setMinPeers(dtInput.value);
          dtInput.blur();
        }
      });
    }

    $("#atd-dt-dec", panel)?.addEventListener("click", () => {
      setMinPeers(minPeersToBow - 1);
    });

    $("#atd-dt-inc", panel)?.addEventListener("click", () => {
      setMinPeers(minPeersToBow + 1);
    });

    let currentCategory = "all";

    function filterTagsByCategory(catId) {
      currentCategory = catId;
      $$(".atd-task-tab", panel).forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === catId);
      });
      $$(".atd-tag", panel).forEach((tag) => {
        const cat = tag.dataset.category;
        if (catId === "all" || cat === catId) {
          tag.style.display = "";
        } else {
          tag.style.display = "none";
        }
      });
      const hacBox = $("#atd-hac-quick-box", panel);
      if (hacBox) {
        hacBox.style.display = (catId === "all" || catId === "linhvat") ? "flex" : "none";
      }
      const cloneBox = $("#atd-clone-ctrl-box", panel);
      if (cloneBox) {
        cloneBox.style.display = (catId === "all" || catId === "huong") ? "flex" : "none";
      }
    }

    const btnHacTron = $("#atd-btn-hac-tron", panel);
    if (btnHacTron) {
      btnHacTron.addEventListener("click", () => triggerDirectCuoiHac("tron"));
    }
    const btnHacDua = $("#atd-btn-hac-dua", panel);
    if (btnHacDua) {
      btnHacDua.addEventListener("click", () => triggerDirectCuoiHac("dua"));
    }
    const btnAddClone = $("#atd-btn-add-clone", panel);
    if (btnAddClone) {
      btnAddClone.addEventListener("click", () => openNewCloneTab());
    }
    const btnAdd3Clones = $("#atd-btn-add-3clones", panel);
    if (btnAdd3Clones) {
      btnAdd3Clones.addEventListener("click", () => openMultipleClones(3));
    }

    $$(".atd-task-tab", panel).forEach((tab) => {
      tab.addEventListener("click", () => {
        filterTagsByCategory(tab.dataset.tab);
      });
    });

    $("#atd-all", panel).addEventListener("click", () => {
      const targetTasks = currentCategory === "all"
        ? ALL_TASKS
        : ALL_TASKS.filter((t) => t.category === currentCategory);
      targetTasks.forEach((t) => enabledTasks.add(t.id));
      updateTagUI();
    });

    $("#atd-clear", panel).addEventListener("click", () => {
      const targetTasks = currentCategory === "all"
        ? ALL_TASKS
        : ALL_TASKS.filter((t) => t.category === currentCategory);
      targetTasks.forEach((t) => enabledTasks.delete(t.id));
      updateTagUI();
    });

    $("#atd-farm", panel).addEventListener("click", () => {
      enabledTasks.clear();
      ["mo", "beads", "incense", "dongtam", "claim"].forEach((id) => enabledTasks.add(id));
      updateTagUI();
    });

    $$(".atd-tag", panel).forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.task;
        if (enabledTasks.has(id)) enabledTasks.delete(id);
        else enabledTasks.add(id);
        updateTagUI();
      });

      // Chuột phải vào thẻ đã xong để đặt lại trạng thái nếu muốn chạy lại
      btn.addEventListener("contextmenu", (e) => {
        const id = btn.dataset.task;
        if (doneOnce.has(id)) {
          e.preventDefault();
          doneOnce.delete(id);
          if (id === "quet") serverChores.quet = false;
          if (id === "ca") serverChores.ca = false;
          if (id === "lamp") serverChores.den = false;
          if (id === "thoikhoa") serverChores.tk = false;
          saveServerChores();
          saveDoneOnce();
          updateTagUI();
          log(`Đã đặt lại trạng thái "${btn.textContent.trim()}" để chạy lại hôm nay.`, "info");
        }
      });
    });

    $("#atd-refresh-today", panel)?.addEventListener("click", () => {
      queryServerMerit();
      updateTodayStatsUI();
      log("Đã gửi yêu cầu đồng bộ tiến độ & ngưỡng từ máy chủ chùa.", "info");
    });

    updateTagUI();
    updateTodayStatsUI();
    setTimeout(queryServerMerit, 1500);

    if (isCloneTab) {
      enabledTasks.clear();
      enabledTasks.add("dongtam");
      loopMode = true;
      autoDongTam = true;
      minPeersToBow = 1;
      updateTagUI();
      log(`[Clone #${currentCloneId}] Đã nhận diện Tab Clone. Chờ 3.5s để tự động di chuyển vào Chánh điện túc trực lạy cùng…`, "ok");
      setTimeout(() => {
        if (!running) {
          start();
        }
      }, 3500);
    }

    // Trạng thái ban đầu: nếu người dùng chưa mở thì mặc định thu gọn thành nút tròn (#atd-fab)
    const initiallyCollapsed = localStorage.getItem("atd_collapsed") !== "0";
    setCollapsed(initiallyCollapsed);

    // Tự căn lại vị trí khi đổi kích thước màn hình
    window.addEventListener("resize", () => {
      const pos = loadPosition();
      const currentFab = $("#atd-fab");
      const currentPanel = $("#atd-panel");
      if (currentFab && currentFab.style.display !== "none") applyPosition(currentFab, pos);
      if (currentPanel && currentPanel.style.display !== "none") applyPosition(currentPanel, pos);
    });

    log("Auto Task 2.0 đã sẵn sàng. Bấm nút Hoa Sen hoặc ▶ Chạy Auto để bắt đầu.", "ok");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
