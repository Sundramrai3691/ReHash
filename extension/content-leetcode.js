const REHASH_TIMER_PREFIX = "rehash_timer_state::";
const REHASH_WIDGET_HOST_ID = "rehash-timer-host";
const REHASH_MODAL_HOST_ID = "rehash-modal-host";
const REHASH_HISTORY_HOST_ID = "rehash-history-host";
const REHASH_WIDGET_POSITION_KEY = "rehash_timer_widget_position";
const REHASH_WIDGET_LAYOUT_KEY = "rehash_timer_widget_layout";
const REHASH_STRIVER_BANNER_ID = "rehash-striver-banner";
const DEFAULT_NOTION_URL = "https://www.notion.so";

const rehashState = {
  acceptedHandled: false,
  currentSolveCount: 0,
  currentProblemSessions: [],
  currentStriverEntry: null,
  dragSession: null,
  isWidgetCollapsed: false,
  modalShown: false,
  notionOpened: false,
  observer: null,
  timerInterval: null,
  timerSnapshot: createDefaultTimerState(),
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract_problem") {
    sendResponse(extractLeetCodeProblem());
  }
  return true;
});

initializeRehashTimer().catch(() => {
  // Keep extraction working even if timer bootstrapping fails.
});

async function initializeRehashTimer() {
  if (!document.body || document.getElementById(REHASH_WIDGET_HOST_ID)) {
    return;
  }

  injectTimerWidget();
  await initializeStriverContext();
  updateWidgetProblem(extractLeetCodeProblem());
  await restoreWidgetPosition();
  await restoreWidgetLayout();
  await loadTimerState();
  syncTimerUi();
  setupAcceptedObserver();
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

async function initializeStriverContext() {
  rehashState.currentStriverEntry = findStriverEntryForCurrentPage();
  await refreshCurrentProblemSessions();
  renderStriverBannerWithRetry();
}

function extractLeetCodeProblem() {
  const title = extractTitle();
  const difficulty = extractDifficulty();
  const tags = extractTags();
  const striverEntry = rehashState.currentStriverEntry || findStriverEntryForCurrentPage();

  return {
    title,
    url: getNormalizedProblemUrl(),
    site: "leetcode",
    difficulty,
    tags,
    striverId: striverEntry?.id || null,
    striverStep: striverEntry?.step || null,
    striverTopic: striverEntry?.topic || null,
  };
}

function extractTitle() {
  const selectors = [
    'div[data-cy="question-title"]',
    ".css-1hwfws3 h1",
    "h1",
    '[class*="title"]',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  const title = document.title.replace(" - LeetCode", "").trim();
  if (title) return title;

  return "Unknown Problem";
}

function extractDifficulty() {
  const selectors = [
    "div[diff]",
    ".css-1oz8vj0",
    ".difficulty",
    '[class*="difficulty"]',
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = element.textContent.trim().toLowerCase();
      if (text.includes("easy")) return "Easy";
      if (text.includes("medium")) return "Medium";
      if (text.includes("hard")) return "Hard";
    }
  }

  const diffAttr = document.querySelector("[diff]");
  if (diffAttr) {
    const diff = diffAttr.getAttribute("diff");
    if (diff === "1") return "Easy";
    if (diff === "2") return "Medium";
    if (diff === "3") return "Hard";
  }

  return "Unknown";
}

function extractTags() {
  const tags = [];
  const selectors = [
    ".topic-tag",
    ".tag",
    '[class*="topic"]',
    'a[href*="/tag/"]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element) => {
      const text = element.textContent.trim();
      if (text && !tags.includes(text)) {
        tags.push(text);
      }
    });

    if (tags.length > 0) break;
  }

  return tags.slice(0, 10);
}

