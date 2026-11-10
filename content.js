(() => {
  if (window.__ATD_AUTO_TASK_LOADED__) return;
  window.__ATD_AUTO_TASK_LOADED__ = true;

  // Chống đóng băng / chống throttle khi các Tab Clone chạy ở chế độ nền (background tab)
  try {
    Object.defineProperty(document, "hidden", {
      get: () => false,
      configurable: true
    });
    Object.defineProperty(document, "visibilityState", {
      get: () => "visible",
      configurable: true
    });
  } catch {}

  // --- CHẾ ĐỘ PHÂN TÁCH DANH TÍNH ĐA TAB / CLONE TAB (?clone=1, ?clone=2, ...) ---
  const urlParams = new URLSearchParams(window.location.search);
  const currentCloneId = urlParams.get("clone");
  const isCloneTab = Boolean(currentCloneId);

  // Giữ nhịp requestAnimationFrame cho Tab Clone khi chạy nền (tránh bị Chrome dừng hẳn làm kẹt #loading, H.fade và Q.layLeft)
  if (isCloneTab) {
    try {
      const origRAF = window.requestAnimationFrame.bind(window);
      const origCAF = window.cancelAnimationFrame.bind(window);
      let rafIdSeed = 100000;
      const pendingMap = new Map();

      window.requestAnimationFrame = function(callback) {
        const myId = ++rafIdSeed;
        let fired = false;
        let nativeId = 0;
        const timerId = setTimeout(() => {
          if (fired) return;
          fired = true;
          pendingMap.delete(myId);
          try { origCAF(nativeId); } catch {}
          try { callback(performance.now()); } catch {}
        }, 120);

        nativeId = origRAF((ts) => {
          if (fired) return;
          fired = true;
          pendingMap.delete(myId);
          clearTimeout(timerId);
          try { callback(ts); } catch {}
        });

        pendingMap.set(myId, { nativeId, timerId });
        return myId;
      };

      window.cancelAnimationFrame = function(id) {
        const entry = pendingMap.get(id);
        if (entry) {
          pendingMap.delete(id);
          clearTimeout(entry.timerId);
          try { origCAF(entry.nativeId); } catch {}
        } else {
          try { origCAF(id); } catch {}
        }
      };
    } catch {}
  }

  // Sinh UUID RFC4122 v4 chuẩn 36 ký tự (hợp lệ cho backend validator)
  function generateStandardUUID() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  let cloneTabCid = null;
  const cloneMonkName = isCloneTab ? `Đệ tử #${currentCloneId}` : "Chủ trì";

  if (isCloneTab) {
    try {
      const urlCid = urlParams.get("cid");
      const cloneKey = `atd_clone_uuid_${currentCloneId}`;
      let storedCid = urlCid || sessionStorage.getItem(cloneKey);
      if (!storedCid || storedCid.length !== 36 || storedCid.startsWith("cid_")) {
        storedCid = generateStandardUUID();
      }
      try { sessionStorage.setItem(cloneKey, storedCid); } catch {}
      cloneTabCid = storedCid;

      const robes = ["nau", "lam", "xam"];
      const monkRobe = robes[(Number(currentCloneId) - 1) % robes.length] || "nau";
      const cloneProfileObj = {
        name: `Đệ tử #${currentCloneId}`,
        kind: "tieu",
        robe: monkRobe,
        skin: "dong",
        bio: `Đệ tử trợ lực #${currentCloneId}`,
        beads: "go",
        cushion: "vang",
        phapkhi: "mo"
      };

      const origGet = Storage.prototype.getItem;
      const origSet = Storage.prototype.setItem;
      const origRemove = Storage.prototype.removeItem;

      Storage.prototype.getItem = function(key) {
        if (key === "anduyen.cid") {
          return cloneTabCid;
        }
        if (key === "anduyen.profile") {
          return JSON.stringify(cloneProfileObj);
        }
        if (key === "anduyen.adopt") {
          return "0";
        }
        return origGet.apply(this, arguments);
      };

      Storage.prototype.setItem = function(key, val) {
        if (key === "anduyen.cid") {
          return; // Giữ nguyên UUID riêng của tab Clone
        }
        return origSet.apply(this, arguments);
      };

      console.log(`[AutoTask] Đã kích hoạt Clone Tab #${currentCloneId} · UUID độc lập: ${cloneTabCid}`);
      const origDocTitle = document.title;
      document.title = `[Đệ tử #${currentCloneId}] ${origDocTitle || "An Tự Duyên"}`;
    } catch (e) {
      console.warn("[AutoTask] Clone storage hook error:", e);
    }
  }

  // Tự động bỏ qua / bấm "Dùng ở đây" nếu gặp thông báo "Chùa đang mở ở nơi khác"
  let lastBannedClick = 0;
  try {
    const bannedObserver = new MutationObserver(() => {
      const bannedEl = document.querySelector(".banned");
      if (bannedEl && Date.now() - lastBannedClick > 3000) {
        const btn = bannedEl.querySelector("button");
        if (btn && btn.textContent && btn.textContent.includes("Dùng ở đây")) {
          lastBannedClick = Date.now();
          console.log("[AutoTask] Tự động nhấn 'Dùng ở đây'...");
          btn.click();
        }
      }
    });
    bannedObserver.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}

  // --- HỆ THỐNG ĐỒNG BỘ LẠY ĐỒNG TÂM & BẮT NHỊP WEBSOCKET SWARM ---
  const TAB_ID = Math.random().toString(36).slice(2, 8);
  const swarmChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("atd_swarm_sync") : null;
  let activeWs = null;
  let lastPeerBowTime = 0;
  let lastOwnBowTime = 0;
  let autoDongTam = true;
  let currentZone = "";
  let currentServerRoom = new URLSearchParams(window.location.search).get("phong") || "";
  let lastKnownPlace = "";
  let peerBowEvents = [];
  let wsSentLayCount = 0;
  let allowMasterDirectLay = false;
  let myHallOffset = null;

  // Vai trò Swarm: 'master' (Tab Chủ trì) hoặc 'follower' (Tab Trợ lực)
  // Nếu có ?clone= trên URL -> BẮT BUỘC 100% LÀ 'follower'!
  // Không đọc lại từ sessionStorage vì window.open sao chép sessionStorage từ tab cha (Master)!
  let swarmRole = isCloneTab ? "follower" : (sessionStorage.getItem("atd_swarm_role") || "master");
  if (isCloneTab) {
    try { sessionStorage.setItem("atd_swarm_role", "follower"); } catch {}
  }
  let minPeersToBow = swarmRole === "follower" ? 1 : Number(localStorage.getItem("atd_dt_min") || "5");
  let activeSwarmPeers = new Map(); // from -> { role, cloneId, name, time }
  let lastLandedCraneTime = 0;
  let lastHacData = null;

  // Đảm bảo đồng bộ vị trí đứng tại Chánh điện (0, 2.4, -3) và zone "Chánh điện" lên Server (kể cả khi tab chạy nền)
  function syncChanhDienStateToServer() {
    if (!activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    try {
      if (!myHallOffset) {
        const idx = Number(currentCloneId || 0);
        const offsets = [
          { x: 0, z: -3.0 },
          { x: -1.1, z: -2.8 },
          { x: 1.1, z: -2.8 },
          { x: -1.8, z: -3.4 },
          { x: 1.8, z: -3.4 }
        ];
        myHallOffset = offsets[idx % offsets.length] || { x: (Math.random() - 0.5) * 2, z: -3.0 };
      }
      activeWs.send(JSON.stringify({ t: "visit", zone: "Chánh điện" }));
      activeWs.send(JSON.stringify({
        t: "state",
        x: myHallOffset.x,
        y: 2.4,
        z: myHallOffset.z,
        ry: Math.PI,
        s: 0
      }));
      currentZone = "Chánh điện";
      lastKnownPlace = "Chánh điện";
    } catch {}
  }

  // Đảm bảo Tab Clone luôn ở cùng phòng (chua-1, chua-2, ...) với Tab Chủ trì
  function ensureSameRoomAsMaster(masterRoom) {
    if (!masterRoom || !activeWs || activeWs.readyState !== WebSocket.OPEN) return;
    if (currentServerRoom && currentServerRoom !== masterRoom) {
      try {
        log(`🔄 [Đệ tử #${currentCloneId || "Trợ lực"}] Đang ở ${currentServerRoom}, tự động chuyển sang ${masterRoom} cùng Chủ trì…`, "warn");
        activeWs.send(JSON.stringify({ t: "room-go", room: masterRoom }));
        currentServerRoom = masterRoom;
        setTimeout(syncChanhDienStateToServer, 600);
      } catch {}
    }
  }

  // Thực hiện động tác lạy trực tiếp của Tab này (tránh gửi đúp 2 gói tin cùng lúc)
  function triggerDirectBow(bypassIntercept = false) {
    const now = Date.now();
    lastOwnBowTime = now;
    if (isCloneTab || swarmRole === "follower" || currentZone === "Chánh điện" || lastKnownPlace === "Chánh điện") {
      syncChanhDienStateToServer();
    }
    const beforeCount = wsSentLayCount;
    const layBtn = findActionBtn("Lạy");
    if (layBtn && !layBtn.disabled) {
      allowMasterDirectLay = bypassIntercept;
      fireClick(layBtn);
      allowMasterDirectLay = false;
    }
    // Nếu fireClick(layBtn) chưa gửi được gói WS (ví dụ Q.busy trên tab nền hoặc nút ẩn), gửi trực tiếp qua WebSocket
    if (wsSentLayCount === beforeCount && activeWs && activeWs.readyState === WebSocket.OPEN) {
      try {
        allowMasterDirectLay = bypassIntercept;
        activeWs.send(JSON.stringify({ t: "emote", e: "lay" }));
        allowMasterDirectLay = false;
      } catch {}
    }
    return true;
  }

  function triggerBowAction() {
    const now = Date.now();
    if (now - lastOwnBowTime < 4800) return false;
    if (!isCloneTab && swarmRole === "master" && getSwarmFollowerCount() > 0) {
      executeMasterDongTamBow();
      return true;
    }
    return triggerDirectBow(true);
  }

  // Giao tiếp Swarm kép: vừa qua BroadcastChannel vừa qua localStorage StorageEvent (chống thất lạc)
  function sendSwarmMessage(msg) {
    if (swarmChannel) {
      try { swarmChannel.postMessage(msg); } catch (e) {}
    }
    try {
      localStorage.setItem("atd_swarm_bus", JSON.stringify({ ...msg, _t: Date.now() + Math.random() }));
    } catch (e) {}
  }

  // --- QUY TRÌNH PHỐI HỢP: ĐỆ TỬ LẠY TRƯỚC -> BÁO VỀ -> CHỦ TRÌ LẠY THEO ---
  let isCoordinatingBow = false;
  let pendingBowSession = null; // { sessionId, acks: Map<from, name>, serverEmotes: Set<id>, startTime }

  async function executeMasterDongTamBow() {
    if (isCoordinatingBow) return false;
    const now = Date.now();
    if (now - lastOwnBowTime < 4800) {
      log(`⏳ Vừa lạy xong, chờ giãn cách (~${Math.ceil((4800 - (now - lastOwnBowTime)) / 1000)}s) để phát động đợt lạy mới…`, "wait");
      return false;
    }

    isCoordinatingBow = true;
    syncChanhDienStateToServer();
    const sessionId = "bow_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const followerCount = getSwarmFollowerCount();

    log(`👑 [Chủ trì] PHÁT ĐỘNG LẠY ĐỒNG TÂM: Lệnh cho ${followerCount > 0 ? followerCount : "các"} đệ tử Trợ lực LẠY TRƯỚC!…`, "step");

    pendingBowSession = {
      sessionId: sessionId,
      acks: new Map(),
      serverEmotes: new Set(),
      startTime: Date.now()
    };

    // 1. Master phát tin nhắn CLONES_BOW_FIRST qua cả BroadcastChannel lẫn Storage Bus
    sendSwarmMessage({
      type: "CLONES_BOW_FIRST",
      from: TAB_ID,
      sessionId: sessionId,
      room: currentServerRoom || new URLSearchParams(window.location.search).get("phong") || "chua-1",
      time: Date.now()
    });

    // 2. Chờ các tab Clone gửi gói lạy lên Server và Server broadcast về (khoảng 450ms - 950ms)
    const waitLimit = 950;
    const startWait = Date.now();
    while (Date.now() - startWait < waitLimit) {
      const elapsed = Date.now() - startWait;
      const ackCount = Math.max(pendingBowSession.acks.size, pendingBowSession.serverEmotes.size);
      const expected = followerCount > 0 ? followerCount : 1;
      if (ackCount >= expected && elapsed >= 450) {
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    const ackCount = Math.max(pendingBowSession.acks.size, pendingBowSession.serverEmotes.size);
    if (pendingBowSession.acks.size > 0) {
      const names = Array.from(pendingBowSession.acks.values()).join(", ");
      log(`🙏 [Chủ trì] Đã nhận tín hiệu từ ${pendingBowSession.acks.size} đệ tử: [${names}] đã lạy trên Server!`, "ok");
    } else if (ackCount > 0) {
      log(`🙏 [Chủ trì] Server xác nhận ${ackCount} người vừa lạy trong Chánh điện!`, "ok");
    } else {
      log(`⚠️ [Chủ trì] Chưa nhận phản hồi từ đệ tử · Chủ trì vẫn tiến hành lạy…`, "wait");
    }

    // 3. Chủ trì lạy ngay khi các đệ tử vừa lạy trên server để Chủ trì là người thứ 5 hoàn tất sóng Đồng Tâm!
    log(`👑 [Chủ trì] Chủ trì lạy ngay để gặt trọn công đức Đồng Tâm (≥${ackCount + 1} người cùng lạy)!`, "ok");
    triggerDirectBow(true);
    broadcastSwarmBow();

    setTimeout(() => {
      isCoordinatingBow = false;
      pendingBowSession = null;
    }, 4800);

    return true;
  }

  function broadcastSwarmBow() {
    sendSwarmMessage({ type: "SWARM_BOW", from: TAB_ID, time: Date.now() });
  }

  function broadcastSwarmHeartbeat() {
    sendSwarmMessage({
      type: "SWARM_HEARTBEAT",
      from: TAB_ID,
      role: isCloneTab ? "follower" : swarmRole,
      cloneId: currentCloneId || null,
      name: isCloneTab ? `Đệ tử #${currentCloneId}` : "Chủ trì",
      room: currentServerRoom || new URLSearchParams(window.location.search).get("phong") || "chua-1",
      time: Date.now()
    });
  }

  setInterval(broadcastSwarmHeartbeat, 2500);
  setTimeout(broadcastSwarmHeartbeat, 400);

  function getSwarmFollowers() {
    const now = Date.now();
    const list = [];
    for (const [id, peer] of activeSwarmPeers.entries()) {
      if (now - peer.time <= 7500 && peer.role === "follower") {
        list.push({ id, cloneId: peer.cloneId, name: peer.name });
      }
    }
    return list;
  }

  function getSwarmFollowerCount() {
    return getSwarmFollowers().length;
  }

  function updateSwarmInfoUI() {
    const badge = $("#atd-role-badge");
    if (badge) {
      badge.className = `atd-role-badge ${swarmRole}`;
      badge.textContent = swarmRole === "master" ? "👑 Chủ trì (Master)" : `🤝 Trợ lực [Đệ tử #${currentCloneId || '?'}]`;
    }
    const statusBar = $("#atd-swarm-status-bar");
    if (!statusBar) return;

    if (swarmRole === "master") {
      const followers = getSwarmFollowerCount();
      const followerList = getSwarmFollowers();
      const totalSquad = followers + 1;
      const isEnough = totalSquad >= minPeersToBow;
      const names = followerList.map((f) => f.name || `Đệ tử #${f.cloneId || '?'}`).join(", ");
      statusBar.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:3px; width:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span>👥 Đang liên kết: <b style="color:#34d399;">${followers}</b> đệ tử trợ lực (Tổng đoàn: <b>${totalSquad}</b> ng)</span>
            <span style="color:${isEnough ? '#34d399' : '#e5bc72'}; font-weight:600; font-size:10px;">
              ${isEnough ? '✅ Đủ mốc ≥' + minPeersToBow : '⏳ Chờ thêm để đủ ≥' + minPeersToBow}
            </span>
          </div>
          ${followers > 0 ? `<div style="font-size:10px; color:#a7f3d0; opacity:0.9;">📋 Danh sách: ${names}</div>` : ''}
        </div>
      `;
    } else {
      statusBar.innerHTML = `
        <span style="color:#d1fae5;">🤝 Đệ tử #${currentCloneId || 'Trợ lực'} · Túc trực Chánh điện · Chờ lệnh Lạy trước từ Tab Chủ trì</span>
      `;
    }
  }

  function setSwarmRole(role) {
    swarmRole = role;
    if (isCloneTab) {
      sessionStorage.setItem(`atd_swarm_role_clone_${currentCloneId}`, role);
    } else {
      sessionStorage.setItem("atd_swarm_role", role);
    }
    if (role === "follower") {
      minPeersToBow = 1;
    } else {
      minPeersToBow = Number(localStorage.getItem("atd_dt_min") || "5");
    }
    broadcastSwarmHeartbeat();
    updateSwarmInfoUI();
    const btnMaster = $("#atd-role-btn-master");
    const btnFollower = $("#atd-role-btn-follower");
    if (btnMaster && btnFollower) {
      btnMaster.classList.toggle("active", role === "master");
      btnFollower.classList.toggle("active", role === "follower");
    }
    log(`Đã chuyển vai trò Tab: ${role === "master" ? "👑 Tab Chủ trì (Master)" : "🤝 Tab Trợ lực (Follower)"}`, "ok");
  }

  let lastHandledBowSessionId = null;
  function handleSwarmMessage(data) {
    if (!data || data.from === TAB_ID) return;
    const now = Date.now();

    // 1. Nhận nhịp tim từ các tab trong Swarm
    if (data.type === "SWARM_HEARTBEAT") {
      activeSwarmPeers.set(data.from, {
        role: data.role,
        cloneId: data.cloneId,
        name: data.name,
        room: data.room,
        time: now
      });
      if ((isCloneTab || swarmRole === "follower") && data.role === "master" && data.room) {
        ensureSameRoomAsMaster(data.room);
      }
      updateSwarmInfoUI();
      return;
    }

    // 2. Tab Trợ lực (Follower / Clone) nhận lệnh LẠY TRƯỚC từ Tab Chủ trì (Master)
    if (data.type === "CLONES_BOW_FIRST") {
      if (isCloneTab || swarmRole === "follower") {
        if (data.sessionId && data.sessionId === lastHandledBowSessionId) return;
        lastHandledBowSessionId = data.sessionId;

        if (data.room) {
          ensureSameRoomAsMaster(data.room);
        }
        syncChanhDienStateToServer();

        log(`👑 [Đệ tử #${currentCloneId || "Trợ lực"}] Nhận lệnh Lạy từ Chủ trì -> Lập tức lạy trước!`, "ok");
        const bowed = triggerDirectBow(true);
        const myName = `Đệ tử #${currentCloneId || "Trợ lực"}`;

        // Báo tín hiệu ACK về ngay cho Chủ trì qua cả 2 kênh
        sendSwarmMessage({
          type: "CLONE_BOWED_ACK",
          from: TAB_ID,
          cloneId: currentCloneId,
          name: myName,
          sessionId: data.sessionId,
          bowed: bowed,
          time: Date.now()
        });
        log(`📡 [Đệ tử #${currentCloneId || "Trợ lực"}] Đã lạy xong -> Báo tín hiệu về Chủ trì thành công!`, "ok");
      }
      return;
    }

    // 3. Tab Chủ trì nhận tín hiệu ACK từ các Tab Trợ lực
    if (data.type === "CLONE_BOWED_ACK") {
      if ((!isCloneTab && swarmRole === "master") && pendingBowSession && pendingBowSession.sessionId === data.sessionId) {
        const cloneName = data.name || `Đệ tử #${data.cloneId || "Trợ lực"}`;
        if (!pendingBowSession.acks.has(data.from)) {
          pendingBowSession.acks.set(data.from, cloneName);
          log(`📥 [Chủ trì] Nhận tín hiệu trợ lực: ${cloneName} đã lạy (${pendingBowSession.acks.size}/${getSwarmFollowerCount() || "?"})`, "info");
        }
      }
      return;
    }

    // 4. Xử lý sóng lạy đồng tâm từ các tab khác ngoài Swarm hoặc nhịp lạy chung
    if (data.type === "SWARM_BOW" && autoDongTam) {
      if (isCloneTab || swarmRole === "follower" || isCoordinatingBow) {
        return; // Follower chỉ lạy khi có lệnh CLONES_BOW_FIRST từ Chủ trì
      }
      const peerId = `Tab_${data.from}`;
      peerBowEvents = peerBowEvents.filter((e) => now - e.time <= 4500 && e.id !== peerId);
      peerBowEvents.push({ id: peerId, time: now });
      lastPeerBowTime = now;

      const count = peerBowEvents.length;
      if (count + 1 >= minPeersToBow) {
        log(`✦ SÓNG LẠY ĐỒNG TÂM: Đã gom đủ ${count + 1}/${minPeersToBow} người (có Tab Swarm) -> Lập tức lạy cùng!`, "ok");
        if (triggerBowAction()) {
          peerBowEvents = [];
        }
      } else {
        log(`[Đồng tâm Swarm] Có ${count + 1}/${minPeersToBow} người · Chờ thêm để đủ ≥${minPeersToBow} người…`, "wait");
      }
    }
  }

  if (swarmChannel) {
    swarmChannel.onmessage = (event) => handleSwarmMessage(event.data);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "atd_swarm_bus" && event.newValue) {
      try {
        const data = JSON.parse(event.newValue);
        handleSwarmMessage(data);
      } catch {}
    }
  });

  // Quản lý mở các Tab Clone (độc lập tài khoản) để cùng túc trực Chánh điện & Lạy đồng tâm
  let nextCloneCounter = 1;
  function openNewCloneTab(specificIndex) {
    const id = specificIndex || nextCloneCounter++;
    const targetUrl = new URL(window.location.href);
    targetUrl.searchParams.set("clone", String(id));
    // Tạo CID duy nhất cho mỗi tab đệ tử để không bao giờ bị trùng CID hay báo "Chùa đang mở ở nơi khác"
    const uniqueTabCid = generateStandardUUID();
    targetUrl.searchParams.set("cid", uniqueTabCid);
    const curRoom = currentServerRoom || targetUrl.searchParams.get("phong") || "chua-1";
    targetUrl.searchParams.set("phong", curRoom);
    const win = window.open(targetUrl.toString(), "_blank");
    if (!win) {
      log(`⚠️ Trình duyệt chặn Popup! Hãy bấm biểu tượng 🚫 "Cửa sổ bật lên bị chặn" ở góc phải thanh URL và chọn "Luôn cho phép", hoặc bấm nút mở lẻ [#${id}] ở dưới nhé!`, "warn");
    } else {
      log(`👥 Đã mở Tab Trợ lực [Đệ tử #${id}] vào phòng ${curRoom} · CID: ${uniqueTabCid.slice(0, 8)}…`, "ok");
    }
  }

  function openMultipleClones(total = 4) {
    log(`🚀 Đang mở ${total} Tab Trợ lực vào Chánh điện… (Nếu Chrome chỉ mở 1 tab, hãy bấm Cho phép Popup trên thanh URL hoặc bấm các nút [#1, #2, #3, #4] bên dưới)`, "step");
    for (let i = 1; i <= total; i++) {
      openNewCloneTab(i);
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
    { id: "dovui", label: "Đố vui Phật pháp", category: "tutap", once: true },
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
  let serverMeritDays = 1;
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

    if ((msg.t === "welcome" || msg.t === "room") && msg.room) {
      currentServerRoom = msg.room;
    }

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
      if (typeof msg.me.days === "number" && msg.me.days > 0) {
        serverMeritDays = msg.me.days;
      }
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

    // 4. Lưu cache gói tin Quà điểm danh ({ t: "checkin" })
    if (msg.t === "checkin") {
      lastCheckinData = msg;
      try { localStorage.setItem("atd_checkin_cache", JSON.stringify(msg)); } catch {}
    }

    if (changed) {
      saveServerChores();
      saveDoneOnce();
      try { updateTagUI(); } catch {}
      try { updateTodayStatsUI(); } catch {}
    }
  }

  let lastCheckinData = null;
  try {
    const cached = localStorage.getItem("atd_checkin_cache");
    if (cached) lastCheckinData = JSON.parse(cached);
  } catch {}

  const W_SVG_MERIT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 5c2 2.5 2.5 6 0 10-2.5-4-2-7.5 0-10z"/><path d="M12 15c-3-.5-6-3-6.5-6.5 3 0 5.5 2 6.5 6.5zM12 15c3-.5 6-3 6.5-6.5-3 0-5.5 2-6.5 6.5z"/><path d="M5 18h14"/></svg>';
  const W_SVG_INCENSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21V9M12 21V7M15 21V9"/><path d="M12 5c-1-1.5 1-2 0-3.5M9 7c-1-1.5 1-2 0-3.5M15 7c-1-1.5 1-2 0-3.5"/></svg>';
  const W_SVG_BEADS = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="4.5" r="2"/><circle cx="17.3" cy="6.7" r="2"/><circle cx="19.5" cy="12" r="2"/><circle cx="17.3" cy="17.3" r="2"/><circle cx="12" cy="19.5" r="2.6"/><circle cx="6.7" cy="17.3" r="2"/><circle cx="4.5" cy="12" r="2"/><circle cx="6.7" cy="6.7" r="2"/></svg>';

  function openDailyCheckin() {
    let weekEl = document.querySelector(".sheet.week");
    if (!weekEl) {
      weekEl = document.createElement("div");
      weekEl.className = "sheet week";
      const container = document.getElementById("canvas-container") || document.body;
      container.appendChild(weekEl);
    }

    // Nếu bảng chưa có cấu trúc nội dung đầy đủ (do máy chủ không gửi { t: "checkin" } khi đã nhận rồi hoặc sau F5)
    if (!weekEl.querySelector(".week-grid") || !weekEl.querySelector(".week-day")) {
      const data = lastCheckinData || {};
      const days = Number(data.days || serverMeritDays || 1);
      const day = Number(data.day || (((days - 1) % 7) + 1));
      const gifts = data.gifts && Array.isArray(data.gifts) && data.gifts.length === 7
        ? data.gifts
        : [
            "100 công đức",
            "3 nén hương",
            "200 công đức",
            "3 nén hương",
            "300 công đức",
            "3 nén hương",
            "Tràng hạt mã não"
          ];
      const got = data.got || gifts[Math.max(0, day - 1)] || "100 công đức";

      const gridHtml = gifts.map((giftText, idx) => {
        const d = idx + 1;
        const icon = d === 7 ? W_SVG_BEADS : (giftText.includes("hương") ? W_SVG_INCENSE : W_SVG_MERIT);
        const classes = ["week-day"];
        if (d < day) classes.push("done");
        if (d === day) classes.push("today");
        if (d === 7) classes.push("rare");
        return `<div class="${classes.join(" ")}"><b>Ngày ${d}</b>${icon}<span>${giftText}</span></div>`;
      }).join("");

      const nextSub = day < 7
        ? `Lần tới lên chùa bạn nhận quà ngày ${day + 1}.`
        : "Đã trọn bảy phần quà! Lần tới bắt đầu vòng mới.";

      weekEl.innerHTML = `
        <button class="sheet-close" aria-label="Đóng">×</button>
        <div class="sheet-title">Quà điểm danh</div>
        <p class="sheet-sub">${days > 1 ? `Đây là lần thứ <b>${days}</b> bạn lên chùa.` : "Mỗi ngày lên chùa là một phần quà."} Nghỉ vài hôm cũng không sao, quà vẫn đợi bạn.</p>
        <div class="week-grid">${gridHtml}</div>
        <div class="week-got">Hôm nay nhận: <b>${got}</b></div>
        <p class="sheet-sub">${nextSub}</p>
        <div class="week-foot">
          <button class="ghost" data-act="book">Xem Sổ sen</button>
          <button class="primary" data-act="close">Đóng lại</button>
        </div>
      `;

      weekEl.querySelectorAll(".sheet-close, [data-act='close'], .primary").forEach((btn) => {
        btn.addEventListener("click", () => {
          weekEl.classList.remove("open");
        });
      });

      const bookBtn = weekEl.querySelector('[data-act="book"]');
      if (bookBtn) {
        bookBtn.addEventListener("click", () => {
          weekEl.classList.remove("open");
          const topBook = document.querySelector(".top-btn.book") || document.querySelector('[data-top="book"]');
          if (topBook) {
            topBook.click();
          } else {
            const sheetBook = document.querySelector(".sheet.book");
            if (sheetBook) sheetBook.classList.add("open");
          }
        });
      }
    }

    weekEl.classList.add("open");
    log("🎁 Đã hiển thị đầy đủ bảng Quà điểm danh hằng ngày!", "ok");
    return true;
  }
  window.openDailyCheckin = openDailyCheckin;

  function queryServerMerit() {
    try {
      if (activeWs && activeWs.readyState === WebSocket.OPEN) {
        activeWs.send(JSON.stringify({ t: "merit" }));
      }
    } catch {}
  }

  // Kho câu hỏi Đố vui Phật pháp (tự động đồng bộ từ gói { t: "quiz-practice" } của máy chủ + bộ câu hỏi chuẩn dự phòng)
  const FALLBACK_QUIZ_QUESTIONS = [
    {
      text: "Đức Phật Thích Ca Mâu Ni đản sinh tại vườn nào?",
      opts: ["Vườn Lâm Tỳ Ni", "Vườn Lộc Uyển", "Vườn Kỳ Viên", "Vườn Trúc Lâm"],
      right: 0,
      why: "Thái tử Tất Đạt Đa đản sinh tại vườn Lâm Tỳ Ni (Lumbini) dưới cội cây Vô Ưu."
    },
    {
      text: "Đức Phật thành đạo dưới cội cây gì?",
      opts: ["Cây Sala", "Cây Bồ Đề", "Cây Vô Ưu", "Cây Tùng"],
      right: 1,
      why: "Ngài thành đạo dưới cội cây Tất Bát La, về sau được gọi là cây Bồ Đề (Bodhi - Giác ngộ)."
    },
    {
      text: "Bài pháp đầu tiên Đức Phật thuyết giảng cho năm anh em Kiều Trần Như tại vườn Lộc Uyển là kinh gì?",
      opts: ["Kinh Pháp Hoa", "Kinh Kim Cang", "Kinh Chuyển Pháp Luân", "Kinh A Di Đà"],
      right: 2,
      why: "Kinh Chuyển Pháp Luân là bài pháp đầu tiên, giảng về Tứ Diệu Đế và Bát Chánh Đạo."
    },
    {
      text: "Trong Tứ Diệu Đế, bốn chân lý lần lượt là gì?",
      opts: ["Khổ - Tập - Diệt - Đạo", "Sinh - Lão - Bệnh - Tử", "Từ - Bi - Hỷ - Xả", "Giới - Định - Tuệ - Giải"],
      right: 0,
      why: "Tứ Diệu Đế gồm: Khổ đế, Tập đế (nguyên nhân khổ), Diệt đế (niết bàn hết khổ) và Đạo đế (con đường diệt khổ)."
    },
    {
      text: "Tứ Vô Lượng Tâm trong Phật giáo bao gồm bốn tâm nào?",
      opts: ["Chân - Thiện - Mỹ - An", "Từ - Bi - Hỷ - Xả", "Tín - Nguyện - Hạnh - Chứng", "Thân - Thọ - Tâm - Pháp"],
      right: 1,
      why: "Tứ Vô Lượng Tâm là bốn tâm rộng lớn không bờ bến: Từ (ban vui), Bi (cứu khổ), Hỷ (vui theo điều lành), Xả (buông xả chấp trước)."
    },
    {
      text: "Con số 108 hạt trong chuỗi tràng hạt Phật giáo tượng trưng cho việc đoạn trừ bao nhiêu phiền não?",
      opts: ["36 phiền não", "72 phiền não", "108 phiền não", "84 phiền não"],
      right: 2,
      why: "108 hạt tượng trưng cho việc đoạn trừ 108 phiền não trần lao của sáu căn khi tiếp xúc sáu trần trong ba thời."
    },
    {
      text: "Bát Chánh Đạo gồm bao nhiêu chi phần tu tập?",
      opts: ["4 chi phần", "6 chi phần", "8 chi phần", "10 chi phần"],
      right: 2,
      why: "Bát Chánh Đạo gồm 8 con đường chân chánh: Chánh kiến, Chánh tư duy, Chánh ngữ, Chánh nghiệp, Chánh mạng, Chánh tinh tấn, Chánh niệm, Chánh định."
    },
    {
      text: "Tam Bảo trong đạo Phật gồm ba ngôi quý báu nào?",
      opts: ["Giới - Định - Tuệ", "Phật - Pháp - Tăng", "Thân - Khẩu - Ý", "Quá khứ - Hiện tại - Vị lai"],
      right: 1,
      why: "Tam Bảo là Phật bảo (Đấng Giác Ngộ), Pháp bảo (Lời dạy chân lý) và Tăng bảo (Đoàn thể thanh tịnh hòa hợp)."
    },
    {
      text: "Tam học (ba môn học vô lậu) làm nền tảng tu tập của người con Phật là gì?",
      opts: ["Giới - Định - Tuệ", "Tín - Tấn - Niệm", "Bố thí - Ái ngữ - Lợi hành", "Từ - Bi - Hỷ"],
      right: 0,
      why: "Do giữ Giới mà sinh Định, do có Định mà phát sinh Tuệ giác giải thoát."
    },
    {
      text: "Vị Bồ Tát nào tiêu biểu cho đại nguyện lắng nghe tiếng kêu khổ của chúng sinh?",
      opts: ["Văn Thù Sư Lợi Bồ Tát", "Quán Thế Âm Bồ Tát", "Phổ Hiền Bồ Tát", "Địa Tạng Vương Bồ Tát"],
      right: 1,
      why: "Quán Thế Âm Bồ Tát luôn quán chiếu, lắng nghe tiếng khổ của thế gian để tầm thanh cứu khổ."
    },
    {
      text: "Lễ Vu Lan Báo Hiếu hằng năm diễn ra vào ngày rằm tháng mấy âm lịch?",
      opts: ["Rằm tháng Giêng", "Rằm tháng Tư", "Rằm tháng Bảy", "Rằm tháng Mười"],
      right: 2,
      why: "Rằm tháng Bảy âm lịch là mùa Vu Lan Báo Hiếu, bắt nguồn từ gương hiếu hạnh của Tôn giả Mục Kiền Liên."
    },
    {
      text: "Đại lễ Phật Đản kỷ niệm ngày Đức Phật Thích Ca ra đời được tổ chức vào tháng mấy âm lịch?",
      opts: ["Tháng Giêng", "Tháng Tư", "Tháng Bảy", "Tháng Chạp"],
      right: 1,
      why: "Rằm tháng Tư âm lịch hằng năm là Đại lễ Phật Đản."
    }
  ];

  let cachedQuizQuestions = [...FALLBACK_QUIZ_QUESTIONS];
  try {
    const savedQuiz = JSON.parse(localStorage.getItem("atd_quiz_bank") || "null");
    if (Array.isArray(savedQuiz) && savedQuiz.length > 0) {
      const seen = new Set(cachedQuizQuestions.map((q) => q.text));
      for (const q of savedQuiz) {
        if (q && q.text && Array.isArray(q.opts) && typeof q.right === "number" && !seen.has(q.text)) {
          seen.add(q.text);
          cachedQuizQuestions.unshift(q);
        }
      }
    }
  } catch {}

  function saveQuizQuestionsToCache(qs) {
    if (!Array.isArray(qs)) return;
    let added = 0;
    const seen = new Set(cachedQuizQuestions.map((q) => q.text));
    for (const q of qs) {
      if (q && q.text && Array.isArray(q.opts) && typeof q.right === "number") {
        if (!seen.has(q.text)) {
          seen.add(q.text);
          cachedQuizQuestions.unshift({
            text: q.text,
            opts: q.opts,
            right: q.right,
            why: q.why || "Mỗi câu hỏi là một dịp ôn lại lời Phật dạy."
          });
          added++;
        }
      }
    }
    if (added > 0) {
      try {
        localStorage.setItem("atd_quiz_bank", JSON.stringify(cachedQuizQuestions.slice(0, 120)));
      } catch {}
    }
  }

  let lastRealQuizData = null;
  let fetchingQuizQuestionsForLive = false;
  let customQuizSession = {
    active: false,
    autoSolve: false,
    questions: [],
    idx: 0,
    phase: "off",
    score: { pts: 0, right: 0 },
    mine: null,
    timer: null,
    startTime: 0,
    phaseStart: 0,
    currentPacket: null,
    onFinish: null
  };

  function dispatchQuizPacketToClient(packet) {
    if (!activeWs) return;
    try {
      const payload = { ...packet, _atdSimulated: true };
      customQuizSession.currentPacket = payload;
      const evt = new MessageEvent("message", {
        data: JSON.stringify(payload)
      });
      if (typeof activeWs.onmessage === "function") {
        activeWs.onmessage(evt);
      }
      activeWs.dispatchEvent(evt);
    } catch (err) {
      console.warn("[AutoTask] dispatchQuizPacketToClient error:", err);
    }
  }

  function findRightAnswerForQuestion(qObj) {
    if (!qObj || !qObj.text) return -1;
    if (typeof qObj.right === "number") return qObj.right;
    const exact = cachedQuizQuestions.find((item) => item.text === qObj.text);
    if (exact && typeof exact.right === "number") return exact.right;
    return -1;
  }

  // Tô sáng gợi ý đáp án đúng và chèn nút Mở ngoài giờ vào .sheet.quiz
  function decorateQuizSheetUI() {
    const sheet = document.querySelector(".sheet.quiz");
    if (!sheet) return;

    // Hiển thị thanh pill Đố vui trên góc trên nếu đang mở
    const pill = document.querySelector(".pill.quiz-pill");
    if (pill && !pill.style.display && pill.textContent.trim() === "") {
      pill.style.display = "";
      pill.innerHTML = `<span>🪷 Đố vui Phật pháp</span>`;
    }

    // 1. Nếu đang ở màn hình chờ / bảng xếp hạng ngoài giờ: Chèn nút "Tham gia Đố vui (Mở ngoài giờ)" & "Tự giải (10/10)"
    const practiceBtn = sheet.querySelector("[data-practice]");
    if (practiceBtn && !sheet.querySelector(".atd-quiz-inject-bar") && !sheet.querySelector(".quiz-opts")) {
      const bar = document.createElement("div");
      bar.className = "atd-quiz-inject-bar";
      bar.innerHTML = `
        <button type="button" class="primary atd-quiz-inline-join">🎯 Tham gia Đố vui ngay (10 câu · Mở ngoài giờ)</button>
        <button type="button" class="ghost atd-quiz-inline-auto">🤖 Tự động giải đúng 10/10 câu</button>
      `;
      practiceBtn.parentNode.insertBefore(bar, practiceBtn);
      bar.querySelector(".atd-quiz-inline-join")?.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerDirectDoVui(false);
      });
      bar.querySelector(".atd-quiz-inline-auto")?.addEventListener("click", (e) => {
        e.stopPropagation();
        triggerDirectDoVui(true);
      });
    }

    // 2. Nếu đang ở màn hình câu hỏi (Live [data-c] hoặc Ôn bài [data-p]): Gợi ý đáp án đúng
    const qTextEl = sheet.querySelector(".quiz-q");
    if (qTextEl) {
      const qText = qTextEl.textContent.trim();
      let rightIdx = -1;
      if (customQuizSession.active && customQuizSession.questions[customQuizSession.idx]) {
        rightIdx = customQuizSession.questions[customQuizSession.idx].right;
      } else {
        rightIdx = findRightAnswerForQuestion({ text: qText });
      }

      if (rightIdx >= 0) {
        const optBtn =
          sheet.querySelector(`.quiz-opt[data-c="${rightIdx}"]:not([disabled])`) ||
          sheet.querySelector(`.quiz-opt[data-p="${rightIdx}"]:not([disabled])`);
        if (optBtn && !optBtn.classList.contains("atd-quiz-hint")) {
          optBtn.classList.add("atd-quiz-hint");
          const span = optBtn.querySelector("span");
          if (span && !span.querySelector(".atd-hint-tag")) {
            const badge = document.createElement("em");
            badge.className = "atd-hint-tag";
            badge.textContent = " ✓ Gợi ý đúng";
            span.appendChild(badge);
          }
        }
      }
    }

    // 3. Nếu đang ở pha "show" của phiên mở ngoài giờ: Thêm nút "Câu tiếp ➔" để người chơi chủ động qua nhanh nếu muốn
    if (customQuizSession.active && customQuizSession.phase === "show" && !sheet.querySelector(".atd-quiz-next-now")) {
      const whyEl = sheet.querySelector(".quiz-why");
      if (whyEl) {
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "primary atd-quiz-next-now";
        nextBtn.style.marginTop = "8px";
        nextBtn.textContent = customQuizSession.idx + 1 < customQuizSession.questions.length
          ? `Câu tiếp theo (${customQuizSession.idx + 2}/${customQuizSession.questions.length}) ➔`
          : "Xem bảng kết quả ➔";
        nextBtn.addEventListener("click", () => {
          advanceCustomQuizQuestion();
        });
        whyEl.insertAdjacentElement("afterend", nextBtn);
      }
    }
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
            if (data && data.t === "checkin") {
              lastCheckinData = data;
              try { localStorage.setItem("atd_checkin_cache", JSON.stringify(data)); } catch {}
            }
          } catch {}
        });
      }
      try {
        let payload = typeof args[0] === "string" ? JSON.parse(args[0]) : null;
        if (payload) {
          // BẮT BUỘC ĐẢM BẢO CID KHÔNG TRÙNG LẶP CHO CLONE TAB ĐỂ SERVER KHÔNG BÁO "Chùa đang mở ở nơi khác"
          if (payload.t === "hello" && isCloneTab) {
            payload.cid = cloneTabCid;
            payload.name = `Đệ tử #${currentCloneId}`;
            args[0] = JSON.stringify(payload);
            console.log(`[AutoTask] Clone #${currentCloneId} enforced distinct UUID:`, cloneTabCid, "Name:", payload.name);
          }
          if (payload.t === "lv-xuong") {
            lastLandedCraneTime = Date.now();
          }
          if (payload.t === "visit" && payload.zone) {
            currentZone = payload.zone;
            lastKnownPlace = payload.zone;
          }
          if (payload.t === "emote" && payload.e === "lay") {
            wsSentLayCount++;
            // Nếu người dùng bấm nút "Lạy" trực tiếp của game trên Tab Chủ trì khi đang có đệ tử Clone:
            // Chặn gói tin lạy đơn độc của Chủ trì, phát lệnh cho toàn bộ đệ tử Clone lạy TRƯỚC (t=0ms),
            // rồi mới gửi gói tin lạy của Chủ trì lên Server sau 550ms để Chủ trì hưởng trọn công đức Đồng Tâm!
            if (!isCloneTab && swarmRole === "master" && !allowMasterDirectLay && !isCoordinatingBow && getSwarmFollowerCount() > 0) {
              isCoordinatingBow = true;
              lastOwnBowTime = Date.now();
              const sessionId = `${swarmTabId}_${Date.now()}`;
              log(`👑 [Chủ trì] Đã chặn lạy lẻ -> Phát lệnh cho ${getSwarmFollowerCount()} đệ tử lạy trước (550ms) để Chủ trì gặt trọn công đức Đồng Tâm!`, "ok");
              const cmd = {
                type: "CLONES_BOW_FIRST",
                sender: swarmTabId,
                sessionId,
                room: currentServerRoom || new URLSearchParams(window.location.search).get("phong") || "chua-1",
                time: Date.now()
              };
              if (swarmChannel) {
                try { swarmChannel.postMessage(cmd); } catch {}
              }
              try { localStorage.setItem("atd_swarm_bow_signal", JSON.stringify(cmd)); } catch {}
              const savedArgs = [...args];
              const savedWs = this;
              setTimeout(() => {
                try {
                  syncChanhDienStateToServer();
                  origSend.apply(savedWs, savedArgs);
                  lastOwnBowTime = Date.now();
                  broadcastSwarmBow();
                  log(`👑 [Chủ trì] Đệ tử đã vào tư thế lạy -> Gửi gói lạy của Chủ trì để hợp nhất Đồng Tâm!`, "ok");
                } catch {}
                setTimeout(() => { isCoordinatingBow = false; }, 4800);
              }, 550);
              return;
            }
            lastOwnBowTime = Date.now();
            if (!isCloneTab && swarmRole === "master") {
              broadcastSwarmBow();
            }
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
          // Đố vui Phật pháp mở ngoài giờ: Chặn gói { t: "quiz" } từ pull() để server không trả về phase="off" và không gây chớp giao diện
          if (payload.t === "quiz" && customQuizSession.active) {
            const sheet = document.querySelector(".sheet.quiz.open");
            if (sheet && !sheet.querySelector(".quiz-opts") && !sheet.querySelector(".quiz-board") && customQuizSession.currentPacket) {
              setTimeout(() => dispatchQuizPacketToClient(customQuizSession.currentPacket), 20);
            }
            return;
          }
          // Khi người chơi bấm chọn đáp án [data-c] trong phiên Đố vui mở ngoài giờ
          if (payload.t === "quiz-ans" && customQuizSession.active) {
            handleCustomQuizAnswer(Number(payload.i), Number(payload.c));
            return;
          }
          // Nếu người chơi tự bấm nút "Ôn bài" [data-practice] thủ công thì tắt phiên custom để sang chế độ Ôn bài
          if (payload.t === "quiz-practice" && !fetchingQuizQuestionsForLive) {
            if (customQuizSession.active) {
              clearTimeout(customQuizSession.timer);
              customQuizSession.active = false;
            }
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

                // Lưu câu hỏi Đố vui Phật pháp từ gói { t: "quiz-practice", qs }
                if (msg.t === "quiz-practice" && Array.isArray(msg.qs)) {
                  saveQuizQuestionsToCache(msg.qs);
                  // Nếu đang lấy câu hỏi ngầm cho phiên Thi 10 câu (ngoài giờ), không để game chuyển sang mode="practice"
                  if (fetchingQuizQuestionsForLive) {
                    return;
                  }
                  setTimeout(decorateQuizSheetUI, 60);
                }

                // Xử lý gói { t: "quiz" }
                if (msg.t === "quiz") {
                  if (!msg._atdSimulated) {
                    lastRealQuizData = msg;
                    // Nếu đang trong phiên Đố vui mở ngoài giờ mà server trả về phase="off", bỏ qua để không bị đóng màn hình câu hỏi
                    if (customQuizSession.active && msg.phase !== "ask") {
                      return;
                    }
                    // Nếu đúng 20:00 tối chùa mở Đố vui thật (phase="ask"), nhường quyền cho phiên thật của chùa!
                    if (msg.phase === "ask" && customQuizSession.active) {
                      clearTimeout(customQuizSession.timer);
                      customQuizSession.active = false;
                    }
                  }
                  setTimeout(decorateQuizSheetUI, 60);
                }

                // Bắt gói tin emote lạy của người khác trong phòng
                if (msg.t === "emote" && msg.e === "lay") {
                  const now = Date.now();
                  const peerId = msg.id || "Người chơi";
                  peerBowEvents = peerBowEvents.filter((e) => now - e.time <= 4500 && e.id !== peerId);
                  peerBowEvents.push({ id: peerId, time: now });
                  lastPeerBowTime = now;

                  // Nếu Chủ trì đang gom ACK từ đệ tử, ghi nhận ngay cả từ gói tin emote của Server
                  if (pendingBowSession && !pendingBowSession.resolved) {
                    pendingBowSession.serverEmotes.add(peerId);
                    const totalConfirmed = Math.max(pendingBowSession.acks.size, pendingBowSession.serverEmotes.size);
                    if (totalConfirmed >= pendingBowSession.expected && typeof pendingBowSession.resolveNow === "function") {
                      pendingBowSession.resolved = true;
                      pendingBowSession.resolveNow(totalConfirmed);
                    }
                  }

                  // QUAN TRỌNG: Tab Clone (Follower) tuyệt đối KHÔNG tự ý lạy theo sóng người lạ hoặc lạy SAU Chủ trì!
                  // Clone phải giữ hồi chiêu để chỉ lạy TRƯỚC khi có lệnh CLONES_BOW_FIRST từ Chủ trì.
                  if (!isCloneTab && swarmRole !== "follower" && !isCoordinatingBow && autoDongTam) {
                    const count = peerBowEvents.length;
                    // count người khác đang lạy + 1 (Chủ trì) >= minPeersToBow
                    if (count + 1 >= minPeersToBow) {
                      log(`✦ SÓNG LẠY ĐỒNG TÂM: Đã có ${count} đạo hữu đang lạy (tổng ${count + 1}/${minPeersToBow} người) -> Chủ trì lạy ngay để gặt công đức Đồng Tâm!`, "ok");
                      if (triggerDirectBow(true)) {
                        peerBowEvents = [];
                      }
                    } else {
                      log(`[Radar Đồng tâm] Đang có ${count} người vừa lạy (${peerId}) · Chờ đủ ${ Math.max(1, minPeersToBow - 1) } người cùng lạy…`, "wait");
                    }
                  }
                }
                // Nhận công đức từ chùa
                if (msg.t === "merit" && msg.gain) {
                  const gainAmt = typeof msg.gain === "object" ? (msg.gain.n ?? JSON.stringify(msg.gain)) : msg.gain;
                  const gainWhy = typeof msg.gain === "object" && msg.gain.why ? ` (${msg.gain.why})` : "";
                  log(`✦ Nhận công đức từ chùa: +${gainAmt} công đức${gainWhy}`, "ok");
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
        if (myRun != null && (!running || myRun !== runId)) {
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
      if (myRun != null) checkRun(myRun);
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
    syncChanhDienStateToServer();

    // Nếu người dùng CHỈ BẬT DUY NHẤT 1 tác vụ "Lạy đồng tâm":
    // Cho nhân vật đứng túc trực yên tại Chánh điện, liên tục lắng nghe người khác lạy & Swarm, KHÔNG dịch chuyển lại
    if (enabledTasks.size === 1 && enabledTasks.has("dongtam")) {
      log(`Chế độ Túc trực Chánh điện: ${swarmRole === "master" ? "👑 Tab Chủ trì chỉ huy sóng lạy (≥" + minPeersToBow + " người)" : "🤝 Tab Trợ lực túc trực tuân lệnh Chủ trì"}…`, "ok");
      setStatus(`Túc trực Chánh điện · ${swarmRole === "master" ? "Chủ trì canh sóng ≥" + minPeersToBow : "Chờ lệnh từ Chủ trì"}`);

      let waitSeconds = 0;
      let lastSquadLeadBowTime = 0;

      while (running && myRun === runId) {
        if (!checkRun(myRun)) return false;

        await sleep(1000, myRun);
        waitSeconds++;

        if (swarmRole === "master") {
          const followers = getSwarmFollowerCount();
          const totalSquad = followers + 1;
          const now = Date.now();

          // NẾU ĐOÀN SWARM ĐÃ CÓ ĐỦ QUÂN SỐ (1 Master + Followers >= minPeersToBow):
          // Master tự động dẫn đầu phát động nhịp lạy đồng loạt mỗi 7.5 giây!
          // Đệ tử lạy trước -> báo tín hiệu + emote về -> Master lạy sau để tối đa công đức!
          if (totalSquad >= minPeersToBow && now - lastSquadLeadBowTime >= 7500 && now - lastOwnBowTime >= 5600 && !isCoordinatingBow) {
            log(`👑 Tab Chủ trì: Đoàn Swarm đã gom đủ ${totalSquad}/${minPeersToBow} người -> Chủ trì phát lệnh đệ tử lạy trước để gặt trọn công đức Đồng Tâm!`, "ok");
            lastSquadLeadBowTime = now;
            await executeMasterDongTamBow();
          }

          if (waitSeconds % 4 === 0) {
            const recent = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
            setStatus(`👑 Chủ trì (${waitSeconds}s) · Đoàn: ${totalSquad} ng · Sóng: ${recent}/${minPeersToBow}`);
          }
        } else {
          // Tab Follower: Túc trực Chánh điện chờ lệnh từ Chủ trì & định kỳ báo tọa độ Chánh điện lên Server
          if (waitSeconds % 5 === 0) {
            syncChanhDienStateToServer();
            setStatus(`🤝 Trợ lực (${waitSeconds}s) · Túc trực Chánh điện chờ lệnh Chủ trì`);
          }
        }

        // Định kỳ kiểm tra nếu nhân vật chưa ở Chánh điện (hoặc bị chuyển cảnh ra ngoài) thì dịch chuyển vào lại
        if (waitSeconds % 12 === 0) {
          if (!isAlreadyAtPlace(PLACES.CHANH_DIEN, "Chánh điện")) {
            log("Phát hiện nhân vật chưa ở trong Chánh điện · Tự động di chuyển vào Chánh điện...", "warn");
            await teleportToPlace(PLACES.CHANH_DIEN, "Chánh điện", myRun);
          }
          syncChanhDienStateToServer();
        }
      }
      return true;
    }

    log(`Chánh điện: Bật radar lắng nghe nhịp lạy đồng tâm từ người khác & Swarm (mục tiêu ≥${minPeersToBow} người)…`, "ok");
    const prevBow = lastPeerBowTime;
    const startWait = Date.now();
    let caught = false;

    // Kiểm tra nếu Tab Master đã có đủ quân số Swarm ngay từ đầu:
    if (swarmRole === "master") {
      const followers = getSwarmFollowerCount();
      if (followers + 1 >= minPeersToBow) {
        log(`👑 Tab Chủ trì: Đã có sẵn ${followers + 1}/${minPeersToBow} người trong đoàn Swarm -> Phát động lạy ngay!`, "ok");
        caught = true;
      }
    }

    // Chờ tối đa 12 giây xem có gom đủ số người trong điện cùng lạy không
    while (!caught && Date.now() - startWait < 12000) {
      if (!checkRun(myRun)) return false;
      const recentPeers = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
      const followers = swarmRole === "master" ? getSwarmFollowerCount() : 0;
      const effectiveCount = recentPeers + (followers > 0 ? followers + 1 : 0);

      if (effectiveCount >= minPeersToBow || (minPeersToBow === 1 && lastPeerBowTime > prevBow)) {
        caught = true;
        break;
      }
      await sleep(400, myRun);
    }

    if (caught) {
      const curCount = peerBowEvents.filter((e) => Date.now() - e.time <= 4500).length;
      log(`✦ SÓNG LẠY ĐỒNG TÂM: Đã khớp sóng ${curCount >= minPeersToBow ? curCount : minPeersToBow} người cùng lạy -> Thực hiện lạy đồng tâm!`, "ok");
      if (swarmRole === "master") {
        await executeMasterDongTamBow();
      } else {
        triggerBowAction();
      }
      await sleep(5800, myRun);

      if (minPeersToBow <= 2) {
        log("Thực hiện thêm nhịp lạy đồng tâm #2…", "ok");
        if (swarmRole === "master") {
          await executeMasterDongTamBow();
        } else {
          triggerBowAction();
        }
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

  // 14b. Đố vui Phật pháp (Mở ngoài giờ 20:00 + Tham gia 10 câu + Tự động giải)
  function sendCurrentCustomQuizQuestion() {
    if (!customQuizSession.active) return;
    clearTimeout(customQuizSession.timer);

    const idx = customQuizSession.idx;
    const total = customQuizSession.questions.length;
    if (idx >= total) {
      // Kết thúc trọn vẹn 10 câu hỏi -> Hiển thị bảng tổng kết Hạng 1
      customQuizSession.phase = "end";
      const myName = (() => {
        try {
          const u = JSON.parse(localStorage.getItem("anduyen.user") || "null");
          return u?.name || "Thí chủ";
        } catch {
          return "Thí chủ";
        }
      })();
      const pts = customQuizSession.score.pts;
      const right = customQuizSession.score.right;
      const endPacket = {
        t: "quiz",
        phase: "end",
        n: total,
        now: Date.now(),
        upcoming: Date.now() + 3600000,
        left: 60000,
        rank: 1,
        score: { pts, right },
        top: [
          { pid: "me", name: myName, right, pts },
          { pid: "p1", name: "Tâm An", right: Math.max(6, right - 1), pts: Math.max(520, pts - 95) },
          { pid: "p2", name: "Minh Tuệ", right: Math.max(5, right - 2), pts: Math.max(410, pts - 180) }
        ]
      };
      dispatchQuizPacketToClient(endPacket);
      log(`🪷 Hoàn thành Đố vui Phật pháp (${right}/${total} câu đúng · ${pts} điểm)! A Di Đà Phật!`, "ok");
      setTimeout(() => {
        customQuizSession.active = false;
        decorateQuizSheetUI();
        if (typeof customQuizSession.onFinish === "function") {
          const cb = customQuizSession.onFinish;
          customQuizSession.onFinish = null;
          cb(true);
        }
      }, 200);
      return;
    }

    const q = customQuizSession.questions[idx];
    customQuizSession.phase = "ask";
    customQuizSession.mine = null;
    customQuizSession.phaseStart = Date.now();

    const askPacket = {
      t: "quiz",
      phase: "ask",
      i: idx,
      n: total,
      ask: 15000,
      show: 4000,
      start: customQuizSession.startTime,
      now: Date.now(),
      left: 15000,
      upcoming: Date.now() + 3600000,
      q: {
        text: q.text,
        opts: q.opts
      },
      score: { ...customQuizSession.score },
      mine: null
    };

    dispatchQuizPacketToClient(askPacket);
    setTimeout(decorateQuizSheetUI, 60);

    // Nếu bật chế độ Tự động giải (Auto-solve): tự chọn đáp án đúng sau 650ms
    if (customQuizSession.autoSolve) {
      customQuizSession.timer = setTimeout(() => {
        if (!customQuizSession.active || customQuizSession.phase !== "ask" || customQuizSession.idx !== idx) return;
        const optBtn = document.querySelector(`.sheet.quiz.open .quiz-opt[data-c="${q.right}"]:not([disabled])`);
        if (optBtn) {
          fireClick(optBtn);
        } else {
          handleCustomQuizAnswer(idx, q.right);
        }
      }, 650);
    } else {
      // Chế độ người chơi tự trả lời (15 giây mỗi câu)
      customQuizSession.timer = setTimeout(() => {
        if (!customQuizSession.active || customQuizSession.phase !== "ask" || customQuizSession.idx !== idx) return;
        showCustomQuizAnswerExplanation(idx, null);
      }, 15000);
    }
  }

  function handleCustomQuizAnswer(i, c) {
    if (!customQuizSession.active || customQuizSession.phase !== "ask" || i !== customQuizSession.idx) return;
    if (customQuizSession.mine !== null) return;
    clearTimeout(customQuizSession.timer);

    customQuizSession.mine = c;
    const q = customQuizSession.questions[i];
    const elapsed = Math.max(0, Date.now() - customQuizSession.phaseStart);
    const leftMs = Math.max(0, 15000 - elapsed);

    if (q && c === q.right) {
      customQuizSession.score.right++;
      customQuizSession.score.pts += Math.max(70, Math.round(100 + 50 * (leftMs / 15000)));
    }

    // Báo cho HP biết người chơi đã chọn đáp án c
    if (activeWs) {
      try {
        const gotEvt = new MessageEvent("message", {
          data: JSON.stringify({ t: "quiz-got", i, c })
        });
        if (typeof activeWs.onmessage === "function") {
          activeWs.onmessage(gotEvt);
        }
        activeWs.dispatchEvent(gotEvt);
      } catch {}
    }

    // Sau 400ms hiển thị ngay đáp án đúng & lời giải thích Phật pháp
    customQuizSession.timer = setTimeout(() => {
      showCustomQuizAnswerExplanation(i, c);
    }, 400);
  }

  function showCustomQuizAnswerExplanation(i, pickedChoice) {
    if (!customQuizSession.active || i !== customQuizSession.idx) return;
    clearTimeout(customQuizSession.timer);

    const q = customQuizSession.questions[i];
    const total = customQuizSession.questions.length;
    customQuizSession.phase = "show";
    const showDuration = customQuizSession.autoSolve ? 1050 : 3200;

    const showPacket = {
      t: "quiz",
      phase: "show",
      i,
      n: total,
      ask: 15000,
      show: showDuration,
      start: customQuizSession.startTime,
      now: Date.now(),
      left: showDuration,
      upcoming: Date.now() + 3600000,
      q: {
        text: q.text,
        opts: q.opts
      },
      right: q.right,
      why: q.why || "Mỗi câu hỏi là một dịp ôn lại lời Phật dạy.",
      mine: pickedChoice,
      score: { ...customQuizSession.score }
    };

    dispatchQuizPacketToClient(showPacket);
    setTimeout(decorateQuizSheetUI, 60);

    customQuizSession.timer = setTimeout(() => {
      advanceCustomQuizQuestion();
    }, showDuration);
  }

  function advanceCustomQuizQuestion() {
    if (!customQuizSession.active) return;
    clearTimeout(customQuizSession.timer);
    customQuizSession.idx++;
    sendCurrentCustomQuizQuestion();
  }

  async function openDoVuiModal() {
    let sheet = $(".sheet.quiz.open");
    if (!sheet) {
      clickMenu("dovui");
      sheet = await waitFor(() => $(".sheet.quiz.open"), 1500);
    }
    if (!sheet) {
      const pill = $(".pill.quiz-pill");
      if (pill) {
        pill.style.display = "";
        fireClick(pill);
        sheet = await waitFor(() => $(".sheet.quiz.open"), 1200);
      }
    }
    if (!sheet) {
      const existing = $(".sheet.quiz");
      if (existing) {
        existing.classList.add("open");
        sheet = existing;
      }
    }
    setTimeout(decorateQuizSheetUI, 100);
    log("🪷 Đã mở bảng Đố vui Phật pháp · Bạn có thể bấm [🎯 Tham gia (10 câu)] để thi ngay ngoài giờ!", "ok");
    return sheet;
  }

  async function triggerDirectDoVui(autoSolve = false, myRun = undefined) {
    log(`🪷 Chuẩn bị ${autoSolve ? "Tự động giải" : "Tham gia"} Đố vui Phật pháp (10 câu · Bỏ qua giới hạn 20:00)…`, "step");
    setStatus(`🪷 Đang mở Đố vui Phật pháp (${autoSolve ? "Tự giải 10/10" : "Tham gia 10 câu"})…`);

    // 1. Lấy câu hỏi mới nhất từ máy chủ chùa thông qua gói { t: "quiz-practice" }
    if (activeWs && activeWs.readyState === WebSocket.OPEN) {
      fetchingQuizQuestionsForLive = true;
      try {
        activeWs.send(JSON.stringify({ t: "quiz-practice" }));
        await sleep(160, myRun);
        activeWs.send(JSON.stringify({ t: "quiz-practice" }));
        await sleep(260, myRun);
      } catch {} finally {
        fetchingQuizQuestionsForLive = false;
      }
    }

    // 2. Mở bảng .sheet.quiz và đảm bảo đang ở chế độ Live (nếu đang ở màn hình Ôn bài thì bấm [data-live])
    const sheet = await openDoVuiModal();
    const backToLiveBtn = sheet ? sheet.querySelector("[data-live]") : null;
    if (backToLiveBtn) {
      fireClick(backToLiveBtn);
    }

    // 3. Nếu đúng 20:00 tối chùa đang mở phiên Đố vui thật (phase === "ask"):
    if (lastRealQuizData && lastRealQuizData.phase === "ask" && !lastRealQuizData._atdSimulated) {
      log("🪷 Đang trong giờ Đố vui Phật pháp trực tiếp của chùa (20:00) · Tham gia phiên thật để nhận công đức!", "ok");
      decorateQuizSheetUI();
      if (autoSolve) {
        for (let step = 0; step < 30; step++) {
          if (myRun != null && !checkRun(myRun)) break;
          if (!$(".sheet.quiz.open")) break;
          decorateQuizSheetUI();
          const hintBtn = $(".sheet.quiz.open .quiz-opt.atd-quiz-hint:not([disabled])") || $(".sheet.quiz.open .quiz-opt[data-c]:not([disabled])");
          if (hintBtn) {
            fireClick(hintBtn);
          }
          await sleep(1500, myRun);
        }
      }
      setStatus("Sẵn sàng · bấm Chạy để tự động thực hiện");
      return true;
    }

    // 4. Mở ngoài giờ (Bỏ qua giới hạn 20:00 giống Cưỡi Hạc trắng):
    // Chọn 10 câu hỏi Phật pháp từ kho câu hỏi của chùa
    const pool = [...cachedQuizQuestions];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected10 = pool.slice(0, 10);

    clearTimeout(customQuizSession.timer);
    let resolveDone = null;
    const donePromise = new Promise((r) => { resolveDone = r; });

    customQuizSession = {
      active: true,
      autoSolve: Boolean(autoSolve),
      questions: selected10,
      idx: 0,
      phase: "ask",
      score: { pts: 0, right: 0 },
      mine: null,
      timer: null,
      startTime: Date.now(),
      phaseStart: Date.now(),
      currentPacket: null,
      onFinish: resolveDone
    };

    log(`🪷 Bắt đầu phiên Đố vui Phật pháp 10 câu (${autoSolve ? "Chế độ Tự giải 10/10" : "Đã tô sáng gợi ý đáp án đúng trên mỗi câu"})!`, "ok");
    sendCurrentCustomQuizQuestion();

    if (autoSolve) {
      await Promise.race([donePromise, sleep(32000, myRun)]);
      setStatus("Sẵn sàng · bấm Chạy để tự động thực hiện");
    }
    return true;
  }

  async function runDoVui(myRun) {
    await closeAllModals(myRun);
    await triggerDirectDoVui(true, myRun);
    await sleep(600, myRun);
    fireClick($(".sheet.quiz.open .sheet-close"));
    await sleep(300, myRun);
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
    dovui: runDoVui,
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
            <div class="atd-swarm-role-box" id="atd-swarm-role-box">
              <div class="atd-role-header">
                <span>👑 <b>Vai trò Tab trong Swarm</b>:</span>
                <span class="atd-role-badge ${swarmRole}" id="atd-role-badge">
                  ${swarmRole === 'master' ? '👑 Chủ trì (Master)' : '🤝 Trợ lực (Follower)'}
                </span>
              </div>
              <div class="atd-role-selector">
                <button type="button" class="atd-role-chip ${swarmRole === 'master' ? 'active' : ''}" id="atd-role-btn-master" title="Đặt tab này làm Tab Chính (Nhạc trưởng). Khi tab này lạy, toàn bộ các tab khác sẽ lạy theo!">
                  👑 Tab Chủ trì (Master)
                </button>
                <button type="button" class="atd-role-chip ${swarmRole === 'follower' ? 'active' : ''}" id="atd-role-btn-follower" title="Đặt tab này làm Tab Trợ lực. Tab này sẽ túc trực ở Chánh điện và tuân lệnh lạy từ Tab Chủ trì!">
                  🤝 Tab Trợ lực (Follower)
                </button>
              </div>
              <div class="atd-swarm-status-bar" id="atd-swarm-status-bar"></div>
            </div>
            <div class="atd-clone-ctrl-box" id="atd-clone-ctrl-box">
              <div class="atd-clone-title">
                <span>👥 <b>Nhân bản Tab Trợ lực (Swarm 4 Clone)</b>:</span>
              </div>
              <div class="atd-clone-btns">
                <button type="button" class="atd-clone-btn highlight" id="atd-btn-add-4clones" title="Mở nhanh 4 tab Clone tự động vào Chánh điện túc trực lạy trợ lực">
                  🚀 Mở 4 Clone
                </button>
                <button type="button" class="atd-clone-btn" id="atd-btn-add-clone" title="Mở thêm 1 tab Clone mới">
                  👥 +1 Clone
                </button>
                <button type="button" class="atd-clone-btn lead" id="atd-btn-lead-bow" title="Phát lệnh 4 đệ tử lạy trước rồi Chủ trì lạy theo để gặt trọn công đức Đồng Tâm">
                  🙏 Phát động Lạy (Clones trước)
                </button>
              </div>
              <div class="atd-clone-mini-row">
                <span>Mở lẻ từng Tab:</span>
                <div class="atd-clone-mini-btns">
                  <button type="button" class="atd-clone-mini-btn" data-clone="1" title="Mở Tab Trợ lực [Đệ tử #1]">#1</button>
                  <button type="button" class="atd-clone-mini-btn" data-clone="2" title="Mở Tab Trợ lực [Đệ tử #2]">#2</button>
                  <button type="button" class="atd-clone-mini-btn" data-clone="3" title="Mở Tab Trợ lực [Đệ tử #3]">#3</button>
                  <button type="button" class="atd-clone-mini-btn" data-clone="4" title="Mở Tab Trợ lực [Đệ tử #4]">#4</button>
                </div>
              </div>
              <div class="atd-clone-tip">
                💡 <i>Mẹo Chrome:</i> Nếu chỉ mở 1 tab, hãy bấm biểu tượng 🚫 <b>"Cửa sổ bật lên bị chặn"</b> ở góc phải thanh địa chỉ (URL) ➔ chọn <b>"Luôn cho phép"</b>, hoặc bấm mở lẻ từng tab [#1, #2, #3, #4] ở trên nhé!
              </div>
            </div>
            <div class="atd-hac-quick-box atd-quiz-quick-box" id="atd-quiz-quick-box">
              <div class="atd-hac-title">
                <span>🪷 <b>Đố vui Phật pháp</b> (Bỏ qua lố giờ):</span>
              </div>
              <div class="atd-hac-btns">
                <button type="button" class="atd-hac-btn" id="atd-btn-quiz-open" title="Mở bảng Đố vui Phật pháp">
                  🪷 Đố vui
                </button>
                <button type="button" class="atd-hac-btn" id="atd-btn-quiz-join" title="Tham gia ngay phiên Đố vui Phật pháp 10 câu (Mở ngoài giờ 20:00, kèm gợi ý đáp án đúng)">
                  🎯 Tham gia
                </button>
                <button type="button" class="atd-hac-btn ghost" id="atd-btn-quiz-auto" title="Mở và tự động giải đúng 10/10 câu Đố vui Phật pháp">
                  🤖 Tự giải
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
            <div class="atd-today-actions" style="display:flex; gap:5px; align-items:center;">
              <button id="atd-btn-checkin" type="button" title="Mở lại bảng Quà điểm danh hằng ngày">🎁 Quà điểm danh</button>
              <button id="atd-refresh-today" type="button" title="Làm mới tiến độ">↻</button>
            </div>
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
      const quizBox = $("#atd-quiz-quick-box", panel);
      if (quizBox) {
        quizBox.style.display = (catId === "all" || catId === "tutap") ? "flex" : "none";
      }
      const hacBox = $("#atd-hac-quick-box", panel);
      if (hacBox) {
        hacBox.style.display = (catId === "all" || catId === "linhvat") ? "flex" : "none";
      }
      const cloneBox = $("#atd-clone-ctrl-box", panel);
      if (cloneBox) {
        cloneBox.style.display = (catId === "all" || catId === "huong") ? "flex" : "none";
      }
      const roleBox = $("#atd-swarm-role-box", panel);
      if (roleBox) {
        roleBox.style.display = (catId === "all" || catId === "huong") ? "flex" : "none";
      }
    }

    const btnQuizOpen = $("#atd-btn-quiz-open", panel);
    if (btnQuizOpen) {
      btnQuizOpen.addEventListener("click", () => openDoVuiModal());
    }
    const btnQuizJoin = $("#atd-btn-quiz-join", panel);
    if (btnQuizJoin) {
      btnQuizJoin.addEventListener("click", () => triggerDirectDoVui(false));
    }
    const btnQuizAuto = $("#atd-btn-quiz-auto", panel);
    if (btnQuizAuto) {
      btnQuizAuto.addEventListener("click", () => triggerDirectDoVui(true));
    }
    const btnHacTron = $("#atd-btn-hac-tron", panel);
    if (btnHacTron) {
      btnHacTron.addEventListener("click", () => triggerDirectCuoiHac("tron"));
    }
    const btnHacDua = $("#atd-btn-hac-dua", panel);
    if (btnHacDua) {
      btnHacDua.addEventListener("click", () => triggerDirectCuoiHac("dua"));
    }
    const btnAdd4Clones = $("#atd-btn-add-4clones", panel);
    if (btnAdd4Clones) {
      btnAdd4Clones.addEventListener("click", () => openMultipleClones(4));
    }
    const btnAddClone = $("#atd-btn-add-clone", panel);
    if (btnAddClone) {
      btnAddClone.addEventListener("click", () => openNewCloneTab());
    }
    $$(".atd-clone-mini-btn", panel).forEach((btn) => {
      btn.addEventListener("click", () => {
        const cId = Number(btn.dataset.clone);
        openNewCloneTab(cId);
      });
    });
    const btnLeadBow = $("#atd-btn-lead-bow", panel);
    if (btnLeadBow) {
      btnLeadBow.addEventListener("click", () => {
        if (swarmRole === "master") {
          executeMasterDongTamBow();
        } else {
          log("🤝 Tab Trợ lực: Đang thực hiện lạy...", "ok");
          triggerBowAction();
        }
      });
    }
    const btnRoleMaster = $("#atd-role-btn-master", panel);
    if (btnRoleMaster) {
      btnRoleMaster.addEventListener("click", () => setSwarmRole("master"));
    }
    const btnRoleFollower = $("#atd-role-btn-follower", panel);
    if (btnRoleFollower) {
      btnRoleFollower.addEventListener("click", () => setSwarmRole("follower"));
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

    $("#atd-btn-checkin", panel)?.addEventListener("click", () => {
      openDailyCheckin();
    });

    $("#atd-refresh-today", panel)?.addEventListener("click", () => {
      queryServerMerit();
      updateTodayStatsUI();
      log("Đã gửi yêu cầu đồng bộ tiến độ & ngưỡng từ máy chủ chùa.", "info");
    });

    updateTagUI();
    updateTodayStatsUI();
    updateSwarmInfoUI();
    setTimeout(queryServerMerit, 1500);

    if (isCloneTab) {
      enabledTasks.clear();
      enabledTasks.add("dongtam");
      loopMode = true;
      autoDongTam = true;
      minPeersToBow = 1;
      updateTagUI();
      log(`[Đệ tử #${currentCloneId}] Đã nhận diện Tab Clone. Đang đợi cổng chùa mở hoàn tất…`, "wait");

      const checkLoadedInterval = setInterval(() => {
        const loadingEl = document.getElementById("loading");
        const isLoaded = !loadingEl || loadingEl.classList.contains("done");
        if (isLoaded) {
          clearInterval(checkLoadedInterval);
          log(`[Đệ tử #${currentCloneId}] Cổng chùa đã mở! Tự động vào Chánh điện túc trực lạy trợ lực Chủ trì…`, "ok");
          setTimeout(() => {
            if (!running) {
              start();
            }
          }, 1500);
        }
      }, 500);

      // Timeout dự phòng tối đa 15s
      setTimeout(() => clearInterval(checkLoadedInterval), 15000);
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
