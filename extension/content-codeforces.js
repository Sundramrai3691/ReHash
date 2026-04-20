const REHASH_CF_WIDGET_HOST_ID = "rehash-cf-timer-host";
const REHASH_CF_MODAL_HOST_ID = "rehash-cf-modal-host";
const REHASH_CF_ACTIVE_KEY = "rehash_active_codeforces_timer";

const rehashCfState = {
  acceptFlowPending: false,
  elapsedSeconds: 0,
  modalShown: false,
  notionOpened: false,
  observer: null,
  startTime: null,
  timerInterval: null,
  timerRunning: false,
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract_problem") {
    sendResponse(extractCodeforcesProblem());
  }
  return true;
});

initializeCodeforcesRehash().catch(() => {
  // Keep extraction working even if timer bootstrapping fails.
});

async function initializeCodeforcesRehash() {
  if (!document.body) {
    return;
  }

  if (isProblemPage()) {
    injectTimerWidget();
    updateWidgetProblem(extractCodeforcesProblem());
    await restoreTimerStateForCurrentProblem();
  }

  setupAcceptedObserver();
}

function extractCodeforcesProblem() {
  const title = extractTitle();
  const tags = extractTags();
  const difficulty = extractDifficulty();

  return {
    title,
    url: window.location.href,
    site: "codeforces",
    difficulty,
    tags,
  };
}

function extractTitle() {
  const selectors = [
    ".problem-statement .title",
    ".title",
    "div.header .title",
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  const title = document.title.trim();
  if (title && title !== "Codeforces") {
    return title.split(" - ")[0].trim();
  }

  return "Unknown Problem";
}

function extractTags() {
  const tags = [];
  const selectors = [
    ".problem-statement .tag-box",
    ".tag-box",
    ".roundbox .tags a",
    'a[href*="/problemset?tags="]',
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el) => {
      const text = el.textContent.trim();
      if (text && !text.startsWith("*") && !tags.includes(text)) {
        tags.push(text);
      }
    });

    if (tags.length > 0) break;
  }

  return tags.slice(0, 10);
}

function extractDifficulty() {
  const tagBoxes = document.querySelectorAll(".tag-box");
  for (const box of tagBoxes) {
    const text = `${box.textContent || ""} ${box.getAttribute("title") || ""}`;
    const ratingMatch = text.match(/\*\s*(\d{3,4})/);
    if (ratingMatch) {
      return ratingMatch[1];
    }
  }

  const ratingContainers = document.querySelectorAll(".roundbox, .property-title, .header .title");
  for (const element of ratingContainers) {
    const text = element.textContent.trim();
    if (/rating/i.test(text)) {
      const ratingMatch = text.match(/(\d{3,4})/);
      if (ratingMatch) {
        return ratingMatch[1];
      }
    }
  }

  return "Unknown";
}

function isProblemPage() {
  return (
    /^https:\/\/codeforces\.com\/problemset\/problem\/\d+\/[A-Za-z0-9]+/.test(window.location.href) ||
    /^https:\/\/codeforces\.com\/contest\/\d+\/problem\/[A-Za-z0-9]+/.test(window.location.href)
  );
}

function isSubmissionPage() {
  return /\/(status|submission|submissions)\b/.test(window.location.pathname);
}

function timerKeyForProblem(problemUrl) {
  return `timer_${problemUrl}`;
}

