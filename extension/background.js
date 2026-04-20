const DEFAULT_INTERVALS = [1, 2, 3, 7, 14];
const DEFAULT_REMINDER_HOUR = 19;
const DEFAULT_NOTION_URL = "https://www.notion.so";

chrome.runtime.onInstalled.addListener(() => {
  initializeSettings();
  scheduleNextAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  initializeSettings();
  scheduleNextAlarm();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "daily_reminder") {
    sendDailyNotification();
    scheduleNextAlarm();
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
      scheduleNextAlarm();
      sendResponse({ success: true });
    });
    return true;
  }
  if (request.action === "SAVE_SESSION") {
    saveSolvedSession(request.session).then(sendResponse);
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
  if (!data.revise_mate_data) {
    await chrome.storage.local.set({
      revise_mate_data: {
        problems: {},
        settings: {
          intervals: DEFAULT_INTERVALS,
          reminderHour: DEFAULT_REMINDER_HOUR,
        },
      },
    });
  }

  const updates = {};

  if (!Array.isArray(data.solvedSessions)) {
    updates.solvedSessions = [];
  }

  if (typeof data.notionUrl !== "string" || !data.notionUrl.trim()) {
    updates.notionUrl = DEFAULT_NOTION_URL;
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }
}

async function getSettings() {
  const data = await chrome.storage.local.get("revise_mate_data");
  return (
    data.revise_mate_data?.settings || {
      intervals: DEFAULT_INTERVALS,
      reminderHour: DEFAULT_REMINDER_HOUR,
    }
  );
}

async function getNotionUrl() {
  const data = await chrome.storage.local.get("notionUrl");
  return (data.notionUrl || DEFAULT_NOTION_URL).trim() || DEFAULT_NOTION_URL;
}

async function updateSettings(settings) {
  const data = await chrome.storage.local.get("revise_mate_data");
  const current = data.revise_mate_data || { problems: {}, settings: {} };
  current.settings = { ...current.settings, ...settings };
  await chrome.storage.local.set({ revise_mate_data: current });
}

async function saveSolvedSession(session) {
  if (!session || !session.problemTitle || !session.url) {
    return { success: false };
  }

  const data = await chrome.storage.local.get("solvedSessions");
  const solvedSessions = Array.isArray(data.solvedSessions) ? data.solvedSessions : [];

  solvedSessions.push({
    problemTitle: session.problemTitle,
    url: session.url,
    site: session.site || "unknown",
    tags: Array.isArray(session.tags) ? session.tags : [],
    timeTaken: Number.isFinite(session.timeTaken) ? session.timeTaken : 0,
    note: session.note || "",
    date: session.date || new Date().toISOString(),
    notionOpened: Boolean(session.notionOpened),
  });

  await chrome.storage.local.set({ solvedSessions });
  return { success: true };
}

async function getAllProblems() {
  const data = await chrome.storage.local.get("revise_mate_data");
  return data.revise_mate_data?.problems || {};
}

async function saveProblem(problemData) {
  const data = await chrome.storage.local.get("revise_mate_data");
  const store = data.revise_mate_data || { problems: {}, settings: {} };
  const settings = store.settings || { intervals: DEFAULT_INTERVALS };

  const id = generateId(problemData.site, problemData.url);
  const now = Date.now();
  const intervalDays = settings.intervals[0];

  store.problems[id] = {
    id,
    title: problemData.title,
    url: problemData.url,
    site: problemData.site,
    difficulty: problemData.difficulty || "Unknown",
    topics: problemData.tags || [],
    addedAt: now,
    bucketIndex: 0,
    nextReviewAt: now + intervalDays * 24 * 60 * 60 * 1000,
    notes: "",
    history: [{ date: now, action: "added" }],
    completed: false,
  };

  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true, id };
}

async function markRevised(problemId) {
  const data = await chrome.storage.local.get("revise_mate_data");
  const store = data.revise_mate_data;
  const problem = store.problems[problemId];

  if (!problem) return { success: false };

  const settings = store.settings || { intervals: DEFAULT_INTERVALS };
  const now = Date.now();

  problem.history.push({ date: now, action: "revised" });

  if (problem.bucketIndex < settings.intervals.length - 1) {
    problem.bucketIndex++;
    const intervalDays = settings.intervals[problem.bucketIndex];
    problem.nextReviewAt = now + intervalDays * 24 * 60 * 60 * 1000;
  } else {
    problem.completed = true;
    problem.nextReviewAt = null;
  }

  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function moveBucket(problemId, bucketIndex) {
  const data = await chrome.storage.local.get("revise_mate_data");
  const store = data.revise_mate_data;
  const problem = store.problems[problemId];

  if (!problem) return { success: false };

  const settings = store.settings || { intervals: DEFAULT_INTERVALS };
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

  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function updateNotes(problemId, notes) {
  const data = await chrome.storage.local.get("revise_mate_data");
  const store = data.revise_mate_data;
  const problem = store.problems[problemId];

  if (!problem) return { success: false };

  problem.notes = notes;
  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
}

async function deleteProblem(problemId) {
  const data = await chrome.storage.local.get("revise_mate_data");
  const store = data.revise_mate_data;

  delete store.problems[problemId];
  await chrome.storage.local.set({ revise_mate_data: store });
  return { success: true };
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

function getTodayProblems(problems) {
  const todayStart = getStartOfDay();
  const todayEnd = getEndOfDay();

  return Object.values(problems).filter(
    (p) =>
      !p.completed &&
      p.nextReviewAt &&
      p.nextReviewAt >= todayStart &&
      p.nextReviewAt <= todayEnd,
  );
}

async function scheduleNextAlarm() {
  const settings = await getSettings();
  const hour = settings.reminderHour || DEFAULT_REMINDER_HOUR;

  const now = new Date();
  const next = new Date();
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  chrome.alarms.clear("daily_reminder", () => {
    chrome.alarms.create("daily_reminder", {
      when: next.getTime(),
      periodInMinutes: 24 * 60,
    });
  });
}

async function sendDailyNotification() {
  const problems = await getAllProblems();
  const todayProblems = getTodayProblems(problems);

  if (todayProblems.length === 0) return;

  const count = todayProblems.length;
  const preview = todayProblems
    .slice(0, 3)
    .map((p) => p.title)
    .join("\n");

  chrome.notifications.create({
    type: "basic",
    iconUrl:
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">📚</text></svg>',
    title: `ReHash: ${count} problem${count > 1 ? "s" : ""} to revise today`,
    message: preview + (count > 3 ? `\n...and ${count - 3} more` : ""),
    priority: 1,
  });
}
