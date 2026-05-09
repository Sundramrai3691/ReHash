# ReHash

ReHash is a Chrome Extension for revising DSA problems from LeetCode and Codeforces with spaced repetition, solve-session tracking, Striver A2Z mapping, local analytics, GitHub Gist sync, and AI interview-style code review.

The extension is intentionally simple to load and modify:

- Manifest V3
- Vanilla JavaScript
- No framework
- No bundler
- No TypeScript
- Loaded directly from the `extension/` folder

## Features

- Detects problem title, site, difficulty, tags, and Striver A2Z mapping on supported problem pages.
- Injects a compact floating ReHash timer on LeetCode and Codeforces.
- Timer collapses into a draggable 48px floating action button.
- Timer widget is fully draggable and position is remembered per problem.
- Timer state is stored in `sessionStorage` per problem slug so tab switches, clicks, editor re-renders, and submissions do not reset it.
- Supports Start, Pause, Resume, and Done.
- Shows `Solve N of this problem` based on previous solve history.
- Detects accepted submissions using `MutationObserver`.
- Opens a solve-session modal after Done or accepted submission.
- Records approach, mistakes, tags, solve iteration, time taken, bucket choice, and completed status.
- Shows previous solve history with faster/slower deltas.
- Schedules spaced repetition review buckets, defaulting to `2, 5, 10` days.
- Tracks Striver A2Z progress.
- Provides popup tabs for Today, Queue, All Problems, Add/Save, Stats, and Settings.
- Syncs solve history to GitHub Gist.
- Runs AI code review through Gemini, Groq, and OpenRouter fallback.
- Auto-triggers AI review after accepted submission when enabled.

## Supported Sites

- LeetCode: `https://leetcode.com/problems/*`
- Codeforces:
  - `https://codeforces.com/problemset/problem/*/*`
  - `https://codeforces.com/contest/*/problem/*`

## Installation

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select the `extension/` folder directly.
5. Open a supported LeetCode or Codeforces problem page.

No build step is required.

## Project Structure

```text
extension/
├── manifest.json
├── background.js
├── content-leetcode.js
├── content-codeforces.js
├── review-panel.js
├── popup.html
├── popup.js
├── styles.css
├── striver-sheet.js
└── icons/
    └── icon-128.png
```

## File Overview

### `extension/manifest.json`

Defines the Chrome Extension.

Responsibilities:

- Uses Manifest V3.
- Registers `background.js` as the service worker.
- Registers `popup.html` as the extension popup.
- Injects content scripts on LeetCode and Codeforces problem pages.
- Grants storage, alarms, notifications, tabs, active tab, and scripting permissions.
- Grants host permissions for LeetCode, Codeforces, GitHub, Gemini, Groq, and OpenRouter.
- Registers the packaged extension icon.

### `extension/background.js`

The extension backend/service worker.

Responsibilities:

- Initializes and normalizes local storage.
- Stores settings, problems, solve sessions, and Striver progress.
- Handles popup and content-script messages.
- Saves solve sessions through `SAVE_SESSION`.
- Returns solve history through `GET_PROBLEM_INFO`.
- Updates review buckets and next review dates.
- Handles GitHub Gist sync.
- Creates daily reminder and sync alarms.
- Creates Chrome notifications safely.
- Runs AI code reviews through provider fallback:
  - Gemini 2.0 Flash
  - Groq Llama 3.3 70B
  - OpenRouter DeepSeek R1
- Cleans AI responses by removing markdown fences and `<think>...</think>` blocks before JSON parsing.

### `extension/content-leetcode.js`

Injected on LeetCode problem pages.

Responsibilities:

- Extracts LeetCode problem metadata.
- Finds Striver A2Z mapping for the current problem.
- Injects the floating timer widget using Shadow DOM.
- Supports compact FAB mode and expanded timer mode.
- Persists collapsed state with `rehash_collapsed_{slug}`.
- Persists widget position with `rehash_pos_{slug}`.
- Persists timer state with the existing `rehash_timer_state::leetcode::{slug}` key.
- Restores running timer elapsed time using wall-clock recovery.
- Handles Start, Pause, Resume, and Done.
- Detects accepted submissions with `MutationObserver`.
- Opens the solve-session modal.
- Sends solve sessions to `background.js`.
- Auto-triggers the AI review panel after accepted submission when enabled.