function injectTimerWidget() {
  if (document.getElementById(REHASH_CF_WIDGET_HOST_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = REHASH_CF_WIDGET_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      .rehash-widget {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 9999;
        width: 240px;
        background: #1a1a2e;
        color: #ffffff;
        border-radius: 12px;
        padding: 12px 16px;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
        font-size: 12px;
        line-height: 1.45;
      }

      .rehash-title {
        font-weight: 600;
        margin-bottom: 10px;
        max-height: 34px;
        overflow: hidden;
      }

      .rehash-controls {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .rehash-button {
        border: none;
        border-radius: 999px;
        background: #0f3460;
        color: #ffffff;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        padding: 7px 12px;
      }

      .rehash-button:hover {
        background: #17568c;
      }

      .rehash-button.stop {
        background: #b33939;
      }

      .rehash-button.stop:hover {
        background: #cf4a4a;
      }

      .rehash-timer {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.04em;
        min-width: 58px;
        text-align: right;
      }
    </style>
    <div class="rehash-widget">
      <div class="rehash-title" id="rehash-problem-title">Loading problem...</div>
      <div class="rehash-controls">
        <button class="rehash-button" id="rehash-toggle-button">▶ Start Timer</button>
        <div class="rehash-timer" id="rehash-timer-display">00:00</div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);

  shadow.getElementById("rehash-toggle-button").addEventListener("click", () => {
    if (rehashCfState.timerRunning) {
      stopTimer({ showModal: true });
    } else {
      startTimer();
    }
  });
}

function updateWidgetProblem(problem) {
  const host = document.getElementById(REHASH_CF_WIDGET_HOST_ID);
  const titleEl = host?.shadowRoot?.getElementById("rehash-problem-title");
  if (titleEl) {
    titleEl.textContent = problem.title || "Unknown Problem";
  }
}

function updateTimerDisplay(totalSeconds) {
  const host = document.getElementById(REHASH_CF_WIDGET_HOST_ID);
  const timerEl = host?.shadowRoot?.getElementById("rehash-timer-display");
  if (timerEl) {
    timerEl.textContent = formatTimer(totalSeconds);
  }
}

function updateTimerButton() {
  const host = document.getElementById(REHASH_CF_WIDGET_HOST_ID);
  const button = host?.shadowRoot?.getElementById("rehash-toggle-button");
  if (!button) {
    return;
  }

  button.textContent = rehashCfState.timerRunning ? "⏹ Stop" : "▶ Start Timer";
  button.classList.toggle("stop", rehashCfState.timerRunning);
}

async function restoreTimerStateForCurrentProblem() {
  const problem = extractCodeforcesProblem();
  const timerKey = timerKeyForProblem(problem.url);
  const saved = await storageGet(timerKey);
  const timerState = saved[timerKey];

  if (!timerState) {
    updateTimerButton();
    updateTimerDisplay(0);
    return;
  }

  if (timerState.problemTitle) {
    updateWidgetProblem({ title: timerState.problemTitle });
  }

  if (timerState.running && timerState.startTime) {
    rehashCfState.startTime = timerState.startTime;
    rehashCfState.timerRunning = true;
    await storageSet({
      [REHASH_CF_ACTIVE_KEY]: {
        difficulty: timerState.difficulty || problem.difficulty,
        problemTitle: timerState.problemTitle,
        site: "codeforces",
        tags: timerState.tags || problem.tags,
        timerKey,
        url: problem.url,
      },
    });
    beginTimerTick();
  } else {
    rehashCfState.elapsedSeconds = timerState.elapsedSeconds || 0;
    updateTimerDisplay(rehashCfState.elapsedSeconds);
  }

  updateTimerButton();
}

async function startTimer() {
  if (!isProblemPage()) {
    return;
  }

  const problem = extractCodeforcesProblem();
  const timerKey = timerKeyForProblem(problem.url);
  updateWidgetProblem(problem);

  rehashCfState.elapsedSeconds = 0;
  rehashCfState.modalShown = false;
  rehashCfState.notionOpened = false;
  rehashCfState.startTime = Date.now();
  rehashCfState.timerRunning = true;

  await storageSet({
    [timerKey]: {
      difficulty: problem.difficulty,
      elapsedSeconds: 0,
      problemTitle: problem.title,
      running: true,
      site: problem.site,
      startTime: rehashCfState.startTime,
      tags: problem.tags,
      url: problem.url,
    },
    [REHASH_CF_ACTIVE_KEY]: {
      difficulty: problem.difficulty,
      problemTitle: problem.title,
      site: problem.site,
      tags: problem.tags,
      timerKey,
      url: problem.url,
    },
  });

  beginTimerTick();
  updateTimerButton();
}

function beginTimerTick() {
  clearInterval(rehashCfState.timerInterval);

  const tick = () => {
    if (!rehashCfState.startTime) {
      return;
    }

    rehashCfState.elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - rehashCfState.startTime) / 1000),
    );
    updateTimerDisplay(rehashCfState.elapsedSeconds);
  };

  tick();
  rehashCfState.timerInterval = window.setInterval(tick, 1000);
}