function injectTimerWidget() {
  if (document.getElementById(REHASH_WIDGET_HOST_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = REHASH_WIDGET_HOST_ID;
  host.style.position = "fixed";
  host.style.top = "16px";
  host.style.right = "16px";
  host.style.zIndex = "9999";

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .rehash-widget {
        width: 260px;
        background: #1a1a2e;
        color: #ffffff;
        border-radius: 12px;
        padding: 12px 14px 14px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        font-size: 12px;
        line-height: 1.45;
        user-select: none;
        transition: width 0.2s ease, padding 0.2s ease, opacity 0.2s ease;
      }

      .rehash-widget.compact {
        width: 186px;
        padding: 10px 12px 12px;
      }

      .rehash-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
        gap: 10px;
      }

      .rehash-header-left {
        min-width: 0;
        flex: 1;
      }

      .rehash-header-label {
        color: #b9bfd6;
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .rehash-drag-grip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        width: 34px;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        cursor: move;
        touch-action: none;
      }

      .rehash-drag-grip:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .rehash-drag-grip span {
        width: 4px;
        height: 4px;
        border-radius: 999px;
        background: #6e7797;
      }

      .rehash-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .rehash-icon-button {
        width: 30px;
        height: 30px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.04);
        color: #ffffff;
        cursor: pointer;
        font-size: 16px;
        line-height: 1;
      }

      .rehash-icon-button:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .rehash-title {
        font-weight: 600;
        margin-bottom: 10px;
        max-height: 34px;
        overflow: hidden;
      }

      .rehash-widget.compact .rehash-title,
      .rehash-widget.compact .rehash-summary {
        display: none;
      }

      .rehash-timer {
        font-size: 24px;
        font-weight: 700;
        letter-spacing: 0.08em;
        margin-bottom: 12px;
      }

      .rehash-widget.compact .rehash-timer {
        font-size: 20px;
        margin-bottom: 10px;
      }

      .rehash-controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 10px;
      }

      .rehash-button {
        flex: 1 1 calc(50% - 4px);
        border: none;
        border-radius: 999px;
        background: #0f3460;
        color: #ffffff;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        padding: 8px 10px;
      }

      .rehash-button:hover:not(:disabled) {
        background: #17568c;
      }

      .rehash-button.secondary {
        background: #3b4259;
      }

      .rehash-button.secondary:hover:not(:disabled) {
        background: #4b5473;
      }

      .rehash-button.danger {
        background: #b33939;
      }

      .rehash-button.danger:hover:not(:disabled) {
        background: #cf4a4a;
      }

      .rehash-button:disabled {
        cursor: default;
        opacity: 0.45;
      }

      .rehash-summary {
        font-size: 11px;
        color: #b9bfd6;
        min-height: 16px;
      }

      .rehash-widget.compact .rehash-controls {
        margin-bottom: 0;
      }

      .rehash-widget.compact #rehash-records-button {
        display: none;
      }
    </style>
    <div class="rehash-widget" id="rehash-widget-shell">
      <div class="rehash-header">
        <div class="rehash-header-left">
          <div class="rehash-header-label">ReHash Timer</div>
        </div>
        <div class="rehash-header-actions">
          <button class="rehash-icon-button" id="rehash-toggle-compact" type="button" aria-label="Minimize timer widget" title="Minimize timer">−</button>
          <button class="rehash-drag-grip" id="rehash-drag-grip" type="button" aria-label="Drag timer widget" title="Drag timer">
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
      <div class="rehash-title" id="rehash-problem-title">Loading problem...</div>
      <div class="rehash-timer" id="rehash-timer-display">00:00</div>
      <div class="rehash-controls">
        <button class="rehash-button" id="rehash-start-button">Start</button>
        <button class="rehash-button secondary" id="rehash-pause-button">Pause</button>
        <button class="rehash-button danger" id="rehash-reset-button">Reset</button>
        <button class="rehash-button secondary" id="rehash-records-button">Records</button>
      </div>
      <div class="rehash-summary" id="rehash-session-summary">No solve records yet.</div>
    </div>
  `;

  document.documentElement.appendChild(host);

  shadow.getElementById("rehash-start-button").addEventListener("click", () => {
    void startTimer();
  });

  shadow.getElementById("rehash-pause-button").addEventListener("click", () => {
    void togglePauseResume();
  });

  shadow.getElementById("rehash-reset-button").addEventListener("click", () => {
    void resetTimer();
  });

  shadow.getElementById("rehash-records-button").addEventListener("click", () => {
    void openHistoryModal();
  });

  shadow.getElementById("rehash-toggle-compact").addEventListener("click", () => {
    void toggleWidgetLayout();
  });

  initializeWidgetDragging(host, shadow.getElementById("rehash-drag-grip"));
}

function initializeWidgetDragging(host, handle) {
  handle.addEventListener("pointerdown", (event) => {
    const rect = host.getBoundingClientRect();
    host.style.left = `${rect.left}px`;
    host.style.top = `${rect.top}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";

    rehashState.dragSession = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
    };

    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!rehashState.dragSession || rehashState.dragSession.pointerId !== event.pointerId) {
      return;
    }

    const left = clamp(
      event.clientX - rehashState.dragSession.offsetX,
      8,
      Math.max(8, window.innerWidth - host.offsetWidth - 8),
    );
    const top = clamp(
      event.clientY - rehashState.dragSession.offsetY,
      8,
      Math.max(8, window.innerHeight - host.offsetHeight - 8),
    );

    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
  });

  handle.addEventListener("pointerup", () => {
    void saveWidgetPosition(host);
    rehashState.dragSession = null;
  });

  handle.addEventListener("pointercancel", () => {
    void saveWidgetPosition(host);
    rehashState.dragSession = null;
  });
}

