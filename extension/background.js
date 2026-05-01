const DEFAULT_INTERVALS = [1, 2, 3, 7, 14];
const DEFAULT_REMINDER_HOUR = 19;
const DEFAULT_SYNC_HOUR = 21;
const DEFAULT_NOTION_URL = "https://www.notion.so";

chrome.runtime.onInstalled.addListener(() => {
  void initializeSettings();
  void scheduleAllAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeSettings();
  void scheduleAllAlarms();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily_reminder") {
    void sendDailyNotification();
    void scheduleDailyReminderAlarm();
    return;
  }

  if (alarm.name === "rehash-daily-sync") {
    void runAutoSyncIfEnabled();
    void scheduleDailySyncAlarm();
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "save_problem") {
    saveProblem(request.problem).then(sendResponse);
    return true;
  }
  if (request.action === "get_all_problems") {
    getAllProblems().then(sendResponse);
    return true;
  }
  if (request.action === "get_today_queue") {
    getTodayQueue().then(sendResponse);
    return true;
  }
  if (request.action === "mark_revised") {
    markRevised(request.problemId).then(sendResponse);
    return true;
  }
  if (request.action === "move_bucket") {
    moveBucket(request.problemId, request.bucketIndex).then(sendResponse);
    return true;
  }
  if (request.action === "update_notes") {
    updateNotes(request.problemId, request.notes).then(sendResponse);
    return true;
  }
  if (request.action === "delete_problem") {
    deleteProblem(request.problemId).then(sendResponse);
    return true;
  }
  if (request.action === "get_settings") {
    getSettings().then(sendResponse);
    return true;
  }
  if (request.action === "update_settings") {
    updateSettings(request.settings).then(() => {
      void scheduleAllAlarms();
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.action === "SAVE_SESSION") {
    saveSolvedSession(request.session).then(sendResponse);
    return true;
  }
  if (request.action === "SYNC_GITHUB_GIST") {
    syncGithubGist().then(sendResponse);
    return true;
  }
  if (request.action === "GET_NOTION_URL") {
    getNotionUrl().then((notionUrl) => sendResponse({ notionUrl }));
    return true;
  }
  if (request.action === "OPEN_NOTION_URL") {
    openNotionUrl(request.url).then(sendResponse);
    return true;
  }
});

async function initializeSettings() {
  const data = await chrome.storage.local.get(["revise_mate_data", "solvedSessions", "notionUrl"]);
  const store = normalizeStore(data.revise_mate_data);

  const updates = {
    revise_mate_data: store,
  };

  if (!Array.isArray(data.solvedSessions)) {
    updates.solvedSessions = [];
  }

  if (typeof data.notionUrl !== "string" || !data.notionUrl.trim()) {
    updates.notionUrl = DEFAULT_NOTION_URL;
  }

  await chrome.storage.local.set(updates);
}

async function getSettings() {
  const store = await getStore();
  return store.settings;
}

async function getNotionUrl() {
  const data = await chrome.storage.local.get("notionUrl");
  return (data.notionUrl || DEFAULT_NOTION_URL).trim() || DEFAULT_NOTION_URL;
}

async function updateSettings(settings) {
  const store = await getStore();
  store.settings = {
    ...store.settings,
    ...sanitizeSettings(settings),
  };
  await chrome.storage.local.set({ revise_mate_data: store });
}

async function getStore() {
  const data = await chrome.storage.local.get("revise_mate_data");
  const store = normalizeStore(data.revise_mate_data);
  return store;
}

function normalizeStore(rawStore) {
  const store = rawStore && typeof rawStore === "object" ? rawStore : {};
  const problems = Object.fromEntries(
    Object.entries(store.problems || {}).map(([problemId, problem]) => [problemId, normalizeProblem(problem)]),
  );

  return {
    problems,
    settings: {
      ...getDefaultSettings(),
      ...sanitizeSettings(store.settings),
    },
  };
}

function getDefaultSettings() {
  return {
    intervals: DEFAULT_INTERVALS.slice(),
    reminderHour: DEFAULT_REMINDER_HOUR,
    syncHour: DEFAULT_SYNC_HOUR,
    githubToken: "",
    githubGistId: "",
    githubAutoSync: false,
    githubLastSyncAt: null,
  };
}

function sanitizeSettings(settings) {
  const safeSettings = settings && typeof settings === "object" ? settings : {};
  const intervals = Array.isArray(safeSettings.intervals)
    ? safeSettings.intervals.map((value) => parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0)
    : undefined;
  const reminderHour = parseInt(safeSettings.reminderHour, 10);
  const syncHour = parseInt(safeSettings.syncHour, 10);

  return {
    ...(intervals && intervals.length > 0 ? { intervals } : {}),
    ...(Number.isFinite(reminderHour) && reminderHour >= 0 && reminderHour <= 23 ? { reminderHour } : {}),
    ...(Number.isFinite(syncHour) && syncHour >= 0 && syncHour <= 23 ? { syncHour } : {}),
    ...(typeof safeSettings.githubToken === "string" ? { githubToken: safeSettings.githubToken.trim() } : {}),
    ...(typeof safeSettings.githubGistId === "string" ? { githubGistId: safeSettings.githubGistId.trim() } : {}),
    ...(typeof safeSettings.githubAutoSync === "boolean" ? { githubAutoSync: safeSettings.githubAutoSync } : {}),
    ...(typeof safeSettings.githubLastSyncAt === "string" || safeSettings.githubLastSyncAt === null
      ? { githubLastSyncAt: safeSettings.githubLastSyncAt }
      : {}),
  };
}

async function getAllProblems() {
  const store = await getStore();
  return store.problems;
}

async function getTodayQueue() {
  const [problems, sessions] = await Promise.all([getAllProblems(), getSolvedSessions()]);
  return {
    problems: getProblemsForToday(problems),
    solvedTodayCount: countProblemsSolvedToday(sessions),
  };
}

async function saveProblem(problemData) {
  const store = await getStore();
  const settings = store.settings;
  const normalizedUrl = normalizeProblemUrl(problemData.url);
  const problemId = generateId(problemData.site, normalizedUrl);
  const now = Date.now();
  const existing = normalizeProblem(store.problems[problemId] || {});
  const intervalDays = settings.intervals[0] || DEFAULT_INTERVALS[0];

  store.problems[problemId] = normalizeProblem({
    ...existing,
    id: problemId,
    title: problemData.title || existing.title || "Unknown Problem",
    url: normalizedUrl,
    site: problemData.site || inferSiteFromUrl(normalizedUrl) || existing.site || "unknown",
    difficulty: problemData.difficulty || existing.difficulty || "Unknown",
    topics: Array.isArray(problemData.tags) ? problemData.tags : existing.topics,
    addedAt: existing.addedAt || now,
    bucketIndex: existing.bucketIndex,
    nextReviewAt: existing.nextReviewAt || now + intervalDays * 24 * 60 * 60 * 1000,
    notes: existing.notes,
    history: existing.history.length > 0 ? existing.history : [{ date: now, action: "added" }],
    completed: existing.completed,
    iterationCount: existing.iterationCount,
    nextReviewDate: existing.nextReviewDate,
    striverId: problemData.striverId || existing.striverId || null,
    striverStep: problemData.striverStep || existing.striverStep || null,
    striverTopic: problemData.striverTopic || existing.striverTopic || null,
    solveSessionIds: existing.solveSessionIds,
  });

  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true, id: problemId };
}

