# ReviseMate - Chrome Extension

A minimal spaced repetition system for LeetCode and Codeforces problems.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the folder containing these extension files
5. The ReviseMate extension should now appear in your extensions list

## Usage

1. Navigate to a LeetCode or Codeforces problem page
2. Click the ReviseMate extension icon in your toolbar
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