async function restoreWidgetPosition() {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const saved = (await storageGet(REHASH_WIDGET_POSITION_KEY))[REHASH_WIDGET_POSITION_KEY];

  if (!host || !saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) {
    return;
  }

  host.style.left = `${clamp(saved.left, 8, Math.max(8, window.innerWidth - host.offsetWidth - 8))}px`;
  host.style.top = `${clamp(saved.top, 8, Math.max(8, window.innerHeight - host.offsetHeight - 8))}px`;
  host.style.right = "auto";
  host.style.bottom = "auto";
}

async function restoreWidgetLayout() {
  const saved = (await storageGet(REHASH_WIDGET_LAYOUT_KEY))[REHASH_WIDGET_LAYOUT_KEY];
  rehashState.isWidgetCollapsed = Boolean(saved?.collapsed);
  applyWidgetLayout();
}

async function toggleWidgetLayout() {
  rehashState.isWidgetCollapsed = !rehashState.isWidgetCollapsed;
  applyWidgetLayout();
  await storageSet({
    [REHASH_WIDGET_LAYOUT_KEY]: {
      collapsed: rehashState.isWidgetCollapsed,
    },
  });
}

function applyWidgetLayout() {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const shell = host?.shadowRoot?.getElementById("rehash-widget-shell");
  const toggleButton = host?.shadowRoot?.getElementById("rehash-toggle-compact");

  if (!shell || !toggleButton) {
    return;
  }

  shell.classList.toggle("compact", rehashState.isWidgetCollapsed);
  toggleButton.textContent = rehashState.isWidgetCollapsed ? "+" : "−";
  toggleButton.setAttribute("aria-label", rehashState.isWidgetCollapsed ? "Expand timer widget" : "Minimize timer widget");
  toggleButton.title = rehashState.isWidgetCollapsed ? "Expand timer" : "Minimize timer";
}

async function saveWidgetPosition(host) {
  const left = parseInt(host.style.left || "", 10);
  const top = parseInt(host.style.top || "", 10);

  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return;
  }

  await storageSet({
    [REHASH_WIDGET_POSITION_KEY]: {
      left,
      top,
    },
  });
}

function updateWidgetProblem(problem) {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const titleElement = host?.shadowRoot?.getElementById("rehash-problem-title");
  if (titleElement) {
    titleElement.textContent = problem.title || "Unknown Problem";
  }
}

function updateSessionSummary() {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const summaryElement = host?.shadowRoot?.getElementById("rehash-session-summary");
  if (!summaryElement) {
    return;
  }

  if (rehashState.currentProblemSessions.length === 0) {
    summaryElement.textContent = "No solve records yet.";
    return;
  }

  const lastSession = rehashState.currentProblemSessions.at(-1);
  summaryElement.textContent = `${rehashState.currentProblemSessions.length} record${rehashState.currentProblemSessions.length === 1 ? "" : "s"} saved. Last: ${formatDurationLabelFromMs(getSessionTimeMs(lastSession))}`;
}

function updateTimerDisplay(elapsedMs) {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const timerElement = host?.shadowRoot?.getElementById("rehash-timer-display");
  if (timerElement) {
    timerElement.textContent = formatTimer(elapsedMs);
  }
}

function updateTimerButtons(timerState) {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const startButton = host?.shadowRoot?.getElementById("rehash-start-button");
  const pauseButton = host?.shadowRoot?.getElementById("rehash-pause-button");
  const resetButton = host?.shadowRoot?.getElementById("rehash-reset-button");

  if (!startButton || !pauseButton || !resetButton) {
    return;
  }

  const hasElapsed = getElapsedMs(timerState) > 0;
  startButton.disabled = timerState.isRunning || timerState.isPaused || hasElapsed;
  pauseButton.disabled = !timerState.isRunning && !timerState.isPaused;
  pauseButton.textContent = timerState.isPaused ? "Resume" : "Pause";
  resetButton.disabled = !timerState.isRunning && !timerState.isPaused && !hasElapsed;
}

function startDisplayInterval() {
  stopDisplayInterval();

  const tick = () => {
    updateTimerDisplay(getElapsedMs(rehashState.timerSnapshot));
  };

  tick();
  rehashState.timerInterval = window.setInterval(tick, 1000);
}

function stopDisplayInterval() {
  if (rehashState.timerInterval) {
    window.clearInterval(rehashState.timerInterval);
    rehashState.timerInterval = null;
  }
}

