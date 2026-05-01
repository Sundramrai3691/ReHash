import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

function createBackgroundHarness() {
  const storage = new Map();

  const chrome = {
    alarms: {
      clear(_name, callback) {
        if (callback) {
          callback();
        }
      },
      create() {},
      onAlarm: { addListener() {} }
    },
    notifications: {
      create() {}
    },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener() {} },
      onStartup: { addListener() {} }
    },
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === "string") {
            return { [keys]: structuredClone(storage.get(keys)) };
          }
          if (Array.isArray(keys)) {
            return keys.reduce((accumulator, key) => {
              accumulator[key] = structuredClone(storage.get(key));
              return accumulator;
            }, {});
          }
          return Object.fromEntries([...storage.entries()].map(([key, value]) => [key, structuredClone(value)]));
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) {
            storage.set(key, structuredClone(value));
          }
        }
      }
    },
    tabs: {
      async create({ url }) {
        return { id: 1, url };
      }
    }
  };

  const context = vm.createContext({
    URL,
    chrome,
    console,
    Date,
    setTimeout,
    clearTimeout,
    structuredClone
  });

  const backgroundSource = fs.readFileSync(
    path.join(process.cwd(), "extension", "background.js"),
    "utf8"
  );

  vm.runInContext(backgroundSource, context, { filename: "background.js" });
  return { context, storage };
}

test("saveProblem stores a new problem with initial review schedule", async () => {
  const { context, storage } = createBackgroundHarness();
  await context.initializeSettings();

  const result = await context.saveProblem({
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum",
    site: "leetcode",
    tags: ["Array"],
    difficulty: "Easy"
  });

  assert.equal(result.success, true);

  const data = storage.get("revise_mate_data");
  const problem = data.problems[result.id];
  assert.equal(problem.bucketIndex, 0);
  assert.equal(problem.completed, false);
  assert.deepEqual(problem.topics, ["Array"]);
  assert.equal(problem.history[0].action, "added");
  assert.equal(problem.iterationCount, 0);
  assert.equal(problem.nextReviewDate, null);
  assert.deepEqual(problem.solveSessionIds, []);
});

test("markRevised advances the bucket and schedules the next review", async () => {
  const { context, storage } = createBackgroundHarness();
  await context.initializeSettings();
  const result = await context.saveProblem({
    title: "Watermelon",
    url: "https://codeforces.com/contest/4/problem/A",
    site: "codeforces",
    tags: ["Math"],
    difficulty: "800"
  });

  await context.markRevised(result.id);

  const data = storage.get("revise_mate_data");
  const problem = data.problems[result.id];
  assert.equal(problem.bucketIndex, 1);
  assert.equal(problem.completed, false);
  assert.equal(problem.history.at(-1).action, "revised");
});

test("saveSolvedSession records solve stats and updates the linked problem", async () => {
  const { context, storage } = createBackgroundHarness();
  await context.initializeSettings();
  await context.saveProblem({
    title: "Two Sum",
    url: "https://leetcode.com/problems/two-sum/",
    site: "leetcode",
    tags: ["Array", "Hash Table"],
    difficulty: "Easy",
    striverId: "step3-15"
  });

  const response = await context.saveSolvedSession({
    problemTitle: "Two Sum",
    problemUrl: "https://leetcode.com/problems/two-sum/",
    site: "leetcode",
    striverId: "step3-15",
    iteration: 2,
    tags: ["Array", "Hash Table"],
    timeTakenMs: 321000,
    notionOpened: true,
    confidence: "Medium",
    date: "2026-05-02T10:00:00.000Z",
    nextReviewDate: "2026-05-07",
    reviewDecision: "scheduled"
  });

  assert.equal(response.success, true);
  const sessions = storage.get("solvedSessions");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].timeTakenMs, 321000);
  assert.equal(sessions[0].notionOpened, true);
  assert.equal(sessions[0].iteration, 2);

  const problem = storage.get("revise_mate_data").problems["leetcode|/problems/two-sum"];
  assert.equal(problem.iterationCount, 2);
  assert.equal(problem.nextReviewDate, "2026-05-07");
  assert.equal(problem.solveSessionIds.length, 1);
});

test("getProblemsForToday includes custom nextReviewDate entries", async () => {
  const { context, storage } = createBackgroundHarness();
  await context.initializeSettings();

  storage.set("revise_mate_data", {
    problems: {
      "leetcode|/problems/two-sum": {
        id: "leetcode|/problems/two-sum",
        title: "Two Sum",
        url: "https://leetcode.com/problems/two-sum/",
        site: "leetcode",
        difficulty: "Easy",
        topics: ["Array"],
        bucketIndex: 0,
        nextReviewAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
        nextReviewDate: "2026-05-01",
        history: [],
        solveSessionIds: [],
        iterationCount: 1,
        completed: false
      }
    },
    settings: {
      intervals: [1, 2, 3, 7, 14],
      reminderHour: 19,
      syncHour: 21
    }
  });

  const dueProblems = context.getProblemsForToday(storage.get("revise_mate_data").problems);
  assert.equal(dueProblems.length, 1);
  assert.equal(dueProblems[0].title, "Two Sum");
});
