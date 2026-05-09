(function () {
  const SITE = "codeforces";
  const WIDGET_HOST_ID = "rehash-cf-timer-host";
  const MODAL_HOST_ID = "rehash-cf-modal-host";
  const ACTIVE_KEY = "rehash_active_codeforces_timer";
  const STRIVER_BANNER_ID = "rehash-cf-striver-banner";
  const PERSIST_MS = 30000;

  const state = {
    acceptedHandled: false,
    currentInfo: null,
    currentStriverEntry: null,
    dragSession: null,
    elapsed: 0,
    intervalId: null,
    justDragged: false,
    modalShown: false,
    observer: null,
    paused: false,
    persistId: null,
    running: false,
    startWallTime: null,
  };

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_problem") {
      sendResponse(extractProblem());
    }
    return true;
  });

  initialize().catch(() => {});

  async function initialize() {
    if (!document.body || !isProblemPage()) return;

    state.currentStriverEntry = findStriverEntryForCurrentPage();
    injectWidget();
    updateWidgetProblem(extractProblem());
    await refreshProblemInfo();
    renderStriverBannerWithRetry();
    restoreTimerState();
    setupAcceptedObserver();
    window.addEventListener("beforeunload", persistTimerState);
    document.addEventListener("visibilitychange", () => {
      persistTimerState();
      if (!document.hidden) {
        restoreTimerState();
      }
    });
    startPeriodicPersistence();
  }

  function extractProblem() {
    const striverEntry = state.currentStriverEntry || findStriverEntryForCurrentPage();
    return {
      title: extractTitle(),
      url: normalizeProblemUrl(window.location.href),
      site: SITE,
      difficulty: extractDifficulty(),
      tags: extractTags(),
      striverId: striverEntry?.id || null,
      striverStep: striverEntry?.step || null,
      striverTopic: striverEntry?.topic || null,
    };
  }

  function extractTitle() {
    const selectors = [".problem-statement .title", ".title", "div.header .title"];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const text = element?.textContent?.trim();
      if (text) return text;
    }
    return document.title.split(" - ")[0].trim() || "Unknown problem";
  }

  function extractTags() {
    const tags = [];
    document.querySelectorAll(".problem-statement .tag-box, .tag-box, a[href*=\"/problemset?tags=\"]").forEach((el) => {
      const text = el.textContent.trim();
      if (text && !text.startsWith("*") && !tags.includes(text)) tags.push(text);
    });
    return tags.slice(0, 10);
  }

  function extractDifficulty() {
    for (const box of document.querySelectorAll(".tag-box")) {
      const match = `${box.textContent || ""} ${box.getAttribute("title") || ""}`.match(/\*\s*(\d{3,4})/);
      if (match) return match[1];
    }
    return "Unknown";
  }

  function injectWidget() {
    if (document.getElementById(WIDGET_HOST_ID)) return;

    const host = document.createElement("div");
    host.id = WIDGET_HOST_ID;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{all:initial}
        .rh-shell{width:220px;min-height:148px;background:#0f0f1a;color:#e2e8f0;border:1px solid rgba(255,255,255,.08);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1.35;overflow:visible;transition:all .25s cubic-bezier(.4,0,.2,1)}
        .rh-shell.collapsed{width:48px;min-height:48px;border-radius:50%}
        .rh-panel{display:grid;gap:8px;padding:10px}.rh-shell.collapsed .rh-panel{display:none}
        .rh-fab{display:none;width:48px;height:48px;border:0;border-radius:50%;background:#0f0f1a;color:#f59e0b;align-items:center;justify-content:center;cursor:grab;padding:0}.rh-shell.collapsed .rh-fab{display:flex}.rh-fab:active,.rh-header.dragging{cursor:grabbing}
        .rh-shell.running.collapsed .rh-fab{animation:pulse-ring 1.8s infinite}
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(245,158,11,.4)}70%{box-shadow:0 0 0 8px rgba(245,158,11,0)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}
        .rh-header{display:flex;align-items:center;gap:6px;cursor:grab;min-width:0}.rh-brand{display:flex;align-items:center;gap:5px;font-weight:800;color:#f8fafc;white-space:nowrap}.rh-title{min-width:0;flex:1;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .rh-collapse,.rh-icon-btn{width:28px;height:28px;border:0;border-radius:10px;background:rgba(255,255,255,.06);color:#e2e8f0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}.rh-collapse:hover,.rh-icon-btn:hover:not(:disabled){background:rgba(255,255,255,.12)}
        .rh-solve-info{color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rh-time{font-family:'JetBrains Mono','SFMono-Regular',Consolas,monospace;font-size:30px;font-weight:800;line-height:1;text-align:center;color:#f59e0b;letter-spacing:.02em}.rh-time.paused{color:#fbbf24}
        .rh-controls{display:flex;justify-content:center;gap:10px}.rh-icon-btn:disabled{opacity:.38;cursor:default}.rh-icon{width:15px;height:15px;display:block}.rh-fab .rh-icon{width:22px;height:22px}
        [data-tooltip]{position:relative}[data-tooltip]::after{content:attr(data-tooltip);position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);background:#1a1a2e;color:#e2e8f0;padding:3px 8px;border-radius:4px;font-size:11px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}[data-tooltip]:hover::after{opacity:1}
      </style>
      <div class="rh-shell" id="rh-shell">
        <button class="rh-fab" id="rh-fab" type="button" aria-label="Open ReHash" data-tooltip="Open ReHash">${iconSvg("hash")}</button>
        <div class="rh-panel">
          <div class="rh-header" id="rh-drag-handle">
            <div class="rh-brand">${iconSvg("clock")}<span>ReHash</span></div>
            <div class="rh-title" id="rh-title">Loading problem...</div>
            <button class="rh-collapse" id="rh-collapse" type="button" aria-label="Collapse ReHash" data-tooltip="Collapse">${iconSvg("minus")}</button>
          </div>
          <div class="rh-solve-info" id="rh-solve-info">Solve 1 of this problem</div>
          <div class="rh-time" id="rh-time">00:00</div>
          <div class="rh-controls">
            <button class="rh-icon-btn" id="rh-start" type="button" aria-label="Start" data-tooltip="Start">${iconSvg("play")}</button>
            <button class="rh-icon-btn" id="rh-pause" type="button" aria-label="Pause" data-tooltip="Pause" disabled>${iconSvg("pause")}</button>
            <button class="rh-icon-btn" id="rh-done" type="button" aria-label="Done" data-tooltip="Done">${iconSvg("check")}</button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    initializeWidgetFrame(host, shadow);
    shadow.getElementById("rh-start").addEventListener("click", startTimer);
    shadow.getElementById("rh-pause").addEventListener("click", togglePause);
    shadow.getElementById("rh-done").addEventListener("click", () => stopTimerAndOpenModal());
    shadow.getElementById("rh-collapse").addEventListener("click", () => setWidgetCollapsed(true));
  }

  function updateWidgetProblem(problem) {
    const shadow = document.getElementById(WIDGET_HOST_ID)?.shadowRoot;
    const title = shadow?.getElementById("rh-title");
    if (title) title.textContent = problem.title || "Unknown problem";
  }

  async function refreshProblemInfo() {
    const problem = extractProblem();
    const response = await sendRuntimeMessage({ type: "GET_PROBLEM_INFO", url: problem.url, title: problem.title, site: SITE });
    state.currentInfo = response?.ok ? response : { history: [], totalSolves: 0, nextIteration: 1 };
    renderSolveInfo();
  }

  function renderSolveInfo() {
    const info = document.getElementById(WIDGET_HOST_ID)?.shadowRoot?.getElementById("rh-solve-info");
    if (info) info.textContent = `Solve ${state.currentInfo?.nextIteration || 1} of this problem`;
  }

  function initializeWidgetFrame(host, shadow) {
    const collapsed = readWidgetCollapsed();
    applyWidgetCollapsed(collapsed);
    restoreWidgetPosition(host, collapsed);
    initializeWidgetDragging(host, shadow.getElementById("rh-drag-handle"));
    initializeWidgetDragging(host, shadow.getElementById("rh-fab"));
    shadow.getElementById("rh-fab").addEventListener("click", () => {
      if (state.justDragged) {
        state.justDragged = false;
        return;
      }
      setWidgetCollapsed(false);
    });
    window.addEventListener("resize", () => clampAndPersistWidgetPosition(host));
  }

  function setWidgetCollapsed(collapsed) {
    sessionStorage.setItem(getCollapsedKey(), collapsed ? "1" : "0");
    applyWidgetCollapsed(collapsed);
    const host = document.getElementById(WIDGET_HOST_ID);
    if (host && !readWidgetPosition()) {
      applyDefaultWidgetPosition(host, collapsed);
    }
    if (host) clampAndPersistWidgetPosition(host);
  }

  function applyWidgetCollapsed(collapsed) {
    const shell = document.getElementById(WIDGET_HOST_ID)?.shadowRoot?.getElementById("rh-shell");
    if (!shell) return;
    shell.classList.toggle("collapsed", collapsed);
    updateWidgetRunningClass();
  }

  function readWidgetCollapsed() {
    const value = sessionStorage.getItem(getCollapsedKey());
    return value === null ? true : value === "1";
  }

  function initializeWidgetDragging(host, handle) {
    if (!handle) return;
    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (handle.id !== "rh-fab" && event.target.closest?.("button")) return;
      const rect = host.getBoundingClientRect();
      const drag = {
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        moved: false,
      };
      state.dragSession = drag;
      handle.classList.add("dragging");
      event.preventDefault();

      const onMove = (moveEvent) => {
        if (!state.dragSession) return;
        drag.moved = drag.moved || Math.abs(moveEvent.clientX - event.clientX) > 3 || Math.abs(moveEvent.clientY - event.clientY) > 3;
        const size = getWidgetSize(host);
        const x = clamp(moveEvent.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - size.width - 8));
        const y = clamp(moveEvent.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - size.height - 8));
        host.style.left = `${x}px`;
        host.style.top = `${y}px`;
        host.style.right = "auto";
        host.style.bottom = "auto";
      };

      const onUp = () => {
        handle.classList.remove("dragging");
        state.justDragged = Boolean(drag.moved);
        state.dragSession = null;
        persistWidgetPosition(host);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        window.setTimeout(() => {
          state.justDragged = false;
        }, 0);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function restoreWidgetPosition(host, collapsed) {
    const saved = readWidgetPosition();
    if (saved) {
      host.style.left = `${saved.x}px`;
      host.style.top = `${saved.y}px`;
      host.style.right = "auto";
      host.style.bottom = "auto";
      clampAndPersistWidgetPosition(host);
      return;
    }
    applyDefaultWidgetPosition(host, collapsed);
  }

  function applyDefaultWidgetPosition(host, collapsed) {
    const width = collapsed ? 48 : 220;
    const height = collapsed ? 48 : 160;
    const x = collapsed ? window.innerWidth - 68 : window.innerWidth - 240;
    const y = collapsed ? window.innerHeight - 68 : 80;
    host.style.left = `${clamp(x, 8, Math.max(8, window.innerWidth - width - 8))}px`;
    host.style.top = `${clamp(y, 8, Math.max(8, window.innerHeight - height - 8))}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }

  function clampAndPersistWidgetPosition(host) {
    const size = getWidgetSize(host);
    const currentX = parseFloat(host.style.left || "0");
    const currentY = parseFloat(host.style.top || "0");
    host.style.left = `${clamp(currentX, 8, Math.max(8, window.innerWidth - size.width - 8))}px`;
    host.style.top = `${clamp(currentY, 8, Math.max(8, window.innerHeight - size.height - 8))}px`;
    persistWidgetPosition(host);
  }

  function persistWidgetPosition(host) {
    const x = Math.round(parseFloat(host.style.left || "0"));
    const y = Math.round(parseFloat(host.style.top || "0"));
    if (Number.isFinite(x) && Number.isFinite(y)) {
      sessionStorage.setItem(getPositionKey(), JSON.stringify({ x, y }));
    }
  }

  function readWidgetPosition() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(getPositionKey()) || "null");
      if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
    } catch {}
    return null;
  }

  function getWidgetSize(host) {
    const rect = host.getBoundingClientRect();
    return {
      width: Math.max(48, rect.width || (readWidgetCollapsed() ? 48 : 220)),
      height: Math.max(48, rect.height || (readWidgetCollapsed() ? 48 : 160)),
    };
  }

  function updateWidgetRunningClass() {
    const shell = document.getElementById(WIDGET_HOST_ID)?.shadowRoot?.getElementById("rh-shell");
    if (shell) shell.classList.toggle("running", state.running && !state.paused);
  }

  function startTimer() {
    const problem = extractProblem();
    updateWidgetProblem(problem);
    state.acceptedHandled = false;
    state.elapsed = 0;
    state.running = true;
    state.paused = false;
    state.startWallTime = Date.now();
    persistTimerState();
    startTick();
    updateControls();
  }

  function togglePause() {
    if (!state.running && !state.paused) return;
    if (state.paused) {
      state.running = true;
      state.paused = false;
      state.startWallTime = Date.now();
      startTick();
    } else {
      recomputeElapsedFromWallTime();
      state.running = false;
      state.paused = true;
      stopTick();
    }
    persistTimerState();
    updateTimerUi();
    updateControls();
  }

  function startTick() {
    stopTick();
    updateTimerUi();
    state.intervalId = window.setInterval(updateTimerUi, 1000);
  }

  function stopTick() {
    if (state.intervalId) {
      window.clearInterval(state.intervalId);
      state.intervalId = null;
    }
  }

  function updateTimerUi() {
    const display = document.getElementById(WIDGET_HOST_ID)?.shadowRoot?.getElementById("rh-time");
    if (!display) return;
    display.textContent = formatTimer(getDisplayElapsed());
    display.classList.toggle("paused", state.paused);
    updateWidgetRunningClass();
  }

  function updateControls() {
    const shadow = document.getElementById(WIDGET_HOST_ID)?.shadowRoot;
    const start = shadow?.getElementById("rh-start");
    const pause = shadow?.getElementById("rh-pause");
    if (!start || !pause) return;
    start.disabled = state.running || state.paused || state.elapsed > 0;
    pause.disabled = !state.running && !state.paused;
    pause.innerHTML = state.paused ? iconSvg("play") : iconSvg("pause");
    pause.dataset.tooltip = state.paused ? "Resume" : "Pause";
    pause.setAttribute("aria-label", state.paused ? "Resume" : "Pause");
    updateWidgetRunningClass();
  }

  function getDisplayElapsed() {
    if (state.running && !state.paused && Number.isFinite(state.startWallTime)) {
      return state.elapsed + Math.floor((Date.now() - state.startWallTime) / 1000);
    }
    return state.elapsed;
  }

  function recomputeElapsedFromWallTime() {
    if (state.running && !state.paused && Number.isFinite(state.startWallTime)) {
      state.elapsed += Math.floor((Date.now() - state.startWallTime) / 1000);
      state.startWallTime = Date.now();
    }
  }

  function persistTimerState() {
    recomputeElapsedFromWallTime();
    const problem = extractProblem();
    const record = {
      elapsed: state.elapsed,
      running: state.running,
      paused: state.paused,
      startWallTime: Date.now(),
      problem,
    };
    sessionStorage.setItem(getTimerKey(problem.url), JSON.stringify(record));
    sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ url: problem.url, title: problem.title, site: SITE }));
  }

  function restoreTimerState() {
    const problem = extractProblem();
    const saved = readTimerState(problem.url);
    if (!saved) {
      updateTimerUi();
      updateControls();
      return;
    }
    state.elapsed = Math.max(0, Number(saved.elapsed) || 0);
    state.running = Boolean(saved.running);
    state.paused = Boolean(saved.paused);
    state.startWallTime = Date.now();
    if (state.running && !state.paused && Number.isFinite(saved.startWallTime)) {
      state.elapsed += Math.floor((Date.now() - saved.startWallTime) / 1000);
      persistTimerState();
      startTick();
    } else {
      stopTick();
    }
    updateTimerUi();
    updateControls();
  }

  function readTimerState(url) {
    try {
      return JSON.parse(sessionStorage.getItem(getTimerKey(url)) || "null");
    } catch {
      return null;
    }
  }

  function startPeriodicPersistence() {
    if (state.persistId) window.clearInterval(state.persistId);
    state.persistId = window.setInterval(persistTimerState, PERSIST_MS);
  }

  async function stopTimerAndOpenModal() {
    recomputeElapsedFromWallTime();
    state.running = false;
    state.paused = true;
    stopTick();
    persistTimerState();
    updateTimerUi();
    updateControls();
    await openSolvedModal(extractProblem(), state.elapsed);
  }

  function setupAcceptedObserver() {
    if (state.observer || !document.body) return;
    state.observer = new MutationObserver((mutations) => {
      if (state.acceptedHandled) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && nodeMatchesAcceptedVerdict(node)) {
            state.acceptedHandled = true;
            void stopTimerAndOpenModal();
            triggerAutoReview();
            return;
          }
        }
      }
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function nodeMatchesAcceptedVerdict(node) {
    const text = node.textContent || "";
    return Boolean(node.matches?.(".verdict-accepted")) || /\baccepted\b/i.test(text);
  }

  async function triggerAutoReview() {
    const settings = await sendRuntimeMessage({ action: "get_settings" });
    if (settings?.autoReviewOnAccept !== false) {
      const problem = extractProblem();
      window.setTimeout(() => window.ReHashReviewPanel?.trigger(SITE, problem.title, problem.url), 1500);
    }
  }

  async function openSolvedModal(problem, elapsedSecs) {
    if (state.modalShown || document.getElementById(MODAL_HOST_ID)) return;
    state.modalShown = true;
    await refreshProblemInfo();
    const info = state.currentInfo || { history: [], nextIteration: 1 };
    const bucketDays = await getBucketDays();
    const host = document.createElement("div");
    host.id = MODAL_HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = modalHtml(problem, elapsedSecs, info.history || [], bucketDays);
    document.documentElement.appendChild(host);

    shadow.getElementById("rh-close").addEventListener("click", closeSolvedModal);
    shadow.querySelectorAll("[data-bucket]").forEach((button) => {
      button.addEventListener("click", () => {
        shadow.querySelectorAll("[data-bucket]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
      });
    });
    shadow.getElementById("rh-save").addEventListener("click", async () => {
      const active = shadow.querySelector("[data-bucket].active");
      const markCompleted = active?.dataset.bucket === "done";
      const nextBucketDays = markCompleted ? null : parseInt(active?.dataset.bucket || bucketDays[0], 10);
      const response = await sendRuntimeMessage({
        type: "SAVE_SESSION",
        session: {
          problemId: info.problem?.id || makeProblemId(problem),
          problemTitle: problem.title,
          problemUrl: problem.url,
          url: problem.url,
          striverId: problem.striverId,
          iteration: info.nextIteration || 1,
          timeSecs: elapsedSecs,
          timeTaken: elapsedSecs,
          approach: shadow.getElementById("rh-approach").value.trim(),
          mistakes: shadow.getElementById("rh-mistakes").value.trim(),
          tags: problem.tags,
          site: SITE,
          difficulty: problem.difficulty,
          nextBucketDays,
          markCompleted,
        },
      });
      if (response?.ok || response?.success) {
        sessionStorage.removeItem(getTimerKey(problem.url));
        state.elapsed = 0;
        state.running = false;
        state.paused = false;
        state.startWallTime = null;
        updateTimerUi();
        updateControls();
        await refreshProblemInfo();
        closeSolvedModal();
      }
    });
  }

  function modalHtml(problem, elapsedSecs, history, bucketDays) {
    return `
      <style>
        .rh-overlay{position:fixed;inset:0;background:rgba(0,0,0,.62);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}.rh-modal{width:min(640px,100%);max-height:88vh;overflow:auto;background:#1e1e2e;color:#cdd6f4;border:1px solid rgba(203,166,247,.25);border-radius:8px;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.rh-heading{font-size:22px;font-weight:800;margin-bottom:4px}.rh-sub{color:#a6adc8;margin-bottom:14px}.rh-section{background:#181825;border:1px solid rgba(205,214,244,.12);border-radius:8px;padding:12px;margin-bottom:12px}.rh-history{display:grid;gap:8px}.rh-row{display:flex;justify-content:space-between;gap:12px}.rh-green{color:#a6e3a1}.rh-red{color:#f38ba8}.rh-field{width:100%;box-sizing:border-box;background:#11111b;color:#cdd6f4;border:1px solid #45475a;border-radius:8px;padding:10px;font:inherit;margin-top:6px;resize:vertical}.rh-label{display:block;margin-bottom:10px}.rh-buckets{display:flex;gap:8px;flex-wrap:wrap}.rh-chip{border:1px solid #45475a;background:#313244;color:#cdd6f4;border-radius:8px;padding:9px 12px;cursor:pointer}.rh-chip.active{border-color:#cba6f7;color:#11111b;background:#cba6f7}.rh-actions{display:flex;justify-content:flex-end;gap:10px}.rh-btn{border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.rh-save{background:#a6e3a1;color:#11111b}.rh-close{background:#313244;color:#cdd6f4}
      </style>
      <div class="rh-overlay"><div class="rh-modal">
        <div class="rh-heading">Save solve session</div>
        <div class="rh-sub">${escapeHtml(problem.title)} · ${escapeHtml(formatDuration(elapsedSecs))}</div>
        <div class="rh-section"><strong>Previous solve history</strong><div class="rh-history">${renderHistory(history)}</div></div>
        <div class="rh-section">
          <label class="rh-label" for="rh-approach">What approach / technique did you use?<textarea id="rh-approach" class="rh-field" rows="3"></textarea></label>
          <label class="rh-label" for="rh-mistakes">What tripped you up? Mistakes / gotchas<textarea id="rh-mistakes" class="rh-field" rows="3"></textarea></label>
        </div>
        <div class="rh-section"><strong>Next review</strong><div class="rh-buckets">${bucketDays.map((days, index) => `<button class="rh-chip ${index === 0 ? "active" : ""}" data-bucket="${days}" type="button">${days} days</button>`).join("")}<button class="rh-chip" data-bucket="done" type="button">Done ✓</button></div></div>
        <div class="rh-actions"><button class="rh-btn rh-close" id="rh-close" type="button">Close</button><button class="rh-btn rh-save" id="rh-save" type="button">Save</button></div>
      </div></div>`;
  }

  function renderHistory(history) {
    if (!history.length) return '<div class="rh-row"><span>No previous solves.</span></div>';
    return history.map((session, index) => {
      const current = getSessionSeconds(session);
      const previous = index > 0 ? getSessionSeconds(history[index - 1]) : null;
      const delta = previous === null ? "" : renderDelta(previous - current);
      return `<div class="rh-row"><span>Solve ${escapeHtml(session.iteration || index + 1)}</span><span>${escapeHtml(formatDuration(current))} ${delta}</span></div>`;
    }).join("");
  }

  function renderDelta(deltaSecs) {
    if (deltaSecs === 0) return "";
    const label = formatDuration(Math.abs(deltaSecs));
    return deltaSecs > 0 ? `<span class="rh-green">▼ ${label} faster</span>` : `<span class="rh-red">▲ ${label} slower</span>`;
  }

  function closeSolvedModal() {
    document.getElementById(MODAL_HOST_ID)?.remove();
    state.modalShown = false;
  }

  async function getBucketDays() {
    const settings = await sendRuntimeMessage({ action: "get_settings" });
    return Array.isArray(settings?.bucketDays) && settings.bucketDays.length ? settings.bucketDays : [2, 5, 10];
  }

  function findStriverEntryForCurrentPage() {
    return window.STRIVER_SHEET_UTILS?.findByProblemUrl?.(normalizeProblemUrl(window.location.href)) || null;
  }

  function renderStriverBannerWithRetry(attempt = 0) {
    if (!state.currentStriverEntry) return;
    const titleElement = document.querySelector(".problem-statement .title") || document.querySelector(".title");
    if (!titleElement) {
      if (attempt < 12) window.setTimeout(() => renderStriverBannerWithRetry(attempt + 1), 400);
      return;
    }
    document.getElementById(STRIVER_BANNER_ID)?.remove();
    const banner = document.createElement("div");
    banner.id = STRIVER_BANNER_ID;
    banner.style.cssText = "margin-top:8px;padding:8px 12px;border-radius:8px;background:rgba(203,166,247,.12);border:1px solid rgba(203,166,247,.25);font-size:13px;";
    banner.innerHTML = `<strong>Striver A2Z</strong> <span>${escapeHtml(state.currentStriverEntry.step)} - ${escapeHtml(state.currentStriverEntry.topic)}</span>`;
    titleElement.insertAdjacentElement("afterend", banner);
  }

  function isProblemPage() {
    return /^https:\/\/codeforces\.com\/problemset\/problem\/\d+\/[A-Za-z0-9]+/.test(location.href) || /^https:\/\/codeforces\.com\/contest\/\d+\/problem\/[A-Za-z0-9]+/.test(location.href);
  }

  function normalizeProblemUrl(url) {
    return window.STRIVER_SHEET_UTILS?.normalizeProblemUrl ? window.STRIVER_SHEET_UTILS.normalizeProblemUrl(url) : normalizeProblemUrlFallback(url);
  }

  function normalizeProblemUrlFallback(url) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/\/+$/, "");
      return `${parsed.origin}${path}`;
    } catch {
      return url;
    }
  }

  function getTimerKey(url) {
    return `rehash_timer_state::${SITE}::${slugFromUrl(url)}`;
  }

  function getCollapsedKey() {
    return `rehash_collapsed_${slugFromUrl(extractProblem().url)}`;
  }

  function getPositionKey() {
    return `rehash_pos_${slugFromUrl(extractProblem().url)}`;
  }

  function slugFromUrl(url) {
    try {
      return new URL(url).pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9_-]+/gi, "_");
    } catch {
      return String(url).replace(/[^a-z0-9_-]+/gi, "_");
    }
  }

  function makeProblemId(problem) {
    return `${SITE}|${new URL(problem.url).pathname.replace(/\/+$/, "")}`;
  }

  function getSessionSeconds(session) {
    if (Number.isFinite(session.timeSecs)) return session.timeSecs;
    if (Number.isFinite(session.timeTaken)) return session.timeTaken;
    if (Number.isFinite(session.timeTakenMs)) return Math.round(session.timeTakenMs / 1000);
    return 0;
  }

  function formatTimer(totalSecs) {
    const minutes = Math.floor(totalSecs / 60);
    const seconds = totalSecs % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function formatDuration(totalSecs) {
    const minutes = Math.floor(totalSecs / 60);
    const seconds = totalSecs % 60;
    return `${minutes}m ${seconds}s`;
  }

  function iconSvg(name) {
    const icons = {
      hash: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/></svg>',
      clock: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      play: '<svg class="rh-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
      pause: '<svg class="rh-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
      check: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
      minus: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 12h12"/></svg>',
    };
    return icons[name] || icons.hash;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response)));
  }
})();