async function handleVisibilityChange() {
  if (document.hidden) {
    stopDisplayInterval();
    return;
  }

  await loadTimerState();
  syncTimerUi();
}

function syncTimerUi() {
  updateTimerDisplay(getElapsedMs(rehashState.timerSnapshot));
  updateTimerButtons(rehashState.timerSnapshot);

  if (!document.hidden && rehashState.timerSnapshot.isRunning) {
    startDisplayInterval();
  } else {
    stopDisplayInterval();
  }
}

async function startTimer() {
  updateWidgetProblem(extractLeetCodeProblem());
  rehashState.acceptedHandled = false;

  await persistTimerState({
    startEpoch: Date.now(),
    isRunning: true,
    isPaused: false,
    pausedAccumMs: 0,
  });

  syncTimerUi();
}

async function togglePauseResume() {
  const timerState = await loadTimerState();

  if (timerState.isRunning) {
    await pauseTimer(timerState);
    return;
  }

  if (timerState.isPaused) {
    await resumeTimer(timerState);
  }
}

async function pauseTimer(timerState = rehashState.timerSnapshot) {
  const elapsedMs = getElapsedMs(timerState);

  await persistTimerState({
    startEpoch: null,
    isRunning: false,
    isPaused: true,
    pausedAccumMs: elapsedMs,
  });

  syncTimerUi();
}

async function resumeTimer(timerState = rehashState.timerSnapshot) {
  const pausedAccumMs = Math.max(0, timerState.pausedAccumMs || 0);

  await persistTimerState({
    startEpoch: Date.now(),
    isRunning: true,
    isPaused: false,
    pausedAccumMs,
  });

  syncTimerUi();
}

async function resetTimer() {
  rehashState.acceptedHandled = false;
  await persistTimerState(createDefaultTimerState());
  syncTimerUi();
}

async function stopTimerForSolvedFlow() {
  const timerState = await loadTimerState();
  const elapsedMs = getElapsedMs(timerState);

  await persistTimerState({
    startEpoch: null,
    isRunning: false,
    isPaused: true,
    pausedAccumMs: elapsedMs,
  });

  syncTimerUi();
  return elapsedMs;
}

async function loadTimerState() {
  const key = getTimerStorageKey();
  const saved = (await storageGet(key))[key];
  return cacheTimerState(normalizeTimerState(saved));
}

async function persistTimerState(timerState) {
  const key = getTimerStorageKey();
  const normalized = cacheTimerState(normalizeTimerState(timerState));
  await storageSet({ [key]: normalized });
  return normalized;
}

function cacheTimerState(timerState) {
  rehashState.timerSnapshot = normalizeTimerState(timerState);
  return rehashState.timerSnapshot;
}

function createDefaultTimerState() {
  return {
    startEpoch: null,
    isRunning: false,
    isPaused: false,
    pausedAccumMs: 0,
  };
}

function normalizeTimerState(timerState) {
  const normalized = {
    startEpoch: Number.isFinite(timerState?.startEpoch) ? timerState.startEpoch : null,
    isRunning: Boolean(timerState?.isRunning),
    isPaused: Boolean(timerState?.isPaused),
    pausedAccumMs: Number.isFinite(timerState?.pausedAccumMs) ? Math.max(0, timerState.pausedAccumMs) : 0,
  };

  if (!normalized.startEpoch) {
    normalized.startEpoch = null;
  }

  if (normalized.isRunning && normalized.startEpoch === null) {
    normalized.isRunning = false;
  }

  if (normalized.isRunning) {
    normalized.isPaused = false;
  }

  return normalized;
}

function getElapsedMs(timerState) {
  if (timerState.isRunning && Number.isFinite(timerState.startEpoch)) {
    return Math.max(0, Date.now() - timerState.startEpoch + timerState.pausedAccumMs);
  }

  return Math.max(0, timerState.pausedAccumMs || 0);
}

function getNormalizedProblemUrl(url = window.location.href) {
  return window.STRIVER_SHEET_UTILS?.normalizeProblemUrl
    ? window.STRIVER_SHEET_UTILS.normalizeProblemUrl(url)
    : normalizeProblemUrlFallback(url);
}

function getTimerStorageKey() {
  return `${REHASH_TIMER_PREFIX}${getNormalizedProblemUrl()}`;
}

function setupAcceptedObserver() {
  if (rehashState.observer || !document.body) {
    return;
  }

  rehashState.observer = new MutationObserver(() => {
    void maybeHandleAcceptedSubmission();
  });

  rehashState.observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  void maybeHandleAcceptedSubmission();
}