async function stopTimer({ showModal, problem, timerState }) {
  const activeProblem = problem || (await getActiveProblemContext());
  if (!activeProblem) {
    return;
  }

  const timerKey = timerKeyForProblem(activeProblem.url);
  const savedState = timerState || (await storageGet(timerKey))[timerKey];

  if (!savedState && !rehashCfState.timerRunning && rehashCfState.elapsedSeconds === 0) {
    return;
  }

  if (savedState?.running && savedState.startTime) {
    rehashCfState.elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - savedState.startTime) / 1000),
    );
  } else if (rehashCfState.timerRunning && rehashCfState.startTime) {
    rehashCfState.elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - rehashCfState.startTime) / 1000),
    );
  } else {
    rehashCfState.elapsedSeconds = savedState?.elapsedSeconds || rehashCfState.elapsedSeconds;
  }

  clearInterval(rehashCfState.timerInterval);
  rehashCfState.timerInterval = null;
  rehashCfState.timerRunning = false;
  rehashCfState.startTime = null;

  await storageSet({
    [timerKey]: {
      difficulty: activeProblem.difficulty,
      elapsedSeconds: rehashCfState.elapsedSeconds,
      problemTitle: activeProblem.title,
      running: false,
      site: activeProblem.site,
      tags: activeProblem.tags,
      url: activeProblem.url,
    },
    [REHASH_CF_ACTIVE_KEY]: {
      difficulty: activeProblem.difficulty,
      problemTitle: activeProblem.title,
      site: activeProblem.site,
      tags: activeProblem.tags,
      timerKey,
      url: activeProblem.url,
    },
  });

  updateTimerDisplay(rehashCfState.elapsedSeconds);
  updateTimerButton();

  if (showModal) {
    await openSolvedModal(activeProblem, rehashCfState.elapsedSeconds);
  }
}

function setupAcceptedObserver() {
  if (rehashCfState.observer || !document.body) {
    return;
  }

  rehashCfState.observer = new MutationObserver(() => {
    void handleAcceptedFlow();
  });

  rehashCfState.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  if (isSubmissionPage()) {
    void handleAcceptedFlow();
  }
}

async function handleAcceptedFlow() {
  if (rehashCfState.acceptFlowPending || rehashCfState.modalShown || !hasAcceptedVerdict()) {
    return;
  }

  rehashCfState.acceptFlowPending = true;

  try {
    const activeProblem = await getActiveProblemContext();
    if (!activeProblem) {
      return;
    }

    const timerKey = timerKeyForProblem(activeProblem.url);
    const timerState = (await storageGet(timerKey))[timerKey];
    if (!timerState || (!timerState.running && !timerState.elapsedSeconds)) {
      return;
    }

    await stopTimer({
      problem: activeProblem,
      showModal: true,
      timerState,
    });
  } finally {
    rehashCfState.acceptFlowPending = false;
  }
}

function hasAcceptedVerdict() {
  if (document.querySelector(".verdict-accepted")) {
    return true;
  }

  if (isSubmissionPage() && /accepted/i.test(document.body?.innerText || "")) {
    return true;
  }

  return false;
}

async function getActiveProblemContext() {
  if (isProblemPage()) {
    return extractCodeforcesProblem();
  }

  const stored = await storageGet(REHASH_CF_ACTIVE_KEY);
  const active = stored[REHASH_CF_ACTIVE_KEY];
  if (!active || !active.url) {
    return null;
  }

  return {
    difficulty: active.difficulty || "Unknown",
    site: "codeforces",
    tags: Array.isArray(active.tags) ? active.tags : [],
    title: active.problemTitle || "Unknown Problem",
    url: active.url,
  };
}

