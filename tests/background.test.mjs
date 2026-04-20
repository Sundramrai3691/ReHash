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

test("saveSolvedSession records solve stats safely", async () => {
  const { context, storage } = createBackgroundHarness();
  await context.initializeSettings();

  const response = await context.saveSolvedSession({
    problemTitle: "Two Sum",
    url: "https://leetcode.com/problems/two-sum",
    site: "leetcode",
    tags: ["Array", "Hash Table"],
    timeTaken: 321,
    notionOpened: true
  });

  assert.equal(response.success, true);
  const sessions = storage.get("solvedSessions");
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].timeTaken, 321);
  assert.equal(sessions[0].notionOpened, true);
});