async function maybeHandleAcceptedSubmission() {
  if (rehashState.acceptedHandled || rehashState.modalShown || !findAcceptedVerdictNode()) {
    return;
  }

  const timerState = await loadTimerState();
  const elapsedMs = getElapsedMs(timerState);

  if (!timerState.isRunning && elapsedMs === 0) {
    return;
  }

  rehashState.acceptedHandled = true;
  const problem = extractLeetCodeProblem();
  const finalElapsedMs = timerState.isRunning ? await stopTimerForSolvedFlow() : elapsedMs;
  await openSolvedModal(problem, finalElapsedMs);
}

function findAcceptedVerdictNode() {
  const explicitVerdict = document.querySelector('[data-e2e-locator="submission-result"]');
  if (explicitVerdict && /accepted/i.test(explicitVerdict.textContent || "")) {
    return explicitVerdict;
  }

  return Array.from(document.querySelectorAll(".text-green-s")).find((element) =>
    /accepted/i.test(element.textContent || ""),
  ) || null;
}

function findStriverEntryForCurrentPage() {
  return window.STRIVER_SHEET_UTILS?.findByProblemUrl?.(getNormalizedProblemUrl()) || null;
}

async function getSolveCountForProblem(problemUrl) {
  const sessions = await getProblemSessionsForProblem(problemUrl);
  return sessions.length;
}

async function getProblemSessionsForProblem(problemUrl) {
  const normalizedTarget = getNormalizedProblemUrl(problemUrl);
  const solvedSessions = (await storageGet("solvedSessions")).solvedSessions;
  const sessions = Array.isArray(solvedSessions) ? solvedSessions : [];

  return sessions
    .filter((session) => getNormalizedProblemUrl(session.problemUrl || session.url || "") === normalizedTarget)
    .sort((first, second) => new Date(first.date) - new Date(second.date));
}

async function refreshCurrentProblemSessions() {
  rehashState.currentProblemSessions = await getProblemSessionsForProblem(getNormalizedProblemUrl());
  rehashState.currentSolveCount = rehashState.currentProblemSessions.length;
  updateSessionSummary();
}

function renderStriverBannerWithRetry(attempt = 0) {
  if (!rehashState.currentStriverEntry) {
    return;
  }

  const titleElement = findTitleElement();
  if (!titleElement) {
    if (attempt < 12) {
      window.setTimeout(() => renderStriverBannerWithRetry(attempt + 1), 400);
    }
    return;
  }

  const existing = document.getElementById(REHASH_STRIVER_BANNER_ID);
  if (existing) {
    existing.remove();
  }

  const banner = document.createElement("div");
  banner.id = REHASH_STRIVER_BANNER_ID;
  banner.style.marginTop = "10px";
  banner.style.padding = "8px 12px";
  banner.style.borderRadius = "10px";
  banner.style.background = "linear-gradient(135deg, rgba(31, 111, 235, 0.12), rgba(13, 17, 23, 0.06))";
  banner.style.border = "1px solid rgba(31, 111, 235, 0.2)";
  banner.style.fontSize = "13px";
  banner.style.color = "inherit";
  banner.innerHTML = `
    <strong>&#128203; Striver A2Z</strong>
    <span style="opacity:0.85;"> - ${escapeHtml(getStepShortLabel(rehashState.currentStriverEntry.step))} - ${escapeHtml(rehashState.currentStriverEntry.topic)} - </span>
    <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#1f6feb;color:#fff;font-size:12px;">
      ${escapeHtml(formatIterationBadge(rehashState.currentSolveCount))}
    </span>
  `;

  titleElement.insertAdjacentElement("afterend", banner);
}

function findTitleElement() {
  return (
    document.querySelector('div[data-cy="question-title"]') ||
    document.querySelector(".css-1hwfws3 h1") ||
    document.querySelector("h1")
  );
}

function getStepShortLabel(stepLabel) {
  const match = String(stepLabel || "").match(/Step\s+\d+/i);
  return match ? match[0] : stepLabel;
}

function formatIterationBadge(previousSolveCount) {
  const nextIteration = previousSolveCount + 1;

  if (nextIteration <= 1) {
    return "Solving for 1st time";
  }

  if (nextIteration >= 4) {
    return "4th+ revision";
  }

  return `${ordinalLabel(nextIteration)} revision`;
}