async function openSolvedModal(problem, elapsedSeconds) {
  if (rehashCfState.modalShown || document.getElementById(REHASH_CF_MODAL_HOST_ID)) {
    return;
  }

  rehashCfState.modalShown = true;
  rehashCfState.notionOpened = false;

  const response = await sendRuntimeMessage({ action: "GET_NOTION_URL" });
  const notionUrl = response?.notionUrl || "https://www.notion.so";
  const host = document.createElement("div");
  host.id = REHASH_CF_MODAL_HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const tags = Array.isArray(problem.tags) ? problem.tags : [];

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
        width: min(420px, 100%);
        background: #1a1a2e;
        color: #ffffff;
        border-radius: 16px;
        padding: 20px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.32);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      }

      .rehash-heading {
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 8px;
      }

      .rehash-subtitle,
      .rehash-time,
      .rehash-tags {
        font-size: 13px;
        margin-bottom: 10px;
        color: #e4e6f0;
      }

      .rehash-textarea {
        width: 100%;
        min-height: 96px;
        border: 1px solid #34495e;
        border-radius: 12px;
        padding: 12px;
        background: #111827;
        color: #ffffff;
        font: inherit;
        resize: vertical;
        box-sizing: border-box;
        margin-bottom: 14px;
      }

      .rehash-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }

      .rehash-action {
        border: none;
        border-radius: 999px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        padding: 10px 14px;
      }

      .rehash-action.notion {
        background: #ffffff;
        color: #111827;
      }

      .rehash-action.save {
        background: #4caf50;
        color: #ffffff;
      }
    </style>
    <div class="rehash-overlay">
      <div class="rehash-modal">
        <div class="rehash-heading">✅ Problem Solved!</div>
        <div class="rehash-subtitle">${escapeHtml(problem.title)}</div>
        <div class="rehash-time">Time: ${formatDurationLabel(elapsedSeconds)}</div>
        <div class="rehash-tags">Topics: ${escapeHtml(tags.join(", ") || "None")}</div>
        <textarea class="rehash-textarea" id="rehash-note-input" placeholder="Quick note / mistake? (optional)"></textarea>
        <div class="rehash-actions">
          <button class="rehash-action notion" id="rehash-open-notion">📝 Open Notion Log</button>
          <button class="rehash-action save" id="rehash-save-close">✔ Save & Close</button>
        </div>
      </div>
    </div>
  `;

  document.documentElement.appendChild(host);

  shadow.getElementById("rehash-open-notion").addEventListener("click", async () => {
    await sendRuntimeMessage({ action: "OPEN_NOTION_URL", url: notionUrl });
    rehashCfState.notionOpened = true;
  });

  shadow.getElementById("rehash-save-close").addEventListener("click", async () => {
    const note = shadow.getElementById("rehash-note-input").value.trim();
    await sendRuntimeMessage({
      action: "SAVE_SESSION",
      session: {
        date: new Date().toISOString(),
        notionOpened: rehashCfState.notionOpened,
        note,
        problemTitle: problem.title,
        site: problem.site,
        tags,
        timeTaken: elapsedSeconds,
        url: problem.url,
      },
    });

    await clearTimerState(problem.url);
    closeSolvedModal();
  });
}

async function clearTimerState(problemUrl) {
  clearInterval(rehashCfState.timerInterval);
  rehashCfState.timerInterval = null;
  rehashCfState.timerRunning = false;
  rehashCfState.startTime = null;
  rehashCfState.elapsedSeconds = 0;
  updateTimerButton();
  updateTimerDisplay(0);

  const timerKey = timerKeyForProblem(problemUrl);
  await storageRemove([timerKey, REHASH_CF_ACTIVE_KEY]);
}

function closeSolvedModal() {
  document.getElementById(REHASH_CF_MODAL_HOST_ID)?.remove();
  rehashCfState.modalShown = false;
}

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDurationLabel(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function storageRemove(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, () => resolve());
  });
}
