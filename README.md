# ReHash - Chrome Extension

A minimal spaced repetition system for LeetCode and Codeforces problems.

## Local Workflow

This repo now includes a zero-dependency local workflow so you can test the project without manually guessing what broke.

### Available Commands

- `npm test` - runs local smoke tests against the extension logic and manifest references
- `npm run build` - validates the extension and stages a loadable bundle in `dist/rehash-extension`
- `npm run preview` - starts a local server for a popup-only preview at `http://127.0.0.1:4173/local/popup-preview.html`
- `npm run check` - runs both tests and the build

### What Each Flow Covers

- `npm run preview` is for quick local UI checks using a mocked Chrome API and seeded sample data
- `npm run build` is for preparing the folder you can load in `chrome://extensions`
- Loading the unpacked bundle in Chrome is still the real end-to-end test for content scripts, alarms, notifications, and tab APIs

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist/rehash-extension` folder after running `npm run build`
5. The ReHash extension should now appear in your extensions list

## Local Testing Checklist

1. Run `npm run check`
2. Run `npm run preview` and verify the popup UI works with sample data
3. Run `npm run build`
4. Load `dist/rehash-extension` in Chrome
5. Open a LeetCode or Codeforces problem page and test save, revise, notes, stats, and export flows

## Usage

1. Navigate to a LeetCode or Codeforces problem page
2. Click the ReHash extension icon in your toolbar
3. Click **Save to Revision** to add the problem
4. View problems due today in the **Today** tab
5. Mark problems as **Revised** to advance them in the SRS schedule
6. Export your data anytime via the **Export CSV** button

## Configuration

### SRS Intervals

Default intervals: `[1, 2, 3, 7, 14]` days

To customize:

1. Click **Settings** in the extension popup
2. Enter comma-separated days (e.g., `1,3,7,14,30`)
3. Click **Save Settings**

### Daily Reminder

Default: 19:00 (7 PM)

To change:

1. Click **Settings** in the extension popup
2. Enter hour in 24-hour format (0-23)
3. Click **Save Settings**

## Data Storage

All data is stored locally in `chrome.storage.local` under the key `revise_mate_data`. No external servers or accounts required.

## Features

- Auto-detect problem metadata on LeetCode/Codeforces
- Manual problem entry
- Spaced repetition scheduling
- Daily reminders via Chrome notifications
- Progress tracking
- Notes per problem
- CSV export
- Bucket management

## Technical Details

- Manifest V3
- Vanilla JavaScript (no frameworks)
- Local storage only (no backend)
- Content scripts for problem extraction
- Background service worker for alarms and notifications

## Support

Supports:

- LeetCode: `https://leetcode.com/problems/*`
- Codeforces: `https://codeforces.com/problemset/problem/*` and `https://codeforces.com/contest/*/problem/*`
