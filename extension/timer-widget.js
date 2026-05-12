// Session storage keys introduced here, scoped by slug:
// rehash_timer_mode_{slug}: "stopwatch" | "countdown"
// rehash_timer_cd_{slug}: countdown duration in seconds
(function () {
  const PERSIST_MS = 30000;

  function createTimerWidget(slug, site, problemTitle, solveCount, onDoneCb) {
    const hostId = site === "codeforces" ? "rehash-cf-timer-host" : "rehash-timer-host";
    document.getElementById(hostId)?.remove();
    const host = document.createElement("div");
    host.id = hostId;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    const shadow = host.attachShadow({ mode: "open" });
    const state = {
      elapsed: 0,
      running: false,
      paused: false,
      started: false,
      intervalId: null,
      persistId: null,
      startWallTime: null,
      drag: null,
      justDragged: false,
      mode: sessionStorage.getItem(modeKey(slug)) || "stopwatch",
      countdownSecs: clampInt(sessionStorage.getItem(countdownKey(slug)), 1200, 60, 10800),
      title: problemTitle || "Unknown problem",
      solveCount: solveCount || 0,
    };

    shadow.innerHTML = widgetHtml(state);
    document.documentElement.appendChild(host);
    restorePosition(host, shadow, slug);
    bind();
    restoreTimer();
    updateAll();
    state.persistId = window.setInterval(persistTimer, PERSIST_MS);

    function bind() {
      shadow.getElementById("rh-fab").addEventListener("click", () => {
        if (state.justDragged) {
          state.justDragged = false;
          return;
        }
        setCollapsed(false);
      });
      shadow.getElementById("rh-collapse").addEventListener("click", () => setCollapsed(true));
      shadow.getElementById("rh-start").addEventListener("click", start);
      shadow.getElementById("rh-pause").addEventListener("click", togglePause);
      shadow.getElementById("rh-reset").addEventListener("click", reset);
      shadow.getElementById("rh-done").addEventListener("click", stopAndDone);
      shadow.querySelectorAll("[data-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          if (state.running || state.paused || state.started) return;
          state.mode = button.dataset.mode;
          sessionStorage.setItem(modeKey(slug), state.mode);
          updateAll();
        });
      });
      shadow.querySelectorAll("[data-preset]").forEach((button) => {
        button.addEventListener("click", () => {
          if (state.started) return;
          if (button.dataset.preset === "custom") {
            shadow.getElementById("rh-custom-wrap").style.display = "flex";
            return;
          }
          state.countdownSecs = Number(button.dataset.preset) * 60;
          sessionStorage.setItem(countdownKey(slug), String(state.countdownSecs));
          updateAll();
        });
      });
      shadow.getElementById("rh-custom-mins").addEventListener("change", (event) => {
        if (state.started) return;
        state.countdownSecs = clampInt(event.target.value, 20, 1, 180) * 60;
        sessionStorage.setItem(countdownKey(slug), String(state.countdownSecs));
        updateAll();
      });
      initDrag(host, shadow.getElementById("rh-drag-handle"), slug);
      initDrag(host, shadow.getElementById("rh-fab"), slug);
      window.addEventListener("beforeunload", persistTimer);
      document.addEventListener("visibilitychange", () => {
        persistTimer();
        if (!document.hidden) restoreTimer();
      });
      window.addEventListener("resize", () => clampAndPersistPosition(host, slug));
    }

    function start() {
      state.elapsed = 0;
      state.running = true;
      state.paused = false;
      state.started = true;
      state.startWallTime = Date.now();
      persistTimer();
      tick();
      state.intervalId = window.setInterval(tick, 1000);
    }

    function togglePause() {
      if (!state.running && !state.paused) return;
      if (state.paused) {
        state.running = true;
        state.paused = false;
        state.startWallTime = Date.now();
        state.intervalId = window.setInterval(tick, 1000);
      } else {
        recomputeElapsed();
        state.running = false;
        state.paused = true;
        clearTick();
      }
      persistTimer();
      updateAll();
    }

    function reset() {
      clearTick();
      state.elapsed = 0;
      state.running = false;
      state.paused = false;
      state.started = false;
      state.startWallTime = null;
      sessionStorage.removeItem(timerKey(site, slug));
      updateAll();
    }

    function stopAndDone() {
      recomputeElapsed();
      clearTick();
      state.running = false;
      state.paused = true;
      state.started = true;
      persistTimer();
      updateAll();
      onDoneCb(Math.max(0, state.elapsed));
    }

    function tick() {
      updateAll();
      if (state.mode === "countdown" && getRemaining() === 0 && !shadow.getElementById("rh-shell").classList.contains("expired")) {
        try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=").play().catch(() => {}); } catch {}
        try { navigator.vibrate?.(160); } catch {}
      }
    }

    function clearTick() {
      if (state.intervalId) window.clearInterval(state.intervalId);
      state.intervalId = null;
    }

    function recomputeElapsed() {
      if (state.running && !state.paused && Number.isFinite(state.startWallTime)) {
        state.elapsed += Math.floor((Date.now() - state.startWallTime) / 1000);
        state.startWallTime = Date.now();
      }
    }

    function getElapsed() {
      if (state.running && !state.paused && Number.isFinite(state.startWallTime)) {
        return state.elapsed + Math.floor((Date.now() - state.startWallTime) / 1000);
      }
      return state.elapsed;
    }

    function getRemaining() {
      return Math.max(0, state.countdownSecs - getElapsed());
    }

    function updateAll() {
      const elapsed = getElapsed();
      const remaining = state.countdownSecs - elapsed;
      const shell = shadow.getElementById("rh-shell");
      const display = shadow.getElementById("rh-time");
      const status = shadow.getElementById("rh-status");
      const pressure = state.mode === "countdown" ? getPressure(remaining, state.countdownSecs) : "normal";
      shadow.getElementById("rh-title").textContent = state.title;
      shadow.getElementById("rh-solve-info").textContent = `Solve ${(state.solveCount || 0) + 1} of this problem`;
      display.textContent = state.mode === "countdown" ? formatSigned(remaining) : formatSecs(elapsed);
      status.textContent = state.mode === "countdown" && remaining < 0 ? "OVERTIME !" : state.mode === "countdown" ? `${Math.ceil(Math.max(0, remaining) / 60)}m remaining` : "Stopwatch";
      shell.classList.toggle("running", state.running && !state.paused);
      shell.classList.toggle("paused", state.paused);
      shell.classList.toggle("low", pressure === "low");
      shell.classList.toggle("critical", pressure === "critical");
      shell.classList.toggle("expired", pressure === "expired");
      shell.classList.toggle("countdown", state.mode === "countdown");
      shadow.querySelectorAll("[data-mode]").forEach((button) => {
        button.classList.toggle("active", button.dataset.mode === state.mode);
        button.disabled = state.running || state.paused || state.started;
      });
      shadow.getElementById("rh-countdown-picker").style.display = state.mode === "countdown" ? "flex" : "none";
      shadow.querySelectorAll("[data-preset], #rh-custom-mins").forEach((el) => { el.disabled = state.started; });
      shadow.getElementById("rh-start").disabled = state.running || state.paused || state.started;
      shadow.getElementById("rh-pause").disabled = !state.running && !state.paused;
      shadow.getElementById("rh-pause").innerHTML = state.paused ? icon("play") : icon("pause");
      shadow.getElementById("rh-reset").style.display = state.started ? "inline-flex" : "none";
      shadow.getElementById("rh-custom-mins").value = String(Math.round(state.countdownSecs / 60));
      persistMode();
    }

    function persistMode() {
      sessionStorage.setItem(modeKey(slug), state.mode);
      sessionStorage.setItem(countdownKey(slug), String(state.countdownSecs));
    }

    function persistTimer() {
      recomputeElapsed();
      sessionStorage.setItem(timerKey(site, slug), JSON.stringify({
        elapsed: state.elapsed,
        running: state.running,
        paused: state.paused,
        started: state.started,
        startWallTime: Date.now(),
      }));
    }

    function restoreTimer() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(timerKey(site, slug)) || "null");
        if (!saved) return;
        state.elapsed = Math.max(0, Number(saved.elapsed) || 0);
        state.running = Boolean(saved.running);
        state.paused = Boolean(saved.paused);
        state.started = Boolean(saved.started || saved.elapsed > 0 || saved.running || saved.paused);
        state.startWallTime = Date.now();
        if (state.running && !state.paused && Number.isFinite(saved.startWallTime)) {
          state.elapsed += Math.floor((Date.now() - saved.startWallTime) / 1000);
          clearTick();
          state.intervalId = window.setInterval(tick, 1000);
        }
      } catch {}
      updateAll();
    }

    function setCollapsed(collapsed) {
      sessionStorage.setItem(collapsedKey(slug), collapsed ? "1" : "0");
      shadow.getElementById("rh-shell").classList.toggle("collapsed", collapsed);
      clampAndPersistPosition(host, slug);
    }

    return {
      updateProblem(nextTitle, nextSolveCount) {
        state.title = nextTitle || state.title;
        state.solveCount = Number(nextSolveCount) || 0;
        updateAll();
      },
      stopAndDone,
      reset,
      getElapsed,
      destroy() {
        clearTick();
        if (state.persistId) window.clearInterval(state.persistId);
        host.remove();
      },
    };
  }

  function widgetHtml(state) {
    return `
      <style>
        :host{all:initial}.rh-shell{width:244px;min-height:178px;background:#0f0f1a;color:#e2e8f0;border:1px solid rgba(255,255,255,.09);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1.35;overflow:visible;transition:all .2s}.rh-shell.collapsed{width:48px;min-height:48px;border-radius:50%}.rh-panel{display:grid;gap:8px;padding:10px}.rh-shell.collapsed .rh-panel{display:none}.rh-fab{display:none;width:48px;height:48px;border:0;border-radius:50%;background:#0f0f1a;color:#fbbf24;align-items:center;justify-content:center;cursor:grab;padding:0}.rh-shell.collapsed .rh-fab{display:flex}.rh-shell.running.collapsed .rh-fab{animation:pulse-amber 1.8s infinite}.rh-shell.low.collapsed .rh-fab{animation:pulse-orange 1s infinite}.rh-shell.critical.collapsed .rh-fab,.rh-shell.expired.collapsed .rh-fab{animation:pulse-red .55s infinite}@keyframes pulse-amber{70%{box-shadow:0 0 0 8px rgba(251,191,36,0)}}@keyframes pulse-orange{70%{box-shadow:0 0 0 10px rgba(249,115,22,0)}}@keyframes pulse-red{70%{box-shadow:0 0 0 12px rgba(239,68,68,0)}}.rh-header{display:flex;align-items:center;gap:6px;cursor:grab;min-width:0}.rh-brand{display:flex;align-items:center;gap:5px;font-weight:800;color:#f8fafc;white-space:nowrap}.rh-title{min-width:0;flex:1;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rh-collapse,.rh-icon-btn{width:28px;height:28px;border:0;border-radius:10px;background:rgba(255,255,255,.06);color:#e2e8f0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}.rh-icon-btn:disabled,.rh-mode:disabled,.rh-preset:disabled{opacity:.38;cursor:default}.rh-solve-info,.rh-status{color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rh-time{font-family:Consolas,monospace;font-size:30px;font-weight:800;line-height:1;text-align:center;color:#fbbf24}.rh-shell.low .rh-time{color:#f97316}.rh-shell.critical .rh-time,.rh-shell.expired .rh-time{color:#ef4444}.rh-shell.critical .rh-time{animation:shake .24s linear infinite}@keyframes shake{25%{transform:translateX(-1px)}75%{transform:translateX(1px)}}.rh-controls,.rh-modes,.rh-presets{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}.rh-mode,.rh-preset{border:1px solid rgba(255,255,255,.1);background:#181825;color:#cdd6f4;border-radius:8px;padding:5px 7px;cursor:pointer}.rh-mode.active,.rh-preset.active{background:#cba6f7;color:#11111b}.rh-custom{display:none;align-items:center;gap:6px;justify-content:center}.rh-custom input{width:56px;background:#11111b;color:#cdd6f4;border:1px solid #45475a;border-radius:8px;padding:5px}.rh-icon{width:15px;height:15px}.rh-fab .rh-icon{width:22px;height:22px}
      </style>
      <div class="rh-shell ${sessionStorage.getItem(collapsedKey("")) === "0" ? "" : "collapsed"}" id="rh-shell">
        <button class="rh-fab" id="rh-fab" type="button" aria-label="Open ReHash">${icon("hash")}</button>
        <div class="rh-panel">
          <div class="rh-header" id="rh-drag-handle"><div class="rh-brand">${icon("clock")}<span>ReHash</span></div><div class="rh-title" id="rh-title">${escapeHtml(state.title)}</div><button class="rh-collapse" id="rh-collapse" type="button" aria-label="Collapse">${icon("minus")}</button></div>
          <div class="rh-modes"><button class="rh-mode" data-mode="stopwatch" type="button">Stopwatch</button><button class="rh-mode" data-mode="countdown" type="button">Countdown</button></div>
          <div class="rh-presets" id="rh-countdown-picker"><button class="rh-preset" data-preset="15" type="button">15m</button><button class="rh-preset" data-preset="20" type="button">20m</button><button class="rh-preset" data-preset="30" type="button">30m</button><button class="rh-preset" data-preset="45" type="button">45m</button><button class="rh-preset" data-preset="60" type="button">60m</button><button class="rh-preset" data-preset="custom" type="button">Edit</button></div>
          <div class="rh-custom" id="rh-custom-wrap"><input id="rh-custom-mins" type="number" min="1" max="180" /></div>
          <div class="rh-solve-info" id="rh-solve-info"></div><div class="rh-time" id="rh-time">00:00</div><div class="rh-status" id="rh-status"></div>
          <div class="rh-controls"><button class="rh-icon-btn" id="rh-start" type="button">${icon("play")}</button><button class="rh-icon-btn" id="rh-pause" type="button">${icon("pause")}</button><button class="rh-icon-btn" id="rh-reset" type="button">${icon("reset")}</button><button class="rh-icon-btn" id="rh-done" type="button">${icon("check")}</button></div>
        </div>
      </div>`;
  }

  function restorePosition(host, shadow, slug) {
    const collapsed = sessionStorage.getItem(collapsedKey(slug));
    shadow.getElementById("rh-shell").classList.toggle("collapsed", collapsed === null ? true : collapsed === "1");
    try {
      const pos = JSON.parse(sessionStorage.getItem(positionKey(slug)) || "null");
      if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) {
        host.style.left = `${pos.x}px`;
        host.style.top = `${pos.y}px`;
        return;
      }
    } catch {}
    host.style.left = `${Math.max(8, window.innerWidth - 268)}px`;
    host.style.top = "80px";
  }

  function initDrag(host, handle, slug) {
    if (!handle) return;
    handle.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || (handle.id !== "rh-fab" && event.target.closest?.("button"))) return;
      const rect = host.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const offsetX = event.clientX - rect.left;
      const offsetY = event.clientY - rect.top;
      event.preventDefault();
      const onMove = (moveEvent) => {
        host.style.left = `${Math.max(8, Math.min(window.innerWidth - 56, moveEvent.clientX - offsetX))}px`;
        host.style.top = `${Math.max(8, Math.min(window.innerHeight - 56, moveEvent.clientY - offsetY))}px`;
      };
      const onUp = (upEvent) => {
        if (Math.abs(upEvent.clientX - startX) > 3 || Math.abs(upEvent.clientY - startY) > 3) {
          const fab = host.shadowRoot?.getElementById("rh-fab");
          if (fab) host.shadowRoot.hostJustDragged = true;
        }
        clampAndPersistPosition(host, slug);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function clampAndPersistPosition(host, slug) {
    const x = Math.round(Math.max(8, Math.min(window.innerWidth - 56, parseFloat(host.style.left || "0"))));
    const y = Math.round(Math.max(8, Math.min(window.innerHeight - 56, parseFloat(host.style.top || "0"))));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    sessionStorage.setItem(positionKey(slug), JSON.stringify({ x, y }));
  }

  function getPressure(remaining, total) {
    if (remaining <= 0) return "expired";
    const ratio = remaining / Math.max(1, total);
    if (ratio <= 0.1) return "critical";
    if (ratio <= 0.25) return "low";
    return "normal";
  }

  function timerKey(site, slug) { return `rehash_timer_state::${site}::${slug}`; }
  function modeKey(slug) { return `rehash_timer_mode_${slug}`; }
  function countdownKey(slug) { return `rehash_timer_cd_${slug}`; }
  function collapsedKey(slug) { return `rehash_collapsed_${slug}`; }
  function positionKey(slug) { return `rehash_pos_${slug}`; }
  function clampInt(value, fallback, min, max) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
  }
  function formatSigned(totalSecs) {
    return totalSecs < 0 ? `-${formatSecs(Math.abs(totalSecs))}` : formatSecs(totalSecs);
  }
  function formatSecs(totalSecs) {
    const minutes = Math.floor(Math.max(0, totalSecs) / 60);
    const seconds = Math.max(0, totalSecs) % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function icon(name) {
    const icons = {
      hash: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 9h16"/><path d="M4 15h16"/><path d="M10 3 8 21"/><path d="m16 3-2 18"/></svg>',
      clock: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      play: '<svg class="rh-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
      pause: '<svg class="rh-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
      check: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m5 12 5 5L20 7"/></svg>',
      minus: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M6 12h12"/></svg>',
      reset: '<svg class="rh-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/></svg>',
    };
    return icons[name] || icons.hash;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.ReHashTimerWidget = { createTimerWidget };
})();
