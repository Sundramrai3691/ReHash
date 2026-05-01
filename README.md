# ReHash

ReHash is a Chrome extension for revising DSA problems from LeetCode and Codeforces with spaced repetition, solve tracking, Striver A2Z tagging, and lightweight local analytics.

## Current Features

- Detects problem title, site, difficulty, tags, and Striver A2Z mapping on supported LeetCode and Codeforces pages
- Injects a floating solve timer on problem pages with `Start`, `Pause/Resume`, and `Reset`
- Persists LeetCode timer state in `chrome.storage.local` per problem URL so tab switches and editor interactions do not reset progress
- Detects accepted LeetCode submissions through DOM observation and opens a post-solve logging flow
- Shows a Striver A2Z banner on matched problems with step, topic, and next iteration badge
- Saves problems directly from the popup or through manual entry
- Supports bucket-based review scheduling plus custom `nextReviewDate`
- Tracks iteration count and linked solve-session IDs per problem
- Provides a `Today's Queue` tab with due problems, overdue prioritization, step-aware ordering, and `Solve Now`
- Tracks daily completion progress for due problems
- Supports notes, bucket moves, delete, CSV export, and manual review actions
- Records solve sessions with iteration, time taken, approach, mistakes, notes, confidence, tags, and next review date
- Shows solve analytics including streak, weekly solve count, average time, topic breakdown, speed progress charts, and slower-problem alerts
- Syncs solve history to GitHub Gist from the background service worker
- Stores everything locally in `chrome.storage.local`

## Supported Sites

- LeetCode: `https://leetcode.com/problems/*`
- Codeforces:
  - `https://codeforces.com/problemset/problem/*`
  - `https://codeforces.com/contest/*/problem/*`

## Popup Tabs

- `Today`: all problems currently due from bucket review or custom review dates
- `Queue`: daily queue sorted by overdue status and Striver step order
- `All Problems`: full saved library with search and topic filters
- `Add/Save`: page extraction plus manual add form
- `Stats`: solve analytics and speed improvement charts
- `Settings`: review settings, Notion URL, and GitHub Gist sync controls

## Timer and Solve Flow

### LeetCode Timer

- Timer state is stored per normalized problem URL
- Stored fields:
  - `startEpoch`
  - `isRunning`
  - `isPaused`
  - `pausedAccumMs`
- Elapsed time is computed from epoch time, not from in-memory counters
- When the tab becomes hidden, only the display interval pauses; the stored timer continues correctly

### Post-Solve Logging

After an accepted LeetCode submission:

1. Choose the iteration (`1st`, `2nd`, `3rd`, `4th+`)
2. If iteration is `2nd` or later, choose the next review window
3. Log:
   - time taken
   - approach used
   - mistakes made
   - notes
   - confidence
4. Save the solve session and optionally open your Notion log

## Striver A2Z Integration

`extension/striver-sheet.js` contains Step 1 to Step 4 of the Striver A2Z sheet as structured metadata.

Each entry stores:

```js
{
  id: "step3-15",
  step: "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]",
  topic: "Array Medium",
  title: "2Sum Problem",
  leetcodeUrl: "https://leetcode.com/problems/two-sum/",
  codeforcesUrl: null,
  difficulty: "Medium"
}
```

The content scripts use this file to:

- match the current problem URL
- inject a Striver banner below the title
- prefill Striver metadata on saved problems and solve sessions

## Daily Queue Logic

Problems appear in the queue when either of these is true:

- `nextReviewAt <= end of today`
- `nextReviewDate <= today`

Queue ordering:

1. overdue problems first
2. older due dates first
3. lower Striver step numbers first

Queue progress is based on how many due problems already have a solve session logged today.

## Data Model

### Problem Record

Stored in `revise_mate_data.problems`:

```js
{
  id: "leetcode|/problems/two-sum",
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  site: "leetcode",
  difficulty: "Easy",
  topics: ["Array", "Hash Table"],
  addedAt: 1715231000000,
  bucketIndex: 0,
  nextReviewAt: 1715317400000,
  nextReviewDate: "2026-05-07",
  notes: "",
  history: [{ date: 1715231000000, action: "added" }],
  completed: false,
  iterationCount: 2,
  striverId: "step3-15",
  striverStep: "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]",
  striverTopic: "Array Medium",
  solveSessionIds: ["https://leetcode.com/problems/two-sum/|2026-05-02T10:00:00.000Z"]
}
```

### Solve Session

Stored in `solvedSessions`:

```js
{
  id: "https://leetcode.com/problems/two-sum/|2026-05-02T10:00:00.000Z",
  problemUrl: "https://leetcode.com/problems/two-sum/",
  problemTitle: "Two Sum",
  striverId: "step3-15",
  striverStep: "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]",
  striverTopic: "Array Medium",
  iteration: 2,
  timeTakenMs: 483000,
  approach: "Two pointers, O(n)",
  mistakes: "Missed duplicate handling",
  notes: "Remember to sort first",
  confidence: "Medium",
  date: "2026-05-02T10:00:00.000Z",
  nextReviewDate: "2026-05-07",
  reviewDecision: "scheduled",
  site: "leetcode",
  tags: ["Array", "Hash Table"],
  notionOpened: true,
  difficulty: "Easy"
}
```

## Settings

Configurable settings:

- review intervals
- daily reminder hour
- daily GitHub sync hour
- Notion log URL
- GitHub token
- GitHub Gist ID
- auto-sync after solve

Defaults:

- intervals: `1,2,3,7,14`
- reminder hour: `19`
- sync hour: `21`
- notion URL: `https://www.notion.so`

## GitHub Gist Sync

The background service worker can sync solve history to a GitHub Gist.

Files pushed to the Gist:

- `rehash-sessions.json`
- `rehash-summary.md`

Behavior:

- creates a new Gist if no Gist ID is saved
- updates the existing Gist when an ID is present
- stores the last sync timestamp in settings
- can auto-sync after each solve session
- also schedules a daily `rehash-daily-sync` alarm

## Local Workflow

### Commands

- `npm test` runs the local tests
- `npm run build` validates the extension and stages a loadable bundle in `dist/rehash-extension`
- `npm run preview` serves the popup preview at `http://127.0.0.1:4173/local/popup-preview.html`
- `npm run check` runs tests and then the build

## Installation

1. Run `npm run build`
2. Open `chrome://extensions/`
3. Enable Developer Mode
4. Click `Load unpacked`
5. Select `dist/rehash-extension`

## Project Structure

```text
extension/
├─ manifest.json
├─ background.js
├─ popup.html
├─ popup.js
├─ styles.css
├─ striver-sheet.js
├─ content-leetcode.js
└─ content-codeforces.js
```

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript
- Background service worker
- Content scripts for LeetCode and Codeforces
- `chrome.storage.local` persistence only
