(function () {
  const SITE = "leetcode";
  const WIDGET_HOST_ID = "rehash-timer-host";
  const MODAL_HOST_ID = "rehash-modal-host";
  const STRIVER_BANNER_ID = "rehash-striver-banner";
  const PERSIST_MS = 30000;

  const state = {
    acceptedHandled: false,
    currentInfo: null,
    currentStriverEntry: null,
    elapsed: 0,
    intervalId: null,
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
    if (!document.body) return;
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
      if (!document.hidden) restoreTimerState();
    });
    startPeriodicPersistence();
  }

  function extractProblem() {
    const striverEntry = state.currentStriverEntry || findStriverEntryForCurrentPage();
    return {
      title: extractTitle(),
      url: getNormalizedProblemUrl(),
      site: SITE,
      difficulty: extractDifficulty(),
      tags: extractTags(),
      striverId: striverEntry?.id || null,
      striverStep: striverEntry?.step || null,
      striverTopic: striverEntry?.topic || null,
    };
  }

  function extractTitle() {
    for (const selector of ['div[data-cy="question-title"]', ".css-1hwfws3 h1", "h1", '[class*="title"]']) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text) return text;
    }
    return document.title.replace(" - LeetCode", "").trim() || "Unknown problem";
  }

  function extractDifficulty() {
    const text = Array.from(document.querySelectorAll("div[diff], .difficulty, [class*='difficulty']"))
      .map((el) => el.textContent.trim().toLowerCase())
      .join(" ");
    if (text.includes("easy")) return "Easy";
    if (text.includes("medium")) return "Medium";
    if (text.includes("hard")) return "Hard";
    const diff = document.querySelector("[diff]")?.getAttribute("diff");
    if (diff === "1") return "Easy";
    if (diff === "2") return "Medium";
    if (diff === "3") return "Hard";
    return "Unknown";
  }

  function extractTags() {
    const tags = [];
    document.querySelectorAll(".topic-tag, .tag, a[href*='/tag/']").forEach((el) => {
      const text = el.textContent.trim();
      if (text && !tags.includes(text)) tags.push(text);
    });
    return tags.slice(0, 10);
  }

  function injectWidget() {
    if (document.getElementById(WIDGET_HOST_ID)) return;
    const host = document.createElement("div");
    host.id = WIDGET_HOST_ID;
    host.style.position = "fixed";
    host.style.right = "16px";
    host.style.top = "16px";
    host.style.zIndex = "9999";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        .rh-widget{width:280px;background:#1e1e2e;color:#cdd6f4;border:1px solid rgba(203,166,247,.22);border-radius:8px;padding:12px;box-shadow:0 18px 36px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:12px;line-height:1.45}
        .rh-label{color:#cba6f7;font-weight:700;margin-bottom:6px}.rh-title{font-weight:650;margin-bottom:8px;max-height:36px;overflow:hidden}.rh-solve-info{background:#181825;border:1px solid rgba(137,180,250,.25);border-radius:8px;padding:7px 8px;margin-bottom:10px;color:#89b4fa}
        .rh-time{font-size:26px;font-weight:800;color:#89b4fa;letter-spacing:.04em;margin-bottom:10px}.rh-time.paused{color:#f9e2af}.rh-controls{display:flex;gap:8px}.rh-btn{flex:1;border:0;border-radius:8px;background:#313244;color:#cdd6f4;padding:8px 10px;font-weight:700;cursor:pointer}.rh-btn:hover:not(:disabled){background:#45475a}.rh-btn:disabled{opacity:.5;cursor:default}.rh-btn.primary{background:#89b4fa;color:#11111b}.rh-btn.done{background:#f38ba8;color:#11111b}
      </style>
      <div class="rh-widget">
        <div class="rh-label">ReHash timer</div>
        <div class="rh-title" id="rh-title">Loading problem...</div>
        <div class="rh-solve-info" id="rh-solve-info">Solve 1 of this problem</div>
        <div class="rh-time" id="rh-time">00:00</div>
        <div class="rh-controls">
          <button class="rh-btn primary" id="rh-start" type="button">Start</button>
          <button class="rh-btn" id="rh-pause" type="button" disabled>Pause</button>
          <button class="rh-btn done" id="rh-done" type="button">Done</button>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    shadow.getElementById("rh-start").addEventListener("click", startTimer);
    shadow.getElementById("rh-pause").addEventListener("click", togglePause);
    shadow.getElementById("rh-done").addEventListener("click", () => stopTimerAndOpenModal());
  }

  function updateWidgetProblem(problem) {
    const title = document.getElementById(WIDGET_HOST_ID)?.shadowRoot?.getElementById("rh-title");
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
  }

  function updateControls() {
    const shadow = document.getElementById(WIDGET_HOST_ID)?.shadowRoot;
    const start = shadow?.getElementById("rh-start");
    const pause = shadow?.getElementById("rh-pause");
    if (!start || !pause) return;
    start.disabled = state.running || state.paused || state.elapsed > 0;
    pause.disabled = !state.running && !state.paused;
    pause.textContent = state.paused ? "Resume" : "Pause";
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
    sessionStorage.setItem(getTimerKey(problem.url), JSON.stringify({
      elapsed: state.elapsed,
      running: state.running,
      paused: state.paused,
      startWallTime: Date.now(),
      problem,
    }));
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
    return Boolean(node.querySelector?.('[data-e2e-locator="submission-result"], [class*="success"], [class*="accepted"]')) && /\baccepted\b/i.test(text);
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
        renderStriverBannerWithRetry();
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
    return window.STRIVER_SHEET_UTILS?.findByProblemUrl?.(getNormalizedProblemUrl()) || null;
  }

  function renderStriverBannerWithRetry(attempt = 0) {
    if (!state.currentStriverEntry) return;
    const titleElement = document.querySelector('div[data-cy="question-title"]') || document.querySelector(".css-1hwfws3 h1") || document.querySelector("h1");
    if (!titleElement) {
      if (attempt < 12) window.setTimeout(() => renderStriverBannerWithRetry(attempt + 1), 400);
      return;
    }
    document.getElementById(STRIVER_BANNER_ID)?.remove();
    const banner = document.createElement("div");
    banner.id = STRIVER_BANNER_ID;
    banner.style.cssText = "margin-top:10px;padding:8px 12px;border-radius:8px;background:rgba(203,166,247,.12);border:1px solid rgba(203,166,247,.25);font-size:13px;color:inherit;";
    banner.innerHTML = `<strong>Striver A2Z</strong> <span>${escapeHtml(state.currentStriverEntry.step)} - ${escapeHtml(state.currentStriverEntry.topic)}</span>`;
    titleElement.insertAdjacentElement("afterend", banner);
  }

  function getNormalizedProblemUrl() {
    try {
      const parsed = new URL(window.location.href);
      const match = parsed.pathname.match(/^\/problems\/([^/]+)/i);
      if (match) return `${parsed.origin}/problems/${match[1]}/`;
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}/`;
    } catch {
      return window.location.href;
    }
  }

  function getTimerKey(url) {
    return `rehash_timer_state::${SITE}::${slugFromUrl(url)}`;
  }

  function slugFromUrl(url) {
    try {
      const match = new URL(url).pathname.match(/^\/problems\/([^/]+)/i);
      return match ? match[1] : new URL(url).pathname.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9_-]+/gi, "_");
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

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response)));
  }
})();