### `extension/content-codeforces.js`

Injected on Codeforces problem pages.

Responsibilities:

- Extracts Codeforces problem metadata.
- Finds Striver A2Z mapping for the current problem.
- Injects the same compact draggable timer widget as LeetCode.
- Persists collapsed state and position per problem.
- Persists timer state with the existing `rehash_timer_state::codeforces::{slug}` key.
- Detects accepted verdicts with `MutationObserver`.
- Opens the solve-session modal.
- Sends solve sessions to `background.js`.
- Auto-triggers AI review after accepted verdict when enabled.

### `extension/review-panel.js`

Injected alongside the site content scripts.

Responsibilities:

- Exposes:

```js
window.ReHashReviewPanel.trigger(site, title, url)
```

- Extracts code from LeetCode or Codeforces editors.
- Detects language from the page UI.
- Sends code to `background.js` through `AI_REVIEW`.
- Renders a dark floating review card.
- Displays:
  - verdict
  - score
  - summary
  - time and space complexity
  - optimality note
  - issues sorted by severity
  - naming suggestions
  - positives
  - improved code
  - interview tips
  - provider log details

### `extension/popup.html`

Defines the popup markup.

Main tabs:

- Today
- Queue
- All Problems
- Add/Save
- Stats
- Settings

The Settings tab includes review settings, Notion URL, GitHub Gist sync controls, AI API keys, and the auto-review toggle.

### `extension/popup.js`

Controls popup behavior.

Responsibilities:

- Loads problems, solve sessions, and settings.
- Renders due problems and queue progress.
- Supports search and topic filtering.
- Saves extracted or manually entered problems.
- Marks problems revised.
- Moves problems between buckets.
- Edits notes.
- Deletes problems.
- Exports CSV.
- Renders solve analytics.
- Saves GitHub, Notion, review, and AI settings.
- Triggers GitHub Gist sync.

### `extension/styles.css`

Styles the popup UI.

Responsibilities:

- Popup layout
- Tabs
- Problem cards
- Queue cards
- Forms
- Buttons
- Settings sections
- Stats grid
- Toasts
- Notes modal

Content-script widgets and the AI review panel do not rely on this file. They use Shadow DOM or injected styles.

### `extension/striver-sheet.js`

Contains the local Striver A2Z problem database and helpers.

Responsibilities:

- Exposes Striver sheet data globally.
- Normalizes problem URLs.
- Maps current LeetCode/Codeforces URLs to Striver entries.
- Provides step-order helpers for queue sorting.

### `extension/icons/icon-128.png`

Packaged extension icon.

Used for:

- Extension icon
- Popup action icon
- Chrome notifications

## Timer Widget

The timer widget is injected into supported problem pages through the site content script.

Collapsed mode:

- 48px circular FAB
- Hash-style ReHash icon
- Tooltip: `Open ReHash`
- Amber pulse ring while timer is running
- Draggable anywhere on screen

Expanded mode:

- Compact dark panel around 220px wide
- Header with ReHash label, truncated problem title, and collapse button
- Solve iteration info
- Large amber timer
- Icon-only Start, Pause/Resume, and Done buttons
- CSS tooltips using `[data-tooltip]`

Per-problem widget keys:

```text
rehash_collapsed_{slug}
rehash_pos_{slug}
```

Timer state remains separate from widget state.

## Solve Session Flow

1. Open a supported problem page.
2. Click the FAB to expand ReHash.
3. Start the timer.
4. Pause or resume as needed.
5. Click Done, or submit an accepted solution.
6. ReHash opens the solve-session modal.
7. Enter:
   - approach or technique
   - mistakes or gotchas
   - review bucket or Done
8. Save the session.
9. ReHash updates solve history, review schedule, and Striver progress.

