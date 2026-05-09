const DEFAULT_NOTION_URL = "https://www.notion.so";

let currentProblems = {};
let currentSolvedSessions = [];
let currentExtractedProblem = null;
let currentEditingId = null;
let currentSettings = null;
let activeTagFilter = "All";
let currentSearchTerm = "";

document.addEventListener("DOMContentLoaded", () => {
  initializeTabs();
  initializeFilters();
  initializeActions();
  void loadPopupData();
  void tryExtractProblem();
});

function initializeTabs() {
  const tabButtons = document.querySelectorAll(".tab-btn");
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((tabButton) => tabButton.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((content) => content.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(`${button.dataset.tab}Tab`).classList.add("active");
    });
  });
}

function initializeFilters() {
  document.getElementById("problemSearchInput").addEventListener("input", (event) => {
    currentSearchTerm = event.target.value.trim().toLowerCase();
    renderAllList();
  });
}

function initializeActions() {
  document.getElementById("saveBtn").addEventListener("click", () => {
    void saveExtractedProblem();
  });
  document.getElementById("manualSaveBtn").addEventListener("click", () => {
    void saveManualProblem();
  });
  document.getElementById("exportBtn").addEventListener("click", exportCSV);
  document.getElementById("settingsBtn").addEventListener("click", () => openTab("settings"));
  document.getElementById("saveNotesBtn").addEventListener("click", () => {
    void saveNotes();
  });
  document.getElementById("cancelNotesBtn").addEventListener("click", closeNotesModal);
  document.getElementById("saveSettingsBtn").addEventListener("click", () => {
    void saveSettings();
  });
  document.getElementById("syncNowBtn").addEventListener("click", () => {
    void syncNow();
  });
}

async function loadPopupData() {
  await Promise.all([loadProblems(), loadSolvedSessions(), loadSettings()]);
  renderTodayList();
  renderQueueList();
  renderAllList();
  renderStats();
  renderSettings();
  updateProgress();
}

async function loadProblems() {
  const response = await chrome.runtime.sendMessage({ action: "get_all_problems" });
  currentProblems = response || {};
}

async function loadSolvedSessions() {
  const data = await chrome.storage.local.get("solvedSessions");
  currentSolvedSessions = Array.isArray(data.solvedSessions) ? data.solvedSessions : [];
}

async function loadSettings() {
  const [settings, notionData] = await Promise.all([
    chrome.runtime.sendMessage({ action: "get_settings" }),
    chrome.storage.local.get("notionUrl"),
  ]);

  currentSettings = {
    ...(settings || {}),
    notionUrl: notionData.notionUrl || DEFAULT_NOTION_URL,
  };
}

function renderTodayList() {
  const todayList = document.getElementById("todayList");
  const todayEmpty = document.getElementById("todayEmpty");
  const todayProblems = getDueProblems();

  if (todayProblems.length === 0) {
    todayList.innerHTML = "";
    todayEmpty.style.display = "block";
    return;
  }

  todayEmpty.style.display = "none";
  todayList.innerHTML = todayProblems
    .sort((first, second) => getProblemDueTimestamp(first) - getProblemDueTimestamp(second))
    .map((problem) => renderProblemCard(problem))
    .join("");
  attachProblemEventListeners(todayList);
}

function renderQueueList() {
  const queueList = document.getElementById("queueList");
  const queueEmpty = document.getElementById("queueEmpty");
  const queueProblems = getSortedQueueProblems();
  const solvedTodayUrls = getSolvedTodayUrlSet();
  const solvedTodayCount = queueProblems.filter((problem) => solvedTodayUrls.has(normalizeProblemUrl(problem.url))).length;

  document.getElementById("queueCount").textContent = `${queueProblems.length} problem${queueProblems.length === 1 ? "" : "s"} due today`;
  document.getElementById("queueProgressText").textContent = `${solvedTodayCount}/${queueProblems.length || 0} solved today`;
  document.getElementById("queueProgressFill").style.width = queueProblems.length === 0
    ? "0%"
    : `${Math.round((solvedTodayCount / queueProblems.length) * 100)}%`;

  if (queueProblems.length === 0) {
    queueList.innerHTML = "";
    queueEmpty.style.display = "block";
    return;
  }

  queueEmpty.style.display = "none";
  queueList.innerHTML = queueProblems.map((problem) => renderQueueCard(problem)).join("");
  queueList.querySelectorAll(".btn-open-problem").forEach((button) => {
    button.addEventListener("click", () => {
      void chrome.tabs.create({ url: button.dataset.url });
    });
  });
}

