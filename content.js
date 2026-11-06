(() => {
  if (window.__ATD_AUTO_TASK_LOADED__) return;
  window.__ATD_AUTO_TASK_LOADED__ = true;

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
  let minPeersToBow = Number(localStorage.getItem("atd_dt_min") || "2");

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
        if (triggerBowAction()) {
          log(`[Đồng tâm Swarm] Nhận hiệu lệnh từ tab khác -> Đã lập tức lạy cùng!`, "ok");
        }
      }
    };
  }

  // Hook WebSocket để đón bắt các gói tin lạy của người chơi khác trong điện
  try {
    const origSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function(...args) {
      activeWs = this;
      try {
        const payload = typeof args[0] === "string" ? JSON.parse(args[0]) : null;
        if (payload) {
          if (payload.t === "visit" && payload.zone) {
            currentZone = payload.zone;
            lastKnownPlace = payload.zone;
          }
          if (payload.t === "emote" && payload.e === "lay") {
            lastOwnBowTime = Date.now();
            broadcastSwarmBow();
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
                      log(`✦ SÓNG LẠY ĐỒNG TÂM: Có ${count} người cùng lạy trong điện -> Lập tức lạy cùng để tối đa công đức!`, "ok");
                      if (triggerBowAction()) {
                        broadcastSwarmBow();
                        peerBowEvents = [];
                      }
                    } else {
                      log(`[Radar Đồng tâm] Đã có 1 người vừa lạy (${peerId}) · Chờ thêm người để gom sóng (mục tiêu ≥${minPeersToBow} người)…`, "wait");
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

  // Danh sách nhiệm vụ đầy đủ khớp với giao thức & kiểm tra trạng thái trong src.js
  const ALL_TASKS = [
    { id: "thoikhoa", label: "Thời khóa", once: true },
    { id: "tangkinh", label: "Tàng Kinh Các", once: true },
    { id: "incense", label: "Hương & Lạy", once: false },
    { id: "dongtam", label: "Lạy đồng tâm", once: false },
    { id: "qa_incense", label: "Hương Quan Âm", once: true },
    { id: "am_incense", label: "Hương Am riêng", once: true },
    { id: "bell", label: "Thỉnh chuông", once: true },
    { id: "lamp", label: "Thắp đèn", once: true },
    { id: "garden", label: "Vườn hoa & Dâng hoa", once: true },
    { id: "quet", label: "Quét lá", once: true },
    { id: "ca", label: "Phóng sinh", once: true },
    { id: "hoadang", label: "Hoa đăng", once: true },
    { id: "xinxam", label: "Xin xăm", once: true },
    { id: "linhthu", label: "Vườn Linh Thú", once: true },
    { id: "thaydo", label: "Xin chữ", once: true },
    { id: "mo", label: "Gõ mõ", once: false },
    { id: "beads", label: "Chuỗi hạt", once: false },
    { id: "claim", label: "Nhận thưởng", once: false }
  ];

  // Chỉ mục địa điểm trong mảng As của src.js (Menu -> Bản đồ)
  const PLACES = {
    CONG_TAM_QUAN: 0,
    SAN_CHUA: 1,
    CHANH_DIEN: 2,
    BAO_THAP: 3,
    HO_SEN: 4,
    VUON_THIEN: 5,
    GAC_CHUONG: 6,
    THAP_NGHI: 7,
    AM_RIENG: 8,
    PHAP_DUONG: 9,
    TANG_KINH_CAC: 10,
    THAY_DO: 11,
    GIENG_NGOC: 12,
    TUONG_DI_LAC: 13,
    DEN_NGUYET_LAO: 14,
    VUON_LINH_THU: 15,
    VUON_HOA: 16
  };

  const enabledTasks = new Set(ALL_TASKS.map((t) => t.id));
  const doneOnce = new Set();

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

    // 1. Chánh điện
    if (placeIdx === PLACES.CHANH_DIEN || pName.includes("chanh dien")) {
      if (findActionBtn("Lạy") && (findActionBtn("Thắp hương") || findActionBtn("Thắp đèn") || findActionBtn("Tụng kinh") || findActionBtn("Dâng hoa"))) {
        return true;
      }
      if (currentZone && norm(currentZone).includes("chanh dien")) return true;
    }

    // 2. Gác chuông
    if (placeIdx === PLACES.GAC_CHUONG || pName.includes("chuong")) {
      if (findActionBtn("Thỉnh chuông")) return true;
      if (currentZone && norm(currentZone).includes("chuong")) return true;
    }

    // 3. Vườn hoa
    if (placeIdx === PLACES.VUON_HOA || pName.includes("vuon hoa")) {
      if (findActionBtn("Luống hoa")) return true;
      if (currentZone && norm(currentZone).includes("vuon hoa")) return true;
    }

    // 4. Hồ sen · Cầu Duyên
    if (placeIdx === PLACES.HO_SEN || pName.includes("ho sen")) {
      if (findActionBtn("Thả hoa đăng") || findActionBtn("Xin xăm") || findActionBtn("Kết duyên")) return true;
      if (currentZone && norm(currentZone).includes("ho sen")) return true;
    }

    // 5. Vườn Linh Thú
    if (placeIdx === PLACES.VUON_LINH_THU || pName.includes("linh thu")) {
      if (findActionBtn("Linh thú")) return true;
      if (currentZone && norm(currentZone).includes("linh thu")) return true;
    }

    // 6. Bàn thầy đồ (Xin chữ)
    if (placeIdx === PLACES.THAY_DO || pName.includes("xin chu") || pName.includes("thay do")) {
      if (findActionBtn("Xin chữ")) return true;
    }

    // 7. Tàng Kinh Các
    if (placeIdx === PLACES.TANG_KINH_CAC || pName.includes("tang kinh")) {
      if (findActionBtn("Vào Tàng Kinh Các") || $(".lib.tk.open")) return true;
    }

    // 8. Am riêng
    if (placeIdx === PLACES.AM_RIENG || pName.includes("am")) {
      if (findActionBtn("Ra khỏi am")) return true;
      if (currentZone && norm(currentZone).includes("am rieng")) return true;
    }

    // 9. So khớp qua currentZone hoặc lastKnownPlace
    if (currentZone && pName && norm(currentZone) === pName) {
      return true;
    }
    if (lastKnownPlace && pName && norm(lastKnownPlace) === pName) {
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
    let target = $(`[data-place="${placeIdx}"]`, mapSheet);
    if (!target && placeName) {
      const pNorm = norm(placeName);
      target = $$("[data-place]", mapSheet).find((el) =>
        norm(el.textContent || el.getAttribute("title")).includes(pNorm)
      );
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

    const layBtn = findActionBtn("Lạy");
    if (layBtn && !layBtn.disabled) {
      fireClick(layBtn);
      broadcastSwarmBow();
      log("Lạy Phật tại Chánh điện ({ t: 'emote', e: 'lay' })…", "ok");
      await sleep(5800, myRun);
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
      log(`Chế độ Túc trực Chánh điện: Đang canh sóng lạy đông người (mục tiêu ≥${minPeersToBow} người lạy cùng lúc)…`, "ok");
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

        // Tự động lạy 1 nhịp sau mỗi 60 giây nếu chưa có sóng đông người (để vừa tích công đức vừa phát sóng Swarm)
        if (waitSeconds >= 60) {
          log("Túc trực 60s: Thực hiện 1 nhịp lạy trang nghiêm & phát sóng Swarm…", "info");
          triggerBowAction();
          broadcastSwarmBow();
          await sleep(5800, myRun);
          waitSeconds = 0;
        }
      }
      return true;
    }

    log("Chánh điện: Bật radar lắng nghe nhịp lạy đồng tâm từ người khác & Swarm…", "ok");
    const prevBow = lastPeerBowTime;
    const startWait = Date.now();
    let caught = false;

    // Chờ tối đa 8 giây xem có ai trong điện lạy không để bắt nhịp ké
    while (Date.now() - startWait < 8000) {
      if (!checkRun(myRun)) return false;
      if (lastPeerBowTime > prevBow) {
        caught = true;
        break;
      }
      await sleep(400, myRun);
    }

    if (!caught) {
      log("Chưa có ai lạy trước · Chủ động phát nhịp Lạy & hiệu lệnh Swarm…", "wait");
      triggerBowAction();
      broadcastSwarmBow();
    }

    // Chờ trọn 1 nhịp lạy (5.6s)
    await sleep(5800, myRun);

    // Tam bái (3 lạy liên tiếp) để tăng tối đa cơ hội khớp nhịp đồng tâm với nhiều người
    for (let bai = 2; bai <= 3; bai++) {
      if (!checkRun(myRun)) return false;
      log(`Thực hiện tiếp nhịp lạy trang nghiêm #${bai}/3…`, "ok");
      triggerBowAction();
      broadcastSwarmBow();
      await sleep(5800, myRun);
    }

    log("Hoàn tất chuỗi Tam bái đồng tâm.", "ok");
    return true;
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

  // 13. Vườn Linh Thú: Cho thú ăn ({ t: "emote", e: "gieo" }, { t: "pet-feed" })
  async function runLinhThu(myRun) {
    const ok = await teleportToPlace(PLACES.VUON_LINH_THU, "Vườn Linh Thú", myRun);
    if (!ok) return false;

    const feedBtn = await waitFor(() => findActionBtn("Cho ăn"), 2000, myRun);
    if (feedBtn) {
      fireClick(feedBtn);
      log("Đã rắc hạt cho linh thú ăn tại Vườn Linh Thú.", "ok");
      await sleep(1600, myRun);
    }
    return true;
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
    incense: runIncenseChanhDien,
    dongtam: runDongTam,
    qa_incense: runQaIncense,
    am_incense: runAmIncense,
    bell: runBell,
    lamp: runLamp,
    garden: runGarden,
    quet: runQuetLa,
    ca: runPhongSinh,
    hoadang: runHoaDang,
    xinxam: runXinXam,
    linhthu: runLinhThu,
    thaydo: runThayDo,
    mo: runMo,
    beads: runBeads,
    claim: runClaim
  };

  function updateTagUI() {
    for (const t of ALL_TASKS) {
      const el = $(`#atd-panel [data-task="${t.id}"]`);
      if (!el) continue;
      el.classList.toggle("on", enabledTasks.has(t.id));
      el.classList.toggle("done", doneOnce.has(t.id));
    }
    const countEl = $("#atd-task-count");
    if (countEl) {
      countEl.textContent = `(${enabledTasks.size}/${ALL_TASKS.length})`;
    }
  }

  async function mainLoop(myRun) {
    let cycle = 1;
    try {
      while (running && myRun === runId) {
        const activeList = ALL_TASKS.filter(
          (t) => enabledTasks.has(t.id) && !(cycle > 1 && t.once && doneOnce.has(t.id))
        );

        if (activeList.length === 0) {
          stop("Đã hoàn tất toàn bộ tác vụ đã chọn.");
          return;
        }

        log(`=== Bắt đầu chu kỳ #${cycle} (${activeList.length} tác vụ) ===`, "info");

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
              updateTagUI();
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
    updateTagUI();
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
            <strong>An Tự Duyên · Auto 2.0</strong>
            <small>Tự động di chuyển & làm trọn nhiệm vụ</small>
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
              <button id="atd-all" type="button">Tất cả</button>
              <button id="atd-farm" type="button">Chỉ Mõ/Hạt</button>
            </div>
          </div>
          <div class="atd-tags">
            ${ALL_TASKS.map(
              (t) =>
                `<button type="button" class="atd-tag on" data-task="${t.id}" title="${t.once ? "Chạy 1 lần rồi bỏ qua ở các vòng lặp sau" : "Lặp lại mỗi chu kỳ"}">${t.label}</button>`
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
            <div class="atd-mini-row" style="display:flex;align-items:center;justify-content:space-between;margin-top:7px;padding:2px 0 1px;">
              <span style="font-size:11px;color:#d8d3c8;">Canh lạy cùng lúc:</span>
              <div class="atd-mini-btns" id="atd-dongtam-targets">
                <button type="button" class="atd-dt-opt ${minPeersToBow === 1 ? 'on' : ''}" data-target="1" title="Có bất kỳ ai lạy là lạy theo ngay">≥1 người</button>
                <button type="button" class="atd-dt-opt ${minPeersToBow === 2 ? 'on' : ''}" data-target="2" title="Chờ từ 2 người trở lên lạy cùng lúc để tối đa công đức">≥2 người</button>
                <button type="button" class="atd-dt-opt ${minPeersToBow >= 3 ? 'on' : ''}" data-target="3" title="Chờ đám đông từ 3 người lạy cùng lúc">≥3 người</button>
              </div>
            </div>
          </div>
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

    $$(".atd-dt-opt", panel).forEach((btn) => {
      btn.addEventListener("click", () => {
        const val = Number(btn.dataset.target || "2");
        minPeersToBow = val;
        try { localStorage.setItem("atd_dt_min", String(val)); } catch {}
        $$(".atd-dt-opt", panel).forEach((b) => b.classList.toggle("on", b === btn));
        log(`Mục tiêu Lạy đồng tâm: Chờ sóng từ ≥${val} người lạy cùng lúc.`, "ok");
      });
    });

    $("#atd-all", panel).addEventListener("click", () => {
      ALL_TASKS.forEach((t) => enabledTasks.add(t.id));
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
    });

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