## AI Code Review

ReHash can review submitted code after an accepted solution.

Provider order:

1. Gemini 2.0 Flash
2. Groq Llama 3.3 70B
3. OpenRouter DeepSeek R1

If a provider has no key, it is skipped. If a provider fails or rate-limits, ReHash tries the next configured provider.

The AI review response is rendered as structured JSON with:

- verdict
- score
- summary
- complexity
- issues
- naming issues
- positives
- improved code
- interview tips

All provider requests happen in `background.js`. Content scripts do not make cross-origin LLM requests.

## Settings

Configurable settings include:

- Review intervals
- Bucket days
- Daily reminder hour
- Queue sync hour
- Notion log URL
- GitHub token
- GitHub Gist ID
- Auto-sync after solve
- Gemini API key
- Groq API key
- OpenRouter API key
- Auto-review on accepted submission

Defaults:

```js
{
  intervals: [1, 2, 3, 7, 14],
  bucketDays: [2, 5, 10],
  reminderHour: 19,
  syncHour: 21,
  notionUrl: "https://www.notion.so",
  autoReviewOnAccept: true
}
```

## Data Storage

ReHash uses Chrome local storage for durable extension data:

- `revise_mate_data`
- `solvedSessions`
- `notionUrl`

The page timer uses `sessionStorage`, scoped by problem slug, so different problems do not share timer state.

### Problem Record

Stored under `revise_mate_data.problems`:

```js
{
  id: "leetcode|/problems/two-sum",
  title: "Two Sum",
  url: "https://leetcode.com/problems/two-sum/",
  site: "leetcode",
  difficulty: "Easy",
  topics: ["Array", "Hash Table"],
  addedAt: 1715231000000,
  bucketIndex: 1,
  bucket: 1,
  nextReviewAt: 1715317400000,
  nextReviewDate: "2026-05-11",
  notes: "",
  history: [{ date: 1715231000000, action: "solved", iteration: 2 }],
  completed: false,
  iterationCount: 2,
  totalSolves: 2,
  striverId: "step3-15",
  striverStep: "Step 3: Solve Problems on Arrays [Easy -> Medium -> Hard]",
  striverTopic: "Array Medium",
  solveSessionIds: ["sess_1715231000000"]
}
```

### Solve Session

Stored in `solvedSessions`:

```js
{
  id: "sess_1715231000000",
  problemId: "leetcode|/problems/two-sum",
  problemUrl: "https://leetcode.com/problems/two-sum/",
  url: "https://leetcode.com/problems/two-sum/",
  problemTitle: "Two Sum",
  striverId: "step3-15",
  iteration: 2,
  timeSecs: 483,
  timeTaken: 483,
  timeTakenMs: 483000,
  approach: "Hash map lookup in one pass",
  mistakes: "Initially missed duplicate values",
  tags: ["Array", "Hash Table"],
  site: "leetcode",
  difficulty: "Easy",
  nextBucketDays: 5,
  markCompleted: false,
  date: "2026-05-09T10:00:00.000Z"
}
```

## GitHub Gist Sync

ReHash can sync solve history to a GitHub Gist.

Files written:

- `rehash-sessions.json`
- `rehash-summary.md`

Behavior:

- Creates a new private Gist when no Gist ID is configured.
- Updates an existing Gist when an ID is present.
- Stores the last sync timestamp.
- Can sync after each solve session.
- Can also run through the daily sync alarm.

## Development Notes

- Load `extension/` directly in Chrome.
- Edit JS, HTML, or CSS files directly.
- Reload the unpacked extension after changes.
- For content script changes, refresh the problem page.
- For background changes, open `chrome://extensions`, reload the extension, then inspect the service worker if needed.

Useful syntax checks:

```powershell
node --check extension\background.js
node --check extension\content-leetcode.js
node --check extension\content-codeforces.js
node --check extension\review-panel.js
node --check extension\popup.js
```

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript
- Shadow DOM for page widgets
- Background service worker
- `chrome.storage.local`
- `sessionStorage` for per-page timer/widget state
