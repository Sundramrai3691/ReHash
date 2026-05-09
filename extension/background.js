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
  const messageType = request.type || request.action;
  if (messageType === "GET_PROBLEM_INFO") {
    getProblemInfo(request).then(sendResponse);
    return true;
  }
  if (messageType === "AI_REVIEW") {
    runAiReview(request).then(sendResponse);
    return true;
  }
  if (messageType === "SAVE_SESSION") {
    saveSolvedSessionV2(request.session).then(sendResponse);
    return true;
  }
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
    striverProgress: store.striverProgress && typeof store.striverProgress === "object" ? store.striverProgress : {},
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
    autoSyncGist: false,
    githubLastSyncAt: null,
    bucketDays: [2, 5, 10],
    geminiKey: "",
    groqKey: "",
    openrouterKey: "",
    autoReviewOnAccept: true,
  };
}

function sanitizeSettings(settings) {
  const safeSettings = settings && typeof settings === "object" ? settings : {};
  const intervals = Array.isArray(safeSettings.intervals)
    ? safeSettings.intervals.map((value) => parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0)
    : undefined;
  const reminderHour = parseInt(safeSettings.reminderHour, 10);
  const syncHour = parseInt(safeSettings.syncHour, 10);
  const bucketDays = Array.isArray(safeSettings.bucketDays)
    ? safeSettings.bucketDays.map((value) => parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0)
    : undefined;

  return {
    ...(intervals && intervals.length > 0 ? { intervals } : {}),
    ...(bucketDays && bucketDays.length > 0 ? { bucketDays } : {}),
    ...(Number.isFinite(reminderHour) && reminderHour >= 0 && reminderHour <= 23 ? { reminderHour } : {}),
    ...(Number.isFinite(syncHour) && syncHour >= 0 && syncHour <= 23 ? { syncHour } : {}),
    ...(typeof safeSettings.githubToken === "string" ? { githubToken: safeSettings.githubToken.trim() } : {}),
    ...(typeof safeSettings.githubGistId === "string" ? { githubGistId: safeSettings.githubGistId.trim() } : {}),
    ...(typeof safeSettings.githubAutoSync === "boolean" ? { githubAutoSync: safeSettings.githubAutoSync } : {}),
    ...(typeof safeSettings.autoSyncGist === "boolean" ? { autoSyncGist: safeSettings.autoSyncGist } : {}),
    ...(typeof safeSettings.geminiKey === "string" ? { geminiKey: safeSettings.geminiKey.trim() } : {}),
    ...(typeof safeSettings.groqKey === "string" ? { groqKey: safeSettings.groqKey.trim() } : {}),
    ...(typeof safeSettings.openrouterKey === "string" ? { openrouterKey: safeSettings.openrouterKey.trim() } : {}),
    ...(typeof safeSettings.autoReviewOnAccept === "boolean" ? { autoReviewOnAccept: safeSettings.autoReviewOnAccept } : {}),
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

async function saveSolvedSessionV2(session) {
  if (!session || !session.problemTitle || !(session.problemUrl || session.url)) {
    return { ok: false, success: false, error: "invalid_session" };
  }

  const [store, sessions] = await Promise.all([getStore(), getSolvedSessions()]);
  const settings = store.settings;
  const problemUrl = normalizeProblemUrl(session.problemUrl || session.url);
  const site = session.site || inferSiteFromUrl(problemUrl) || "unknown";
  const problemId = session.problemId || generateId(site, problemUrl);
  const now = new Date();
  const sessionRecord = {
    id: `sess_${Date.now()}`,
    problemId,
    problemUrl,
    url: problemUrl,
    problemTitle: session.problemTitle,
    striverId: session.striverId || null,
    iteration: clampPositiveInt(session.iteration, sessions.filter((item) => normalizeProblemUrl(item.problemUrl || item.url || "") === problemUrl).length + 1),
    timeSecs: Math.max(0, Math.round(Number(session.timeSecs ?? session.timeTaken ?? 0))),
    timeTaken: Math.max(0, Math.round(Number(session.timeSecs ?? session.timeTaken ?? 0))),
    timeTakenMs: Math.max(0, Math.round(Number(session.timeSecs ?? session.timeTaken ?? 0) * 1000)),
    approach: session.approach || "",
    mistakes: session.mistakes || "",
    tags: Array.isArray(session.tags) ? session.tags : [],
    site,
    difficulty: session.difficulty || "Unknown",
    nextBucketDays: Number.isFinite(session.nextBucketDays) ? session.nextBucketDays : null,
    markCompleted: Boolean(session.markCompleted),
    date: now.toISOString(),
  };

  const existingProblem = normalizeProblem(store.problems[problemId] || {});
  const bucketDays = Array.isArray(settings.bucketDays) && settings.bucketDays.length ? settings.bucketDays : [2, 5, 10];
  const nextBucket = Math.min((existingProblem.bucket ?? existingProblem.bucketIndex ?? 0) + 1, bucketDays.length - 1);
  const nextReviewDate = sessionRecord.markCompleted
    ? null
    : addDaysIso(Number.isFinite(sessionRecord.nextBucketDays) ? sessionRecord.nextBucketDays : bucketDays[nextBucket] || bucketDays[0]);

  store.problems[problemId] = normalizeProblem({
    ...existingProblem,
    id: problemId,
    title: sessionRecord.problemTitle,
    url: problemUrl,
    site,
    difficulty: existingProblem.difficulty || sessionRecord.difficulty,
    topics: existingProblem.topics.length ? existingProblem.topics : sessionRecord.tags,
    addedAt: existingProblem.addedAt || Date.now(),
    history: [...existingProblem.history, { action: "solved", date: now.getTime(), iteration: sessionRecord.iteration }],
    iterationCount: Math.max(existingProblem.iterationCount || 0, sessionRecord.iteration),
    totalSolves: (existingProblem.totalSolves || 0) + 1,
    bucket: nextBucket,
    bucketIndex: nextBucket,
    nextReviewDate,
    nextReviewAt: nextReviewDate ? Date.parse(nextReviewDate) : null,
    completed: sessionRecord.markCompleted ? true : false,
    striverId: sessionRecord.striverId || existingProblem.striverId || null,
    solveSessionIds: addUnique(existingProblem.solveSessionIds, sessionRecord.id),
  });

  if (sessionRecord.striverId) {
    store.striverProgress[sessionRecord.striverId] = {
      lastSolvedAt: sessionRecord.date,
      totalSolves: sessionRecord.iteration,
      lastTimeSecs: sessionRecord.timeSecs,
    };
  }

  const nextSessions = [...sessions, sessionRecord];
  await saveStorage(store, nextSessions);

  if ((settings.autoSyncGist || settings.githubAutoSync) && settings.githubToken) {
    void syncGithubGist();
  }

  return { ok: true, success: true, session: sessionRecord };
}

async function getProblemInfo({ url, title, site }) {
  const [store, sessions] = await Promise.all([getStore(), getSolvedSessions()]);
  const normalizedUrl = normalizeProblemUrl(url || "");
  const problem = Object.values(store.problems).map(normalizeProblem).find((item) =>
    item.url === normalizedUrl || (item.title === title && item.site === site),
  ) || null;
  const problemId = problem?.id || generateId(site || inferSiteFromUrl(normalizedUrl) || "unknown", normalizedUrl);
  const history = sessions
    .filter((session) => session.problemId === problemId || normalizeProblemUrl(session.problemUrl || session.url || "") === normalizedUrl)
    .sort((first, second) => (first.iteration || 0) - (second.iteration || 0));
  const totalSolves = problem?.totalSolves || history.length;
  return {
    ok: true,
    problem,
    history,
    totalSolves,
    nextIteration: totalSolves + 1,
  };
}

async function runAiReview(request) {
  const settings = await getSettings();
  const prompt = buildReviewPrompt(request);
  const providers = [
    {
      name: "Gemini 2.0 Flash",
      key: settings.geminiKey,
      call: () => callGemini(settings.geminiKey, prompt),
    },
    {
      name: "Groq Llama 3.3 70B",
      key: settings.groqKey,
      call: () => callGroq(settings.groqKey, prompt),
    },
    {
      name: "OpenRouter DeepSeek R1",
      key: settings.openrouterKey,
      call: () => callOpenRouter(settings.openrouterKey, prompt),
    },
  ];
  const log = [];

  if (!providers.some((provider) => provider.key)) {
    return { ok: false, error: "no_keys", message: "Add at least one AI reviewer API key in settings.", log };
  }

  for (const provider of providers) {
    if (!provider.key) {
      log.push({ provider: provider.name, ok: false, error: "missing_key" });
      continue;
    }

    try {
      const text = await provider.call();
      const review = parseReviewJson(text);
      log.push({ provider: provider.name, ok: true });
      return { ok: true, review, log };
    } catch (error) {
      log.push({ provider: provider.name, ok: false, error: error.message || "failed" });
    }
  }

  return { ok: false, error: "all_failed", message: "All configured AI reviewers failed.", log };
}

function buildReviewPrompt({ problemTitle, problemUrl, language, code }) {
  return `You are a senior software engineer conducting a technical interview code review. Analyze this solution to "${problemTitle}" with the mindset of a Google/Meta/Amazon interviewer.

Problem: ${problemTitle}
URL: ${problemUrl}
Language: ${language}

Submitted code:
\`\`\`${language}
${code}
\`\`\`

Respond ONLY with a valid JSON object - no markdown fences, no extra text:
{
  "verdict": "strong_hire" | "hire" | "borderline" | "no_hire",
  "score": <1-10>,
  "summary": "<2-3 sentence assessment>",
  "complexity": { "time": "O(...)", "space": "O(...)", "isOptimal": bool, "optimalNote": "..." },
  "issues": [{ "severity": "critical"|"major"|"minor"|"style", "title": "...", "description": "...", "fix": "..." }],
  "namingIssues": [{ "original": "...", "suggested": "...", "reason": "..." }],
  "positives": ["..."],
  "improvedCode": "<full improved code if score < 8, else empty string>",
  "interviewTips": "..."
}`;
}

async function callGemini(key, prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callGroq(key, prompt) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: "Return only valid JSON for technical interview code review." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callOpenRouter(key, prompt) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "HTTP-Referer": "https://github.com/rehash-extension",
      "X-Title": "ReHash DSA Reviewer",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-r1:free",
      messages: [
        { role: "system", content: "Return only valid JSON for technical interview code review." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseReviewJson(text) {
  const cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("invalid_json");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function saveStorage(store, sessions) {
  await chrome.storage.local.set({
    revise_mate_data: normalizeStore(store),
    solvedSessions: Array.isArray(sessions) ? sessions : await getSolvedSessions(),
  });
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
    problemId: session.problemId || generateId(site, problemUrl),
    problemUrl,
    url: problemUrl,
    problemTitle: session.problemTitle,
    striverId: session.striverId || null,
    striverStep: session.striverStep || null,
    striverTopic: session.striverTopic || null,
    iteration,
    timeSecs: Number.isFinite(session.timeSecs) ? Math.max(0, Math.round(session.timeSecs)) : Math.round(timeTakenMs / 1000),
    timeTaken: Number.isFinite(session.timeTaken) ? Math.max(0, Math.round(session.timeTaken)) : Math.round(timeTakenMs / 1000),
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
    nextBucketDays: Number.isFinite(session.nextBucketDays) ? session.nextBucketDays : null,
    markCompleted: Boolean(session.markCompleted),
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
    totalSolves: clampPositiveInt(rawProblem.totalSolves, rawProblem.iterationCount || 0),
    bucket: clampPositiveInt(rawProblem.bucket, rawProblem.bucketIndex || 0),
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
    iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
    title: `ReHash: ${count} problem${count > 1 ? "s" : ""} due today`,
    message: preview + (count > 3 ? `\n...and ${count - 3} more` : ""),
    priority: 1,
  }, () => {
    void chrome.runtime.lastError;
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

function addDaysIso(daysAhead) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
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