async function markRevised(problemId) {
  const store = await getStore();
  const problem = normalizeProblem(store.problems[problemId]);

  if (!problem.id) return { success: false };

  const settings = store.settings;
  const now = Date.now();

  problem.history.push({ date: now, action: "revised" });

  if (problem.bucketIndex < settings.intervals.length - 1) {
    problem.bucketIndex += 1;
    const intervalDays = settings.intervals[problem.bucketIndex];
    problem.nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;
    problem.completed = false;
  } else {
    problem.completed = true;
    problem.nextReviewAt = null;
  }

  store.problems[problemId] = normalizeProblem(problem);
  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function moveBucket(problemId, bucketIndex) {
  const store = await getStore();
  const problem = normalizeProblem(store.problems[problemId]);

  if (!problem.id) return { success: false };

  const settings = store.settings;
  const now = Date.now();

  problem.bucketIndex = bucketIndex;

  if (bucketIndex < settings.intervals.length) {
    const intervalDays = settings.intervals[bucketIndex];
    problem.nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;
    problem.completed = false;
  } else {
    problem.completed = true;
    problem.nextReviewAt = null;
  }

  store.problems[problemId] = normalizeProblem(problem);
  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function updateNotes(problemId, notes) {
  const store = await getStore();
  const problem = normalizeProblem(store.problems[problemId]);

  if (!problem.id) return { success: false };

  problem.notes = notes || "";
  store.problems[problemId] = normalizeProblem(problem);
  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function deleteProblem(problemId) {
  const store = await getStore();
  delete store.problems[problemId];
  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function saveSolvedSession(session) {
  if (!session || !(session.problemUrl || session.url) || !session.problemTitle) {
    return { success: false };
  }

  const [store, sessions] = await Promise.all([getStore(), getSolvedSessions()]);
  const normalizedSession = normalizeSolvedSession(session, sessions);
  const nextSessions = [...sessions, normalizedSession];
  const problemId = generateId(normalizedSession.site, normalizedSession.problemUrl);
  const existingProblem = normalizeProblem(store.problems[problemId] || {});
  const sessionDateMs = Date.parse(normalizedSession.date) || Date.now();

  const nextProblem = normalizeProblem({
    ...existingProblem,
    id: problemId,
    title: normalizedSession.problemTitle,
    url: normalizedSession.problemUrl,
    site: normalizedSession.site,
    difficulty: existingProblem.difficulty || normalizedSession.difficulty || "Unknown",
    topics: existingProblem.topics.length > 0 ? existingProblem.topics : normalizedSession.tags,
    addedAt: existingProblem.addedAt || sessionDateMs,
    notes: existingProblem.notes,
    history: [
      ...existingProblem.history,
      { action: "solved", date: sessionDateMs, iteration: normalizedSession.iteration },
    ],
    iterationCount: Math.max(existingProblem.iterationCount, normalizedSession.iteration),
    striverId: normalizedSession.striverId || existingProblem.striverId || null,
    striverStep: normalizedSession.striverStep || existingProblem.striverStep || null,
    striverTopic: normalizedSession.striverTopic || existingProblem.striverTopic || null,
    solveSessionIds: addUnique(existingProblem.solveSessionIds, normalizedSession.id),
  });

  if (normalizedSession.reviewDecision === "done") {
    nextProblem.completed = true;
    nextProblem.nextReviewDate = null;
    nextProblem.nextReviewAt = null;
  } else if (normalizedSession.nextReviewDate) {
    nextProblem.completed = false;
    nextProblem.nextReviewDate = normalizedSession.nextReviewDate;
    nextProblem.nextReviewAt = Date.parse(normalizedSession.nextReviewDate);
  }

  store.problems[problemId] = nextProblem;

  await chrome.storage.local.set({
    revise_mate_data: store,
    solvedSessions: nextSessions,
  });

  if (store.settings.githubAutoSync) {
    void syncGithubGist();
  }

  return { success: true, sessionId: normalizedSession.id };
}

async function getSolvedSessions() {
  const data = await chrome.storage.local.get("solvedSessions");
  return Array.isArray(data.solvedSessions)
    ? data.solvedSessions.map((session, index, sessions) => normalizeSolvedSession(session, sessions.slice(0, index)))
    : [];
}

function normalizeSolvedSession(session, existingSessions = []) {
  const problemUrl = normalizeProblemUrl(session.problemUrl || session.url);
  const site = session.site || inferSiteFromUrl(problemUrl) || "unknown";
  const date = session.date || new Date().toISOString();
  const previousIterations = existingSessions.filter((item) => normalizeProblemUrl(item.problemUrl || item.url) === problemUrl).length;
  const iteration = clampPositiveInt(session.iteration, previousIterations + 1);
  const timeTakenMs = Number.isFinite(session.timeTakenMs)
    ? Math.max(0, Math.round(session.timeTakenMs))
    : Number.isFinite(session.timeTaken)
      ? Math.max(0, Math.round(session.timeTaken * 1000))
      : 0;

  const notes = session.notes || session.note || "";
  const nextReviewDate = normalizeIsoDate(session.nextReviewDate);
  const reviewDecision = session.reviewDecision || (nextReviewDate ? "scheduled" : "none");
  const id = session.id || `${problemUrl}|${date}`;

  return {
    id,
    problemUrl,
    problemTitle: session.problemTitle,
    striverId: session.striverId || null,
    striverStep: session.striverStep || null,
    striverTopic: session.striverTopic || null,
    iteration,
    timeTakenMs,
    approach: session.approach || "",
    mistakes: session.mistakes || "",
    notes,
    confidence: session.confidence || "Medium",
    date,
    nextReviewDate,
    reviewDecision,
    site,
    tags: Array.isArray(session.tags) ? session.tags : [],
    notionOpened: Boolean(session.notionOpened),
    difficulty: session.difficulty || "Unknown",
  };
}

function normalizeProblem(problem) {
  const rawProblem = problem && typeof problem === "object" ? problem : {};

  return {
    id: rawProblem.id || null,
    title: rawProblem.title || "Unknown Problem",
    url: normalizeProblemUrl(rawProblem.url || ""),
    site: rawProblem.site || "unknown",
    difficulty: rawProblem.difficulty || "Unknown",
    topics: Array.isArray(rawProblem.topics) ? rawProblem.topics : [],
    addedAt: Number.isFinite(rawProblem.addedAt) ? rawProblem.addedAt : Date.now(),
    bucketIndex: Number.isFinite(rawProblem.bucketIndex) ? rawProblem.bucketIndex : 0,
    nextReviewAt: Number.isFinite(rawProblem.nextReviewAt) ? rawProblem.nextReviewAt : null,
    notes: rawProblem.notes || "",
    history: Array.isArray(rawProblem.history) ? rawProblem.history : [],
    completed: Boolean(rawProblem.completed),
    iterationCount: clampPositiveInt(rawProblem.iterationCount, 0),
    nextReviewDate: normalizeIsoDate(rawProblem.nextReviewDate),
    striverId: rawProblem.striverId || null,
    striverStep: rawProblem.striverStep || null,
    striverTopic: rawProblem.striverTopic || null,
    solveSessionIds: Array.isArray(rawProblem.solveSessionIds) ? rawProblem.solveSessionIds : [],
  };
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

function getProblemsForToday(problems) {
  const todayEnd = getEndOfDay();
  const todayIso = new Date(todayEnd).toISOString().slice(0, 10);
  const byUrl = new Map();

  Object.values(problems).forEach((problem) => {
    const normalizedProblem = normalizeProblem(problem);
    if (!normalizedProblem.url || normalizedProblem.completed) {
      return;
    }

    const bucketDue = Number.isFinite(normalizedProblem.nextReviewAt) && normalizedProblem.nextReviewAt <= todayEnd;
    const dateDue = normalizedProblem.nextReviewDate && normalizedProblem.nextReviewDate <= todayIso;

    if (bucketDue || dateDue) {
      byUrl.set(normalizedProblem.url, normalizedProblem);
    }
  });

  return Array.from(byUrl.values());
}

function countProblemsSolvedToday(sessions) {
  const todayIso = new Date().toISOString().slice(0, 10);
  return new Set(
    sessions
      .filter((session) => String(session.date || "").slice(0, 10) === todayIso)
      .map((session) => normalizeProblemUrl(session.problemUrl || session.url)),
  ).size;
}

async function scheduleAllAlarms() {
  await Promise.all([scheduleDailyReminderAlarm(), scheduleDailySyncAlarm()]);
}

async function scheduleDailyReminderAlarm() {
  const settings = await getSettings();
  return scheduleAlarmAtHour("daily_reminder", settings.reminderHour || DEFAULT_REMINDER_HOUR);
}

async function scheduleDailySyncAlarm() {
  const settings = await getSettings();
  return scheduleAlarmAtHour("rehash-daily-sync", settings.syncHour || DEFAULT_SYNC_HOUR);
}

function scheduleAlarmAtHour(name, hour) {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return new Promise((resolve) => {
    chrome.alarms.clear(name, () => {
      chrome.alarms.create(name, {
        when: next.getTime(),
        periodInMinutes: 24 * 60,
      });
      resolve();
    });
  });
}

async function sendDailyNotification() {
  const problems = await getAllProblems();
  const todayProblems = getProblemsForToday(problems);

  if (todayProblems.length === 0) return;

  const count = todayProblems.length;
  const preview = todayProblems
    .slice(0, 3)
    .map((problem) => problem.title)
    .join("\n");

  chrome.notifications.create({
    type: "basic",
    iconUrl:
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">R</text></svg>',
    title: `ReHash: ${count} problem${count > 1 ? "s" : ""} due today`,
    message: preview + (count > 3 ? `\n...and ${count - 3} more` : ""),
    priority: 1,
  });
}

async function runAutoSyncIfEnabled() {
  const settings = await getSettings();
  if (!settings.githubAutoSync) {
    return { success: true, skipped: true };
  }

  return syncGithubGist();
}

async function syncGithubGist() {
  const store = await getStore();
  const settings = store.settings;

  if (!settings.githubToken) {
    return { success: false, error: "GitHub token is required." };
  }

  const sessions = await getSolvedSessions();
  const files = createGistFiles(sessions);
  const headers = {
    Authorization: `Bearer ${settings.githubToken}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  let gistId = settings.githubGistId || "";
  let response;

  if (!gistId) {
    response = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers,
      body: JSON.stringify({
        description: "ReHash solve sessions",
        public: false,
        files,
      }),
    });
  } else {
    response = await fetch(`https://api.github.com/gists/${gistId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        files,
      }),
    });
  }

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `GitHub sync failed (${response.status}): ${errorText}`,
    };
  }

  const payload = await response.json();
  gistId = payload.id || gistId;
  store.settings.githubGistId = gistId;
  store.settings.githubLastSyncAt = new Date().toISOString();
  await chrome.storage.local.set({ revise_mate_data: store });

  return {
    success: true,
    gistId,
    lastSyncAt: store.settings.githubLastSyncAt,
    url: payload.html_url || null,
  };
}

