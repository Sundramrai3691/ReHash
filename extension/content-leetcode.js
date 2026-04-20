const REHASH_TIMER_KEY = `timer_${window.location.href}`;
const REHASH_WIDGET_HOST_ID = "rehash-timer-host";
const REHASH_MODAL_HOST_ID = "rehash-modal-host";

const rehashState = {
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
    sendResponse(extractLeetCodeProblem());
  }
  return true;
});

initializeRehashTimer().catch(() => {
  // Keep the page usable even if timer setup fails.
});

async function initializeRehashTimer() {
  if (!document.body || document.getElementById(REHASH_WIDGET_HOST_ID)) {
    return;
  }

  injectTimerWidget();
  updateWidgetProblem(extractLeetCodeProblem());
  await restoreTimerState();
  setupAcceptedObserver();
}

function extractLeetCodeProblem() {
  const title = extractTitle();
  const difficulty = extractDifficulty();
  const tags = extractTags();

  return {
    title,
    url: window.location.href,
    site: "leetcode",
    difficulty,
    tags,
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
    elements.forEach((el) => {
      const text = el.textContent.trim();
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
    if (rehashState.timerRunning) {
      stopTimer({ showModal: true });
    } else {
      startTimer();
    }
  });
}

function updateWidgetProblem(problem) {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const titleEl = host?.shadowRoot?.getElementById("rehash-problem-title");
  if (titleEl) {
    titleEl.textContent = problem.title || "Unknown Problem";
  }
}

function updateTimerDisplay(totalSeconds) {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const timerEl = host?.shadowRoot?.getElementById("rehash-timer-display");
  if (timerEl) {
    timerEl.textContent = formatTimer(totalSeconds);
  }
}

function updateTimerButton() {
  const host = document.getElementById(REHASH_WIDGET_HOST_ID);
  const button = host?.shadowRoot?.getElementById("rehash-toggle-button");
  if (!button) {
    return;
  }

  button.textContent = rehashState.timerRunning ? "⏹ Stop" : "▶ Start Timer";
  button.classList.toggle("stop", rehashState.timerRunning);
}

async function restoreTimerState() {
  const saved = await storageGet(REHASH_TIMER_KEY);
  const timerState = saved[REHASH_TIMER_KEY];

  if (!timerState) {
    updateTimerButton();
    updateTimerDisplay(0);
    return;
  }

  if (timerState.problemTitle) {
    updateWidgetProblem({ title: timerState.problemTitle });
  }

  if (timerState.running && timerState.startTime) {
    rehashState.startTime = timerState.startTime;
    rehashState.timerRunning = true;
    beginTimerTick();
  } else {
    rehashState.elapsedSeconds = timerState.elapsedSeconds || 0;
    updateTimerDisplay(rehashState.elapsedSeconds);
  }

  updateTimerButton();
}

async function startTimer() {
  const problem = extractLeetCodeProblem();
  updateWidgetProblem(problem);

  rehashState.elapsedSeconds = 0;
  rehashState.modalShown = false;
  rehashState.notionOpened = false;
  rehashState.startTime = Date.now();
  rehashState.timerRunning = true;

  await storageSet({
    [REHASH_TIMER_KEY]: {
      elapsedSeconds: 0,
      problemTitle: problem.title,
      running: true,
      site: problem.site,
      startTime: rehashState.startTime,
      tags: problem.tags,
      url: problem.url,
    },
  });

  beginTimerTick();
  updateTimerButton();
}

function beginTimerTick() {
  clearInterval(rehashState.timerInterval);

  const tick = () => {
    if (!rehashState.startTime) {
      return;
    }

    rehashState.elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - rehashState.startTime) / 1000),
    );
    updateTimerDisplay(rehashState.elapsedSeconds);
  };

  tick();
  rehashState.timerInterval = window.setInterval(tick, 1000);
}

async function stopTimer({ showModal }) {
  if (!rehashState.timerRunning && rehashState.elapsedSeconds === 0) {
    return;
  }

  if (rehashState.timerRunning && rehashState.startTime) {
    rehashState.elapsedSeconds = Math.max(
      0,
      Math.floor((Date.now() - rehashState.startTime) / 1000),
    );
  }

  clearInterval(rehashState.timerInterval);
  rehashState.timerInterval = null;
  rehashState.timerRunning = false;
  rehashState.startTime = null;

  const problem = extractLeetCodeProblem();
  await storageSet({
    [REHASH_TIMER_KEY]: {
      elapsedSeconds: rehashState.elapsedSeconds,
      problemTitle: problem.title,
      running: false,
      site: problem.site,
      tags: problem.tags,
      url: problem.url,
    },
  });

  updateTimerDisplay(rehashState.elapsedSeconds);
  updateTimerButton();

  if (showModal) {
    await openSolvedModal(problem, rehashState.elapsedSeconds);
  }
}

function setupAcceptedObserver() {
  if (rehashState.observer || !document.body) {
    return;
  }

  rehashState.observer = new MutationObserver(() => {
    if (rehashState.modalShown || (!rehashState.timerRunning && rehashState.elapsedSeconds === 0)) {
      return;
    }

    if (hasAcceptedVerdict()) {
      stopTimer({ showModal: true });
    }
  });

  rehashState.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function hasAcceptedVerdict() {
  const verdict = document.querySelector('[data-e2e-locator="submission-result"]');
  if (verdict && verdict.textContent.toLowerCase().includes("accepted")) {
    return true;
  }

  return Array.from(document.querySelectorAll("div")).some((div) =>
    div.textContent && div.textContent.trim().toLowerCase() === "accepted",
  );
}

async function openSolvedModal(problem, elapsedSeconds) {
  if (rehashState.modalShown || document.getElementById(REHASH_MODAL_HOST_ID)) {
    return;
  }

  rehashState.modalShown = true;
  rehashState.notionOpened = false;

  const response = await sendRuntimeMessage({ action: "GET_NOTION_URL" });
  const notionUrl = response?.notionUrl || "https://www.notion.so";
  const host = document.createElement("div");
  host.id = REHASH_MODAL_HOST_ID;
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
    rehashState.notionOpened = true;
  });

  shadow.getElementById("rehash-save-close").addEventListener("click", async () => {
    const note = shadow.getElementById("rehash-note-input").value.trim();
    await sendRuntimeMessage({
      action: "SAVE_SESSION",
      session: {
        date: new Date().toISOString(),
        notionOpened: rehashState.notionOpened,
        note,
        problemTitle: problem.title,
        site: problem.site,
        tags,
        timeTaken: elapsedSeconds,
        url: problem.url,
      },
    });

    await clearTimerState();
    closeSolvedModal();
  });
}

async function clearTimerState() {
  clearInterval(rehashState.timerInterval);
  rehashState.timerInterval = null;
  rehashState.timerRunning = false;
  rehashState.startTime = null;
  rehashState.elapsedSeconds = 0;
  updateTimerButton();
  updateTimerDisplay(0);
  await storageRemove(REHASH_TIMER_KEY);
}

function closeSolvedModal() {
  document.getElementById(REHASH_MODAL_HOST_ID)?.remove();
  rehashState.modalShown = false;
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