async function openSolvedModal(problem, elapsedMs) {
  if (rehashState.modalShown || document.getElementById(REHASH_MODAL_HOST_ID)) {
    return;
  }

  rehashState.modalShown = true;
  rehashState.notionOpened = false;

  const previousSolveCount = await getSolveCountForProblem(problem.url);
  const defaultIteration = Math.min(previousSolveCount + 1, 4);
  const notionResponse = await sendRuntimeMessage({ action: "GET_NOTION_URL" });
  const notionUrl = notionResponse?.notionUrl || DEFAULT_NOTION_URL;
  const tags = Array.isArray(problem.tags) ? problem.tags : [];
  const host = document.createElement("div");
  host.id = REHASH_MODAL_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      .rehash-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .rehash-modal {
        width: min(560px, 100%);
        max-height: min(88vh, 760px);
        overflow-y: auto;
        background: #1a1a2e;
        color: #ffffff;
        border-radius: 18px;
        padding: 22px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      }

      .rehash-heading {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .rehash-subtitle {
        color: #d7dcef;
        font-size: 14px;
        margin-bottom: 18px;
      }

      .rehash-section {
        margin-bottom: 18px;
        padding: 14px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.07);
      }

      .rehash-section h3 {
        font-size: 15px;
        margin-bottom: 10px;
      }

      .rehash-chip-group {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .rehash-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid #3d4664;
        border-radius: 999px;
        padding: 8px 12px;
        background: #111827;
        cursor: pointer;
        font-size: 13px;
      }

      .rehash-chip input {
        margin: 0;
      }

      .rehash-field {
        display: block;
        width: 100%;
        margin-top: 8px;
        border: 1px solid #34495e;
        border-radius: 12px;
        padding: 11px 12px;
        background: #111827;
        color: #ffffff;
        font: inherit;
        box-sizing: border-box;
      }

      .rehash-readonly {
        opacity: 0.85;
      }

      .rehash-grid {
        display: grid;
        gap: 12px;
      }

      .rehash-label {
        display: block;
        font-size: 12px;
        color: #c4c9df;
        margin-bottom: 6px;
      }

      .rehash-inline-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 6px;
        color: #d7dcef;
        font-size: 12px;
      }

      .rehash-pill {
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
      }

      .rehash-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .rehash-action {
        border: none;
        border-radius: 999px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        padding: 11px 16px;
      }

      .rehash-action.notion {
        background: #ffffff;
        color: #111827;
      }

      .rehash-action.save {
        background: #4caf50;
        color: #ffffff;
      }

      .rehash-action.cancel {
        background: #3b4259;
        color: #ffffff;
      }
    </style>
    <div class="rehash-overlay">
      <div class="rehash-modal">
        <div class="rehash-heading">Accepted Submission Logged</div>
        <div class="rehash-subtitle">${escapeHtml(problem.title)}</div>

        <div class="rehash-section">
          <h3>Step A - Which revision is this?</h3>
          <div class="rehash-chip-group" id="iterationGroup">
            ${renderIterationOption(1, defaultIteration)}
            ${renderIterationOption(2, defaultIteration)}
            ${renderIterationOption(3, defaultIteration)}
            ${renderIterationOption(4, defaultIteration, "4th+")}
          </div>
        </div>

        <div class="rehash-section" id="scheduleSection" style="display:${defaultIteration >= 2 ? "block" : "none"};">
          <h3>Step B - Schedule next review in:</h3>
          <div class="rehash-chip-group">
            ${renderScheduleOption("2", "2 days", true)}
            ${renderScheduleOption("5", "5 days")}
            ${renderScheduleOption("10", "10 days")}
            ${renderScheduleOption("30", "30 days")}
            ${renderScheduleOption("done", "Done")}
          </div>
        </div>

        <div class="rehash-section">
          <h3>Step C - Solve session details</h3>
          <div class="rehash-inline-meta">
            <span class="rehash-pill">${escapeHtml(problem.difficulty || "Unknown")}</span>
            <span class="rehash-pill">${escapeHtml(tags.join(", ") || "No topics")}</span>
            ${rehashState.currentStriverEntry ? `<span class="rehash-pill">${escapeHtml(rehashState.currentStriverEntry.topic)}</span>` : ""}
          </div>
          <div class="rehash-grid">
            <div>
              <label class="rehash-label" for="rehash-time-taken">Time taken</label>
              <input id="rehash-time-taken" class="rehash-field rehash-readonly" type="text" value="${escapeAttribute(formatDurationLabelFromMs(elapsedMs))}" readonly />
            </div>
            <div>
              <label class="rehash-label" for="rehash-approach">Approach used</label>
              <textarea id="rehash-approach" class="rehash-field" rows="3" placeholder="Two pointers, binary search on answer, monotonic stack..."></textarea>
            </div>
            <div>
              <label class="rehash-label" for="rehash-mistakes">Mistakes made</label>
              <textarea id="rehash-mistakes" class="rehash-field" rows="3" placeholder="Missed an edge case, off-by-one, forgot to sort first..."></textarea>
            </div>
            <div>
              <label class="rehash-label" for="rehash-notes">Notes</label>
              <textarea id="rehash-notes" class="rehash-field" rows="3" placeholder="What to remember next time"></textarea>
            </div>
            <div>
              <label class="rehash-label" for="rehash-confidence">Confidence</label>
              <select id="rehash-confidence" class="rehash-field">
                <option value="Easy">Easy</option>
                <option value="Medium" selected>Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>
          </div>
        </div>

        <div class="rehash-actions">
          <button class="rehash-action notion" id="rehash-open-notion">Open Notion Log</button>
          <button class="rehash-action cancel" id="rehash-close-modal">Close</button>
          <button class="rehash-action save" id="rehash-save-close">Save Session</button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);

  const scheduleSection = shadow.getElementById("scheduleSection");
  shadow.getElementById("iterationGroup").addEventListener("change", () => {
    const iteration = getSelectedIteration(shadow);
    scheduleSection.style.display = iteration >= 2 ? "block" : "none";
  });

  shadow.getElementById("rehash-open-notion").addEventListener("click", async () => {
    await sendRuntimeMessage({ action: "OPEN_NOTION_URL", url: notionUrl });
    rehashState.notionOpened = true;
  });

  shadow.getElementById("rehash-close-modal").addEventListener("click", () => {
    closeSolvedModal();
  });

  shadow.getElementById("rehash-save-close").addEventListener("click", async () => {
    const iteration = getSelectedIteration(shadow);
    const scheduleChoice = iteration >= 2 ? getSelectedSchedule(shadow) : null;
    const nextReviewDate = scheduleChoice && scheduleChoice !== "done"
      ? buildIsoDateFromToday(parseInt(scheduleChoice, 10))
      : null;
    const reviewDecision = scheduleChoice === "done"
      ? "done"
      : nextReviewDate
        ? "scheduled"
        : "none";

    const session = {
      problemUrl: problem.url,
      problemTitle: problem.title,
      striverId: rehashState.currentStriverEntry?.id || null,
      striverStep: rehashState.currentStriverEntry?.step || null,
      striverTopic: rehashState.currentStriverEntry?.topic || null,
      iteration,
      timeTakenMs: Math.max(0, Math.round(elapsedMs)),
      approach: shadow.getElementById("rehash-approach").value.trim(),
      mistakes: shadow.getElementById("rehash-mistakes").value.trim(),
      notes: shadow.getElementById("rehash-notes").value.trim(),
      confidence: shadow.getElementById("rehash-confidence").value,
      date: new Date().toISOString(),
      nextReviewDate,
      reviewDecision,
      site: problem.site,
      tags,
      notionOpened: rehashState.notionOpened,
      difficulty: problem.difficulty || "Unknown",
    };

    await sendRuntimeMessage({
      action: "SAVE_SESSION",
      session,
    });

    await refreshCurrentProblemSessions();
    renderStriverBannerWithRetry();
    await persistTimerState(createDefaultTimerState());
    syncTimerUi();
    showInlineToast(`Saved solve session - ${formatDurationLabelFromMs(elapsedMs)}`);
    closeSolvedModal();
  });
}