function renderAllList() {
  const allList = document.getElementById("allList");
  const allEmpty = document.getElementById("allEmpty");
  const filteredProblems = getFilteredProblems();

  renderTagFilters();

  if (filteredProblems.length === 0) {
    allList.innerHTML = "";
    allEmpty.style.display = "block";
    allEmpty.textContent = Object.keys(currentProblems).length === 0
      ? "No problems saved yet."
      : "No problems match the current filters.";
    return;
  }

  allEmpty.style.display = "none";
  allList.innerHTML = filteredProblems
    .sort((first, second) => getProblemDueTimestamp(first) - getProblemDueTimestamp(second))
    .map((problem) => renderProblemCard(problem))
    .join("");
  attachProblemEventListeners(allList);
}

function renderProblemCard(problem) {
  const difficultyClass = getDifficultyClass(problem.difficulty);
  const reviewLabel = formatProblemReviewLabel(problem);
  const topics = Array.isArray(problem.topics) ? problem.topics.slice(0, 3).join(", ") : "";
  const stepLabel = getProblemStepLabel(problem);

  return `
    <div class="problem-card" data-id="${escapeAttribute(problem.id)}">
      <div class="problem-header">
        <a href="${escapeAttribute(problem.url)}" target="_blank" class="problem-title">${escapeHtml(problem.title)}</a>
        <span class="problem-site">${escapeHtml(problem.site)}</span>
      </div>
      <div class="problem-meta">
        <span class="difficulty ${difficultyClass}">${escapeHtml(problem.difficulty || "Unknown")}</span>
        <span class="bucket">Bucket ${escapeHtml(String(problem.bucketIndex ?? 0))}</span>
        <span class="review-date">${escapeHtml(reviewLabel)}</span>
        <span class="problem-pill">Iter ${escapeHtml(String(problem.iterationCount || 0))}</span>
      </div>
      ${stepLabel ? `<div class="problem-subtle">${escapeHtml(stepLabel)}</div>` : ""}
      <div class="problem-topics">${escapeHtml(topics || "None")}</div>
      ${problem.notes ? `<div class="problem-notes">${escapeHtml(problem.notes)}</div>` : ""}
      <div class="problem-actions">
        ${!problem.completed ? `<button class="btn-sm btn-revised" data-id="${escapeAttribute(problem.id)}">Mark Revised</button>` : ""}
        <button class="btn-sm btn-move" data-id="${escapeAttribute(problem.id)}">Move</button>
        <button class="btn-sm btn-notes" data-id="${escapeAttribute(problem.id)}">Edit Notes</button>
        <button class="btn-sm btn-delete" data-id="${escapeAttribute(problem.id)}">Delete</button>
      </div>
    </div>
  `;
}

