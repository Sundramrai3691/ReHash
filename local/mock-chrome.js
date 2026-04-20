(function bootstrapMockChrome() {
  const storageState = {
    notionUrl: "https://www.notion.so/my-revision-log",
    revise_mate_data: {
      problems: {
        "leetcode|/problems/two-sum": {
          id: "leetcode|/problems/two-sum",
          title: "1. Two Sum",
          url: "https://leetcode.com/problems/two-sum",
          site: "leetcode",
          difficulty: "Easy",
          topics: ["Array", "Hash Table"],
          addedAt: Date.now() - 3 * DAY,
          bucketIndex: 1,
          nextReviewAt: startOfDay(Date.now()),
          notes: "Review complement lookup edge cases.",
          history: [
            { date: Date.now() - 3 * DAY, action: "added" },
            { date: Date.now() - 2 * DAY, action: "revised" }
          ],
          completed: false
        },
        "codeforces|/contest/4/problem/A": {
          id: "codeforces|/contest/4/problem/A",
          title: "4A. Watermelon",
          url: "https://codeforces.com/contest/4/problem/A",
          site: "codeforces",
          difficulty: "800",
          topics: ["Math", "Brute Force"],
          addedAt: Date.now() - 5 * DAY,
          bucketIndex: 2,
          nextReviewAt: endOfDay(Date.now() + DAY),
          notes: "",
          history: [{ date: Date.now() - 5 * DAY, action: "added" }],
          completed: false
        }
      },
      settings: {
        intervals: [1, 2, 3, 7, 14],
        reminderHour: 19
      }
    },
    solvedSessions: [
      {
        problemTitle: "1. Two Sum",
        url: "https://leetcode.com/problems/two-sum",
        site: "leetcode",
        tags: ["Array", "Hash Table"],
        timeTaken: 420,
        note: "Missed duplicate number case first.",
        date: new Date(Date.now() - DAY).toISOString(),
        notionOpened: true
      },
      {
        problemTitle: "4A. Watermelon",
        url: "https://codeforces.com/contest/4/problem/A",
        site: "codeforces",
        tags: ["Math"],
        timeTaken: 180,
        note: "",
        date: new Date(Date.now() - 2 * DAY).toISOString(),
        notionOpened: false
      }
    ]
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readStorage(keys) {
    if (typeof keys === "string") {
      return { [keys]: clone(storageState[keys]) };
    }

    if (Array.isArray(keys)) {
      return keys.reduce((accumulator, key) => {
        accumulator[key] = clone(storageState[key]);
        return accumulator;
      }, {});
    }

    if (keys && typeof keys === "object") {
      return Object.entries(keys).reduce((accumulator, [key, defaultValue]) => {
        accumulator[key] = key in storageState ? clone(storageState[key]) : defaultValue;
        return accumulator;
      }, {});
    }

    return clone(storageState);
  }

  function updateStorage(values) {
    Object.assign(storageState, clone(values));
  }

  async function handleRuntimeMessage(message) {
    const data = storageState.revise_mate_data;
    const settings = data.settings;

    switch (message.action) {
      case "get_all_problems":
        return clone(data.problems);
      case "get_settings":
        return clone(settings);
      case "update_settings":
        data.settings = { ...settings, ...clone(message.settings) };
        return { success: true };
      case "save_problem": {
        const now = Date.now();
        const id = `${message.problem.site}|${message.problem.url}`;
        data.problems[id] = {
          id,
          title: message.problem.title,
          url: message.problem.url,
          site: message.problem.site,
          difficulty: message.problem.difficulty || "Unknown",
          topics: Array.isArray(message.problem.tags) ? clone(message.problem.tags) : [],
          addedAt: now,
          bucketIndex: 0,
          nextReviewAt: now + settings.intervals[0] * DAY,
          notes: "",
          history: [{ date: now, action: "added" }],
          completed: false
        };
        return { id, success: true };
      }
      case "mark_revised": {
        const problem = data.problems[message.problemId];
        if (!problem) {
          return { success: false };
        }
        const now = Date.now();
        problem.history.push({ date: now, action: "revised" });
        if (problem.bucketIndex < settings.intervals.length - 1) {
          problem.bucketIndex += 1;
          problem.nextReviewAt = now + settings.intervals[problem.bucketIndex] * DAY;
        } else {
          problem.completed = true;
          problem.nextReviewAt = null;
        }
        return { success: true };
      }
      case "move_bucket": {
        const problem = data.problems[message.problemId];
        if (!problem) {
          return { success: false };
        }
        problem.bucketIndex = message.bucketIndex;
        problem.completed = false;
        problem.nextReviewAt = Date.now() + settings.intervals[message.bucketIndex] * DAY;
        return { success: true };
      }
      case "update_notes": {
        const problem = data.problems[message.problemId];
        if (!problem) {
          return { success: false };
        }
        problem.notes = message.notes;
        return { success: true };
      }
      case "delete_problem":
        delete data.problems[message.problemId];
        return { success: true };
      case "GET_NOTION_URL":
        return { notionUrl: storageState.notionUrl };
      case "OPEN_NOTION_URL":
        window.open(message.url || storageState.notionUrl, "_blank", "noopener");
        return { success: true };
      case "SAVE_SESSION":
        storageState.solvedSessions.push({
          ...clone(message.session),
          date: message.session.date || new Date().toISOString()
        });
        return { success: true };
      default:
        return {};
    }
  }

  const tabsApi = {
    query() {
      return Promise.resolve([
        {
          id: 1,
          url: "https://leetcode.com/problems/two-sum"
        }
      ]);
    },
    sendMessage() {
      return Promise.resolve({
        title: "1. Two Sum",
        url: "https://leetcode.com/problems/two-sum",
        site: "leetcode",
        difficulty: "Easy",
        tags: ["Array", "Hash Table"]
      });
    }
  };

  const storageApi = {
    local: {
      get(keys, callback) {
        const result = readStorage(keys);
        if (typeof callback === "function") {
          callback(result);
          return;
        }
        return Promise.resolve(result);
      },
      set(values, callback) {
        updateStorage(values);
        if (typeof callback === "function") {
          callback();
          return;
        }
        return Promise.resolve();
      },
      remove(keys, callback) {
        const keysToDelete = Array.isArray(keys) ? keys : [keys];
        for (const key of keysToDelete) {
          delete storageState[key];
        }
        if (typeof callback === "function") {
          callback();
          return;
        }
        return Promise.resolve();
      }
    }
  };

  const chromeApi = window.chrome || {};
  chromeApi.runtime = {
    ...(chromeApi.runtime || {}),
    sendMessage(message, callback) {
      const response = handleRuntimeMessage(message);
      if (typeof callback === "function") {
        response.then((result) => callback(result));
        return;
      }
      return response;
    }
  };
  chromeApi.storage = storageApi;
  chromeApi.tabs = tabsApi;
  window.chrome = chromeApi;
})();

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}