function renderIterationOption(iteration, selectedIteration, labelOverride) {
  const label = labelOverride || ordinalLabel(iteration);
  return `
    <label class="rehash-chip">
      <input type="radio" name="rehash-iteration" value="${iteration}" ${iteration === selectedIteration ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderScheduleOption(value, label, selected) {
  return `
    <label class="rehash-chip">
      <input type="radio" name="rehash-schedule" value="${escapeAttribute(value)}" ${selected ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function getSelectedIteration(shadowRoot) {
  const selected = shadowRoot.querySelector('input[name="rehash-iteration"]:checked');
  return selected ? parseInt(selected.value, 10) : 1;
}

function getSelectedSchedule(shadowRoot) {
  const selected = shadowRoot.querySelector('input[name="rehash-schedule"]:checked');
  return selected ? selected.value : null;
}

function buildIsoDateFromToday(daysAhead) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

async function openHistoryModal() {
  if (document.getElementById(REHASH_HISTORY_HOST_ID)) {
    return;
  }

  await refreshCurrentProblemSessions();
  const host = document.createElement("div");
  host.id = REHASH_HISTORY_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const sessions = rehashState.currentProblemSessions.slice().reverse();

  shadow.innerHTML = `
    <style>
      .rehash-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0, 0, 0, 0.45);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }

      .rehash-modal {
        width: min(540px, 100%);
        max-height: min(82vh, 720px);
        overflow-y: auto;
        background: #1a1a2e;
        color: #ffffff;
        border-radius: 18px;
        padding: 20px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      }

      .rehash-title {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 6px;
      }

      .rehash-copy {
        font-size: 13px;
        color: #d7dcef;
        margin-bottom: 14px;
      }

      .rehash-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .rehash-card {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.03);
      }

      .rehash-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 6px;
        font-size: 13px;
      }

      .rehash-meta {
        font-size: 12px;
        color: #c4c9df;
      }

      .rehash-note {
        margin-top: 6px;
        font-size: 12px;
        color: #ffffff;
        white-space: pre-wrap;
      }

      .rehash-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 14px;
      }

      .rehash-button {
        border: none;
        border-radius: 999px;
        padding: 10px 14px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        background: #3b4259;
        color: #ffffff;
      }
    </style>
    <div class="rehash-overlay">
      <div class="rehash-modal">
        <div class="rehash-title">Solve Records</div>
        <div class="rehash-copy">This shows saved sessions for the current problem. Use the ReHash popup for the full Queue and Stats.</div>
        <div class="rehash-list">
          ${sessions.length === 0 ? '<div class="rehash-copy">No solve records saved for this problem yet.</div>' : sessions.map(renderHistoryCard).join("")}
        </div>
        <div class="rehash-actions">
          <button class="rehash-button" id="rehash-history-close" type="button">Close</button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);
  shadow.getElementById("rehash-history-close").addEventListener("click", closeHistoryModal);
}

function renderHistoryCard(session) {
  const dateLabel = new Date(session.date).toLocaleString();
  return `
    <div class="rehash-card">
      <div class="rehash-row">
        <strong>${escapeHtml(formatIterationLabel(session.iteration || 1))}</strong>
        <strong>${escapeHtml(formatDurationLabelFromMs(getSessionTimeMs(session)))}</strong>
      </div>
      <div class="rehash-meta">${escapeHtml(dateLabel)}${session.confidence ? ` - ${escapeHtml(session.confidence)}` : ""}</div>
      ${session.approach ? `<div class="rehash-note"><strong>Approach:</strong> ${escapeHtml(session.approach)}</div>` : ""}
      ${session.mistakes ? `<div class="rehash-note"><strong>Mistakes:</strong> ${escapeHtml(session.mistakes)}</div>` : ""}
      ${(session.notes || session.note) ? `<div class="rehash-note"><strong>Notes:</strong> ${escapeHtml(session.notes || session.note)}</div>` : ""}
    </div>
  `;
}

function closeHistoryModal() {
  document.getElementById(REHASH_HISTORY_HOST_ID)?.remove();
}

function closeSolvedModal() {
  document.getElementById(REHASH_MODAL_HOST_ID)?.remove();
  rehashState.modalShown = false;
}

function formatTimer(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationLabelFromMs(totalMs) {
  const totalSeconds = Math.round(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatIterationLabel(iteration) {
  return iteration <= 1 ? "1st solve" : `${ordinalLabel(iteration)} revision`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}

function ordinalLabel(value) {
  if (value === 1) return "1st";
  if (value === 2) return "2nd";
  if (value === 3) return "3rd";
  return `${value}th`;
}

function getSessionTimeMs(session) {
  if (Number.isFinite(session.timeTakenMs)) {
    return session.timeTakenMs;
  }
  if (Number.isFinite(session.timeTaken)) {
    return session.timeTaken * 1000;
  }
  return 0;
}

function showInlineToast(message) {
  const existing = document.getElementById("rehash-inline-toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = "rehash-inline-toast";
  toast.textContent = message;
  toast.style.position = "fixed";
  toast.style.bottom = "24px";
  toast.style.right = "24px";
  toast.style.zIndex = "10001";
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "10px";
  toast.style.background = "#1f6feb";
  toast.style.color = "#fff";
  toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';
  toast.style.fontSize = "13px";
  toast.style.boxShadow = "0 10px 24px rgba(0,0,0,0.24)";
  document.documentElement.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2200);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeProblemUrlFallback(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const match = pathname.match(/^\/problems\/([^/]+)/i);
    if (match) {
      return `${parsed.origin}/problems/${match[1]}/`;
    }
    return `${parsed.origin}${pathname}/`;
  } catch {
    return url;
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => resolve(response));
  });
}

function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result));
  });
}

function storageSet(value) {
  return new Promise((resolve) => {
    chrome.storage.local.set(value, () => resolve());
  });
}