function renderQueueCard(problem) {
  const difficultyClass = getDifficultyClass(problem.difficulty);
  const dueTimestamp = getProblemDueTimestamp(problem);
  const overdueDays = getOverdueDays(dueTimestamp);
  const badgeClass = overdueDays > 0 ? "overdue" : "due";
  const badgeText = overdueDays > 0
    ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`
    : "Due today";
  const stepLabel = getProblemStepLabel(problem) || "No Striver step";

  return `
    <div class="queue-card">
      <div class="queue-header">
        <div>
          <a href="${escapeAttribute(problem.url)}" target="_blank" class="problem-title">${escapeHtml(problem.title)}</a>
          <div class="queue-topics">${escapeHtml((problem.topics || []).slice(0, 4).join(", ") || "No topics")}</div>
        </div>
        <span class="queue-step">${escapeHtml(stepLabel)}</span>
      </div>
      <div class="queue-meta">
        <span class="queue-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
        <span class="difficulty ${difficultyClass}">${escapeHtml(problem.difficulty || "Unknown")}</span>
        <span class="queue-iteration">Iteration ${escapeHtml(String(Math.max(1, problem.iterationCount || 1)))}</span>
      </div>
      <div class="queue-actions">
        <button class="btn-sm btn-open btn-open-problem" data-url="${escapeAttribute(problem.url)}">Solve Now</button>
      </div>
    </div>
  `;
}

function renderTagFilters() {
  const filterBar = document.getElementById("tagFilterBar");
  const tags = getAllUniqueTags();

  if (activeTagFilter !== "All" && !tags.includes(activeTagFilter)) {
    activeTagFilter = "All";
  }

  filterBar.innerHTML = ["All", ...tags]
    .map((tag) => `
      <button
        class="filter-chip ${tag === activeTagFilter ? "active" : ""}"
        data-tag="${escapeAttribute(tag)}"
      >
        ${escapeHtml(tag)}
      </button>
    `)
    .join("");

  filterBar.querySelectorAll(".filter-chip").forEach((button) => {
    button.addEventListener("click", () => {
      activeTagFilter = button.dataset.tag;
      renderAllList();
    });
  });
}

function renderStats() {
  const totalSolved = currentSolvedSessions.length;
  const weekCount = getThisWeekCount();
  const averageTime = totalSolved === 0
    ? "0m 0s"
    : formatDurationMs(
      Math.round(
        currentSolvedSessions.reduce((sum, session) => sum + getSessionTimeMs(session), 0) / totalSolved,
      ),
    );
  const streak = calculateStreak();
  const notionRate = totalSolved === 0
    ? "0%"
    : `${Math.round((currentSolvedSessions.filter((session) => Boolean(session.notionOpened)).length / totalSolved) * 100)}%`;
  const improvementStats = getImprovementStats();
  const topicAverages = getTopicAverageTimes().sort((first, second) => first.averageTime - second.averageTime);

  document.getElementById("statsTotalSolved").textContent = String(totalSolved);
  document.getElementById("statsWeekCount").textContent = String(weekCount);
  document.getElementById("statsAverageTime").textContent = averageTime;
  document.getElementById("statsStreak").textContent = `${streak} day${streak === 1 ? "" : "s"}`;
  document.getElementById("statsNotionRate").textContent = notionRate;
  document.getElementById("statsAverageImprovement").textContent = `${Math.round(improvementStats.averageImprovement)}%`;
  document.getElementById("statsFastestTopic").textContent = topicAverages[0]
    ? `${topicAverages[0].tag} (${formatDurationMs(Math.round(topicAverages[0].averageTime))})`
    : "-";
  document.getElementById("statsSlowestTopic").textContent = topicAverages.at(-1)
    ? `${topicAverages.at(-1).tag} (${formatDurationMs(Math.round(topicAverages.at(-1).averageTime))})`
    : "-";

  renderSlowestTopics();
  renderSlowerProblems(improvementStats.slowerProblems);
  renderTopicBreakdown();
  renderSpeedProgress();
}

function renderSlowestTopics() {
  const container = document.getElementById("slowestTopics");
  const averages = getTopicAverageTimes()
    .sort((first, second) => second.averageTime - first.averageTime)
    .slice(0, 3);

  if (averages.length === 0) {
    container.innerHTML = '<p class="stats-empty">No solve data yet.</p>';
    return;
  }

  container.innerHTML = averages
    .map((item) => `<div class="stats-row"><span>${escapeHtml(item.tag)}</span><strong>${escapeHtml(formatDurationMs(Math.round(item.averageTime)))}</strong></div>`)
    .join("");
}

function renderSlowerProblems(slowerProblems) {
  const container = document.getElementById("slowerProblems");

  if (slowerProblems.length === 0) {
    container.innerHTML = '<p class="stats-empty">No regressions right now.</p>';
    return;
  }

  container.innerHTML = slowerProblems
    .map((item) => `<div class="stats-row"><span>${escapeHtml(item.title)}</span><strong>${escapeHtml(item.label)}</strong></div>`)
    .join("");
}

function renderTopicBreakdown() {
  const container = document.getElementById("topicBreakdown");
  const breakdown = getTopicCounts();
  const rows = Object.entries(breakdown).sort((first, second) => second[1] - first[1]);

  if (rows.length === 0) {
    container.innerHTML = '<p class="stats-empty">No topics logged yet.</p>';
    return;
  }

  container.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Topic</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([tag, count]) => `<tr><td>${escapeHtml(tag)}</td><td>${escapeHtml(String(count))}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderSpeedProgress() {
  const container = document.getElementById("speedProgressList");
  const groups = getGroupedSessionsByProblem().filter((group) => group.sessions.length >= 2);

  if (groups.length === 0) {
    container.innerHTML = '<p class="stats-empty">Need at least two solve sessions on a problem to chart progress.</p>';
    return;
  }

  container.innerHTML = groups
    .map((group) => renderSpeedCard(group))
    .join("");
}

function renderSpeedCard(group) {
  const times = group.sessions.map((session) => getSessionTimeMs(session));
  const chart = renderSpeedChartSvg(times);
  const trend = getSpeedTrend(group.sessions);

  return `
    <div class="speed-card">
      <div class="speed-card-header">
        <div class="speed-card-title">${escapeHtml(group.title)}</div>
        <div class="speed-trend ${escapeAttribute(trend.className)}">${escapeHtml(trend.label)}</div>
      </div>
      ${chart}
      <details class="speed-details">
        <summary>Approach and mistakes per iteration</summary>
        <div class="speed-details-list">
          ${group.sessions.map((session, index) => `
            <div class="speed-detail-row">
              <strong>Iteration ${escapeHtml(String(session.iteration || index + 1))} - ${escapeHtml(formatDurationMs(getSessionTimeMs(session)))}</strong>
              <div>Approach: ${escapeHtml(session.approach || "Not logged")}</div>
              <div>Mistakes: ${escapeHtml(session.mistakes || "Not logged")}</div>
              <div>Notes: ${escapeHtml((session.notes || session.note || "").trim() || "Not logged")}</div>
            </div>
          `).join("")}
        </div>
      </details>
    </div>
  `;
}

function renderSpeedChartSvg(times) {
  const maxTime = Math.max(...times, 1);
  const barWidth = 40;
  const gap = 14;
  const chartHeight = 84;
  const width = times.length * (barWidth + gap) + 12;

  const bars = times.map((time, index) => {
    const height = Math.max(8, Math.round((time / maxTime) * 60));
    const x = 10 + index * (barWidth + gap);
    const y = chartHeight - height - 18;
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${height}" rx="8" fill="#1976d2"></rect>
      <text x="${x + barWidth / 2}" y="${chartHeight - 4}" font-size="10" text-anchor="middle" fill="#555">I${index + 1}</text>
      <text x="${x + barWidth / 2}" y="${y - 4}" font-size="10" text-anchor="middle" fill="#333">${escapeHtml(formatCompactDuration(time))}</text>
    `;
  }).join("");

  return `
    <svg width="100%" viewBox="0 0 ${width} ${chartHeight}" aria-label="Solve time chart">
      <line x1="0" y1="${chartHeight - 18}" x2="${width}" y2="${chartHeight - 18}" stroke="#d9d9d9" />
      ${bars}
    </svg>
  `;
}

function renderSettings() {
  if (!currentSettings) {
    return;
  }

  document.getElementById("intervalsInput").value = (currentSettings.intervals || []).join(",");
  document.getElementById("reminderHourInput").value = currentSettings.reminderHour ?? 19;
  document.getElementById("syncHourInput").value = currentSettings.syncHour ?? 21;
  document.getElementById("notionUrlInput").value = currentSettings.notionUrl || DEFAULT_NOTION_URL;
  document.getElementById("githubTokenInput").value = currentSettings.githubToken || "";
  document.getElementById("githubGistIdInput").value = currentSettings.githubGistId || "";
  document.getElementById("githubAutoSyncInput").checked = Boolean(currentSettings.githubAutoSync);
  document.getElementById("gemini-key").value = currentSettings.geminiKey || "";
  document.getElementById("groq-key").value = currentSettings.groqKey || "";
  document.getElementById("openrouter-key").value = currentSettings.openrouterKey || "";
  document.getElementById("auto-review-on-accept").checked = currentSettings.autoReviewOnAccept !== false;
  document.getElementById("lastSyncStatus").textContent = currentSettings.githubLastSyncAt
    ? `Last sync: ${new Date(currentSettings.githubLastSyncAt).toLocaleString()}`
    : "Last sync: never";
}

function attachProblemEventListeners(container) {
  container.querySelectorAll(".btn-revised").forEach((button) => {
    button.addEventListener("click", () => {
      void markRevised(button.dataset.id);
    });
  });

  container.querySelectorAll(".btn-move").forEach((button) => {
    button.addEventListener("click", () => {
      void moveBucket(button.dataset.id);
    });
  });

  container.querySelectorAll(".btn-notes").forEach((button) => {
    button.addEventListener("click", () => openNotesModal(button.dataset.id));
  });

  container.querySelectorAll(".btn-delete").forEach((button) => {
    button.addEventListener("click", () => {
      void deleteProblem(button.dataset.id);
    });
  });
}

function getDueProblems() {
  const todayEnd = getEndOfDay();
  const todayIso = new Date(todayEnd).toISOString().slice(0, 10);
  const byUrl = new Map();

  Object.values(currentProblems).forEach((problem) => {
    const nextReviewAt = Number.isFinite(problem.nextReviewAt) ? problem.nextReviewAt : null;
    const nextReviewDate = problem.nextReviewDate || null;
    const bucketDue = nextReviewAt !== null && nextReviewAt <= todayEnd;
    const customDue = nextReviewDate && nextReviewDate <= todayIso;

    if (!problem.completed && (bucketDue || customDue)) {
      byUrl.set(normalizeProblemUrl(problem.url), problem);
    }
  });

  return Array.from(byUrl.values());
}

function getSortedQueueProblems() {
  return getDueProblems().sort((first, second) => {
    const firstDue = getProblemDueTimestamp(first);
    const secondDue = getProblemDueTimestamp(second);

    if (firstDue !== secondDue) {
      return firstDue - secondDue;
    }

    const firstStep = getProblemStepOrder(first);
    const secondStep = getProblemStepOrder(second);
    if (firstStep !== secondStep) {
      return firstStep - secondStep;
    }

    return first.title.localeCompare(second.title);
  });
}

function getFilteredProblems() {
  return Object.values(currentProblems).filter((problem) => {
    const topicMatches = activeTagFilter === "All" ||
      (Array.isArray(problem.topics) && problem.topics.includes(activeTagFilter));
    const searchMatches = currentSearchTerm === "" ||
      problem.title.toLowerCase().includes(currentSearchTerm);

    return topicMatches && searchMatches;
  });
}

function getAllUniqueTags() {
  return Array.from(
    new Set(
      Object.values(currentProblems).flatMap((problem) => Array.isArray(problem.topics) ? problem.topics : []),
    ),
  ).sort((first, second) => first.localeCompare(second));
}

function updateProgress() {
  const dueProblems = getDueProblems();
  const solvedTodayUrls = getSolvedTodayUrlSet();
  const solvedDueCount = dueProblems.filter((problem) => solvedTodayUrls.has(normalizeProblemUrl(problem.url))).length;

  if (dueProblems.length === 0) {
    document.getElementById("progressText").textContent = "0% complete (0/0)";
    document.getElementById("progressFill").style.width = "0%";
    return;
  }

  const percent = Math.round((solvedDueCount / dueProblems.length) * 100);
  document.getElementById("progressText").textContent = `${percent}% complete (${solvedDueCount}/${dueProblems.length})`;
  document.getElementById("progressFill").style.width = `${percent}%`;
}

async function tryExtractProblem() {
  const extractStatus = document.getElementById("extractStatus");
  const extractedData = document.getElementById("extractedData");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !isSupportedProblemUrl(tab.url)) {
      extractStatus.textContent = "Not on a LeetCode or Codeforces problem page.";
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: "extract_problem" });

    if (response && response.title) {
      currentExtractedProblem = response;
      document.getElementById("detectedTitle").textContent = response.title;
      document.getElementById("detectedSite").textContent = response.site;
      document.getElementById("detectedDifficulty").textContent = response.difficulty || "Unknown";
      document.getElementById("detectedTopics").textContent = (response.tags || []).join(", ") || "None";
      document.getElementById("detectedStriver").textContent = response.striverStep
        ? `${response.striverStep} - ${response.striverTopic || "Mapped"}`
        : "Not mapped";

      extractStatus.style.display = "none";
      extractedData.style.display = "block";
    } else {
      extractStatus.textContent = "Could not extract problem data from this page.";
    }
  } catch {
    extractStatus.textContent = "Could not extract problem data from this page.";
  }
}

async function saveExtractedProblem() {
  if (!currentExtractedProblem) return;

  const response = await chrome.runtime.sendMessage({
    action: "save_problem",
    problem: currentExtractedProblem,
  });

  if (response.success) {
    showToast("Problem saved successfully.");
    await reloadAndRender();
    openTab("today");
  }
}

async function saveManualProblem() {
  const title = document.getElementById("manualTitle").value.trim();
  const url = document.getElementById("manualUrl").value.trim();
  const site = document.getElementById("manualSite").value;
  const tags = document.getElementById("manualTags").value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!title || !url) {
    showToast("Please enter both title and URL.");
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: "save_problem",
    problem: { title, url, site, tags, difficulty: "Unknown" },
  });

  if (response.success) {
    showToast("Problem saved successfully.");
    document.getElementById("manualTitle").value = "";
    document.getElementById("manualUrl").value = "";
    document.getElementById("manualTags").value = "";
    await reloadAndRender();
    openTab("today");
  }
}

async function markRevised(problemId) {
  await chrome.runtime.sendMessage({ action: "mark_revised", problemId });
  await reloadAndRender();
  showToast("Marked as revised.");
}

async function moveBucket(problemId) {
  const settings = currentSettings || await chrome.runtime.sendMessage({ action: "get_settings" });
  const maxBucket = (settings.intervals || []).length - 1;
  const newBucket = prompt(`Enter bucket index (0-${maxBucket}):`);

  if (newBucket === null) return;

  const bucketIndex = parseInt(newBucket, 10);
  if (Number.isNaN(bucketIndex) || bucketIndex < 0 || bucketIndex > maxBucket) {
    showToast("Invalid bucket index.");
    return;
  }

  await chrome.runtime.sendMessage({ action: "move_bucket", problemId, bucketIndex });
  await reloadAndRender();
  showToast("Moved to new bucket.");
}

function openNotesModal(problemId) {
  currentEditingId = problemId;
  const problem = currentProblems[problemId];
  document.getElementById("notesInput").value = problem.notes || "";
  document.getElementById("notesModal").style.display = "flex";
}

function closeNotesModal() {
  document.getElementById("notesModal").style.display = "none";
  currentEditingId = null;
}

async function saveNotes() {
  const notes = document.getElementById("notesInput").value;
  await chrome.runtime.sendMessage({
    action: "update_notes",
    problemId: currentEditingId,
    notes,
  });
  await reloadAndRender();
  closeNotesModal();
  showToast("Notes saved.");
}

async function deleteProblem(problemId) {
  if (!confirm("Are you sure you want to delete this problem?")) return;

  await chrome.runtime.sendMessage({ action: "delete_problem", problemId });
  await reloadAndRender();
  showToast("Problem deleted.");
}

async function saveSettings() {
  const intervals = document.getElementById("intervalsInput").value
    .split(",")
    .map((value) => parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  const reminderHour = parseInt(document.getElementById("reminderHourInput").value, 10);
  const syncHour = parseInt(document.getElementById("syncHourInput").value, 10);
  const notionUrl = document.getElementById("notionUrlInput").value.trim() || DEFAULT_NOTION_URL;

  if (intervals.length === 0 || !isValidHour(reminderHour) || !isValidHour(syncHour)) {
    showToast("Invalid settings.");
    return;
  }

  await Promise.all([
    chrome.runtime.sendMessage({
      action: "update_settings",
      settings: {
        intervals,
        reminderHour,
        syncHour,
        githubToken: document.getElementById("githubTokenInput").value.trim(),
        githubGistId: document.getElementById("githubGistIdInput").value.trim(),
        githubAutoSync: document.getElementById("githubAutoSyncInput").checked,
        autoSyncGist: document.getElementById("githubAutoSyncInput").checked,
        geminiKey: document.getElementById("gemini-key").value.trim(),
        groqKey: document.getElementById("groq-key").value.trim(),
        openrouterKey: document.getElementById("openrouter-key").value.trim(),
        autoReviewOnAccept: document.getElementById("auto-review-on-accept").checked,
      },
    }),
    chrome.storage.local.set({ notionUrl }),
  ]);

  await loadSettings();
  renderSettings();
  showToast("Settings saved.");
}

async function syncNow() {
  const result = await chrome.runtime.sendMessage({ action: "SYNC_GITHUB_GIST" });

  if (!result?.success) {
    showToast(result?.error || "GitHub sync failed.");
    return;
  }

  await loadSettings();
  renderSettings();
  if (result.gistId) {
    document.getElementById("githubGistIdInput").value = result.gistId;
  }
  showToast("GitHub Gist synced.");
}

function exportCSV() {
  const problems = Object.values(currentProblems);
  if (problems.length === 0) {
    showToast("No problems to export.");
    return;
  }

  const headers = [
    "Title",
    "URL",
    "Site",
    "Difficulty",
    "Topics",
    "Bucket",
    "Iteration Count",
    "Next Review",
    "Custom Review Date",
    "Completed",
    "Notes",
    "Added At",
  ];

  const rows = problems.map((problem) => [
    problem.title,
    problem.url,
    problem.site,
    problem.difficulty,
    (problem.topics || []).join("; "),
    problem.bucketIndex,
    problem.iterationCount || 0,
    problem.nextReviewAt ? formatDate(problem.nextReviewAt) : "N/A",
    problem.nextReviewDate || "N/A",
    problem.completed ? "Yes" : "No",
    (problem.notes || "").replace(/"/g, '""'),
    formatDate(problem.addedAt),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `revise_mate_export_${formatDateFile(Date.now())}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  showToast("CSV exported.");
}

async function reloadAndRender() {
  await Promise.all([loadProblems(), loadSolvedSessions(), loadSettings()]);
  renderTodayList();
  renderQueueList();
  renderAllList();
  renderStats();
  renderSettings();
  updateProgress();
}

function getThisWeekCount() {
  const startOfWeek = new Date();
  const day = startOfWeek.getDay();
  const diff = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diff);
  startOfWeek.setHours(0, 0, 0, 0);

  return currentSolvedSessions.filter((session) => new Date(session.date) >= startOfWeek).length;
}

function getTopicCounts() {
  return currentSolvedSessions.reduce((accumulator, session) => {
    const uniqueTags = new Set(Array.isArray(session.tags) ? session.tags : []);
    uniqueTags.forEach((tag) => {
      accumulator[tag] = (accumulator[tag] || 0) + 1;
    });
    return accumulator;
  }, {});
}

function getTopicAverageTimes() {
  const topicTimes = {};

  currentSolvedSessions.forEach((session) => {
    const uniqueTags = new Set(Array.isArray(session.tags) ? session.tags : []);
    uniqueTags.forEach((tag) => {
      if (!topicTimes[tag]) {
        topicTimes[tag] = { total: 0, count: 0 };
      }

      topicTimes[tag].total += getSessionTimeMs(session);
      topicTimes[tag].count += 1;
    });
  });

  return Object.entries(topicTimes).map(([tag, value]) => ({
    averageTime: value.total / value.count,
    tag,
  }));
}

function calculateStreak() {
  const uniqueDays = Array.from(
    new Set(currentSolvedSessions.map((session) => new Date(session.date).toISOString().slice(0, 10))),
  ).sort();

  if (uniqueDays.length === 0) {
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(uniqueDays[uniqueDays.length - 1]);

  for (let index = uniqueDays.length - 2; index >= 0; index -= 1) {
    const previousDate = new Date(uniqueDays[index]);
    const diffDays = Math.round((currentDate - previousDate) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      streak += 1;
      currentDate = previousDate;
    } else if (diffDays > 1) {
      break;
    }
  }

  return streak;
}

function getGroupedSessionsByProblem() {
  const groups = new Map();

  currentSolvedSessions.forEach((session) => {
    const problemUrl = normalizeProblemUrl(session.problemUrl || session.url || "");
    if (!problemUrl) {
      return;
    }

    if (!groups.has(problemUrl)) {
      groups.set(problemUrl, {
        title: session.problemTitle || currentProblems[session.problemId]?.title || "Unknown Problem",
        problemUrl,
        sessions: [],
      });
    }

    groups.get(problemUrl).sessions.push(session);
  });

  return Array.from(groups.values()).map((group) => ({
    ...group,
    sessions: group.sessions
      .slice()
      .sort((first, second) => new Date(first.date) - new Date(second.date))
      .map((session, index) => ({
        ...session,
        iteration: session.iteration || index + 1,
      })),
  }));
}

function getImprovementStats() {
  const groups = getGroupedSessionsByProblem().filter((group) => group.sessions.length >= 2);
  const improvements = [];
  const slowerProblems = [];

  groups.forEach((group) => {
    const firstTime = getSessionTimeMs(group.sessions[0]);
    const lastTime = getSessionTimeMs(group.sessions.at(-1));
    if (firstTime <= 0) {
      return;
    }

    const improvement = ((firstTime - lastTime) / firstTime) * 100;
    improvements.push(improvement);

    if (improvement < 0) {
      slowerProblems.push({
        title: group.title,
        label: `+${Math.round(Math.abs(improvement))}% slower`,
      });
    }
  });

  return {
    averageImprovement: improvements.length === 0
      ? 0
      : improvements.reduce((sum, value) => sum + value, 0) / improvements.length,
    slowerProblems,
  };
}

function getSpeedTrend(sessions) {
  const firstTime = getSessionTimeMs(sessions[0]);
  const lastTime = getSessionTimeMs(sessions.at(-1));

  if (firstTime <= 0) {
    return { className: "same", label: "-> Need more data" };
  }

  const change = ((firstTime - lastTime) / firstTime) * 100;
  if (change > 5) {
    return { className: "faster", label: `↓ ${Math.round(change)}% faster` };
  }
  if (change < -5) {
    return { className: "slower", label: `↑ Slower - review this` };
  }
  return { className: "same", label: "→ Same pace" };
}

function getProblemDueTimestamp(problem) {
  if (problem.nextReviewDate) {
    return new Date(problem.nextReviewDate).getTime();
  }
  if (Number.isFinite(problem.nextReviewAt)) {
    return problem.nextReviewAt;
  }
  return Number.MAX_SAFE_INTEGER;
}

function getProblemStepOrder(problem) {
  const stepLabel = problem.striverStep || getProblemStriverEntry(problem)?.step;
  return window.STRIVER_SHEET_UTILS?.getStepOrder?.(stepLabel) ?? Number.MAX_SAFE_INTEGER;
}

function getProblemStepLabel(problem) {
  const entry = getProblemStriverEntry(problem);
  if (!entry) {
    return "";
  }
  return `${entry.step} - ${entry.topic}`;
}

function getProblemStriverEntry(problem) {
  if (problem.striverId) {
    return (window.STRIVER_SHEET || []).find((entry) => entry.id === problem.striverId) || null;
  }

  return window.STRIVER_SHEET_UTILS?.findByProblemUrl?.(problem.url) || null;
}

function formatProblemReviewLabel(problem) {
  if (problem.completed) {
    return "Completed";
  }

  if (problem.nextReviewDate) {
    return `Custom ${problem.nextReviewDate}`;
  }

  return Number.isFinite(problem.nextReviewAt) ? formatDate(problem.nextReviewAt) : "N/A";
}

function getOverdueDays(dueTimestamp) {
  const todayStart = getStartOfDay();
  if (dueTimestamp >= todayStart) {
    return 0;
  }

  return Math.max(1, Math.floor((todayStart - dueTimestamp) / (24 * 60 * 60 * 1000)));
}

function getSolvedTodayUrlSet() {
  const todayIso = new Date().toISOString().slice(0, 10);
  return new Set(
    currentSolvedSessions
      .filter((session) => String(session.date).slice(0, 10) === todayIso)
      .map((session) => normalizeProblemUrl(session.problemUrl || session.url || "")),
  );
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

function getDifficultyClass(difficulty) {
  const normalized = String(difficulty || "Unknown").toLowerCase();
  if (normalized.includes("easy")) return "easy";
  if (normalized.includes("medium")) return "medium";
  if (normalized.includes("hard")) return "hard";
  if (/^\d+$/.test(normalized)) return "rating";
  return "unknown";
}

function isSupportedProblemUrl(url) {
  return (
    /^https:\/\/leetcode\.com\/problems\//.test(url) ||
    /^https:\/\/codeforces\.com\/problemset\/problem\//.test(url) ||
    /^https:\/\/codeforces\.com\/contest\/\d+\/problem\//.test(url)
  );
}

function openTab(tabName) {
  const button = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  button?.click();
}

function normalizeProblemUrl(url) {
  return window.STRIVER_SHEET_UTILS?.normalizeProblemUrl
    ? window.STRIVER_SHEET_UTILS.normalizeProblemUrl(url)
    : url;
}

function formatDurationMs(totalMs) {
  const totalSeconds = Math.round(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatCompactDuration(totalMs) {
  const totalSeconds = Math.round(totalMs / 1000);
  if (totalSeconds >= 60) {
    return `${Math.round(totalSeconds / 60)}m`;
  }
  return `${totalSeconds}s`;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

function formatDateFile(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function getStartOfDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getEndOfDay(timestamp = Date.now()) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

function isValidHour(hour) {
  return Number.isFinite(hour) && hour >= 0 && hour <= 23;
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

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("show"), 10);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2200);
}