function createGistFiles(sessions) {
  return {
    "rehash-sessions.json": {
      content: JSON.stringify(sessions, null, 2),
    },
    "rehash-summary.md": {
      content: createSummaryMarkdown(sessions),
    },
  };
}

function createSummaryMarkdown(sessions) {
  const lines = [
    "# ReHash Summary",
    "",
    "| Problem | Iteration | Time | Mistakes | Notes | Date |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  sessions.forEach((session) => {
    lines.push(
      `| ${escapeMarkdownTable(session.problemTitle)} | ${session.iteration} | ${formatDurationMs(session.timeTakenMs)} | ${escapeMarkdownTable(session.mistakes)} | ${escapeMarkdownTable(session.notes)} | ${escapeMarkdownTable(session.date)} |`,
    );
  });

  return lines.join("\n");
}

async function openNotionUrl(url) {
  const notionUrl = typeof url === "string" && url.trim() ? url.trim() : await getNotionUrl();
  await chrome.tabs.create({ url: notionUrl });
  return { success: true, url: notionUrl };
}

function generateId(site, url) {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return `${site}|${path}`;
  } catch {
    return `${site}|${Date.now()}`;
  }
}

function normalizeProblemUrl(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");

    if (/^\/problems\/[^/]+/i.test(pathname)) {
      const match = pathname.match(/^\/problems\/([^/]+)/i);
      if (match) {
        return `${parsed.origin}/problems/${match[1]}/`;
      }
    }

    if (/^\/contest\/\d+\/problem\/[A-Za-z0-9]+/i.test(pathname)) {
      const match = pathname.match(/^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
      if (match) {
        return `${parsed.origin}/contest/${match[1]}/problem/${match[2]}`;
      }
    }

    if (/^\/problemset\/problem\/\d+\/[A-Za-z0-9]+/i.test(pathname)) {
      const match = pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
      if (match) {
        return `${parsed.origin}/problemset/problem/${match[1]}/${match[2]}`;
      }
    }

    return `${parsed.origin}${pathname}/`;
  } catch {
    return url;
  }
}

function inferSiteFromUrl(url) {
  if (/leetcode\.com/.test(url)) return "leetcode";
  if (/codeforces\.com/.test(url)) return "codeforces";
  return null;
}

function normalizeIsoDate(value) {
  if (!value) {
    return null;
  }

  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function clampPositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function addUnique(items, nextItem) {
  const values = Array.isArray(items) ? items.slice() : [];
  if (nextItem && !values.includes(nextItem)) {
    values.push(nextItem);
  }
  return values;
}

function formatDurationMs(totalMs) {
  const totalSeconds = Math.round(totalMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function escapeMarkdownTable(value) {
  return String(value || "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .trim();
}
