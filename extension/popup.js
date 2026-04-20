const DEFAULT_NOTION_URL = 'https://www.notion.so';

let currentProblems = {};
let currentExtractedProblem = null;
let currentEditingId = null;
let currentSolvedSessions = [];
let activeTagFilter = 'All';
let currentSearchTerm = '';
let notionSaveTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  initializeFilters();
  initializeSettingsInputs();
  loadPopupData();
  tryExtractProblem();

  document.getElementById('saveBtn').addEventListener('click', saveExtractedProblem);
  document.getElementById('manualSaveBtn').addEventListener('click', saveManualProblem);
  document.getElementById('exportBtn').addEventListener('click', exportCSV);
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('saveNotesBtn').addEventListener('click', saveNotes);
  document.getElementById('cancelNotesBtn').addEventListener('click', closeNotesModal);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
  document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
});

function initializeTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((tabBtn) => tabBtn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((content) => content.classList.remove('active'));

      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`${tab}Tab`).classList.add('active');
    });
  });
}

function initializeFilters() {
  document.getElementById('problemSearchInput').addEventListener('input', (event) => {
    currentSearchTerm = event.target.value.trim().toLowerCase();
    renderAllList();
  });
}

function initializeSettingsInputs() {
  const notionInput = document.getElementById('notionUrlInput');
  notionInput.addEventListener('input', () => {
    window.clearTimeout(notionSaveTimeout);
    notionSaveTimeout = window.setTimeout(async () => {
      const notionUrl = notionInput.value.trim() || DEFAULT_NOTION_URL;
      await chrome.storage.local.set({ notionUrl });
      if (notionInput.value.trim() === '') {
        notionInput.value = DEFAULT_NOTION_URL;
      }
    }, 350);
  });
}

async function loadPopupData() {
  await Promise.all([loadProblems(), loadSolvedSessions(), loadNotionUrl()]);
}

async function loadProblems() {
  const response = await chrome.runtime.sendMessage({ action: 'get_all_problems' });
  currentProblems = response || {};
  renderTodayList();
  renderAllList();
  updateProgress();
}

async function loadSolvedSessions() {
  const data = await chrome.storage.local.get('solvedSessions');
  currentSolvedSessions = Array.isArray(data.solvedSessions) ? data.solvedSessions : [];
  renderStats();
}

async function loadNotionUrl() {
  const data = await chrome.storage.local.get('notionUrl');
  document.getElementById('notionUrlInput').value = data.notionUrl || DEFAULT_NOTION_URL;
}

function renderTodayList() {
  const todayList = document.getElementById('todayList');
  const todayEmpty = document.getElementById('todayEmpty');
  const todayProblems = getTodayProblems();

  if (todayProblems.length === 0) {
    todayList.innerHTML = '';
    todayEmpty.style.display = 'block';
    return;
  }

  todayEmpty.style.display = 'none';
  todayList.innerHTML = todayProblems.map((problem) => renderProblemCard(problem)).join('');
  attachProblemEventListeners(todayList);
}

function renderAllList() {
  const allList = document.getElementById('allList');
  const allEmpty = document.getElementById('allEmpty');
  const filteredProblems = getFilteredProblems();

  renderTagFilters();

  if (filteredProblems.length === 0) {
    allList.innerHTML = '';
    allEmpty.style.display = 'block';
    allEmpty.textContent = Object.keys(currentProblems).length === 0
      ? 'No problems saved yet.'
      : 'No problems match the current filters.';
    return;
  }

  allEmpty.style.display = 'none';
  allList.innerHTML = filteredProblems
    .sort((a, b) => (a.nextReviewAt || Infinity) - (b.nextReviewAt || Infinity))
    .map((problem) => renderProblemCard(problem))
    .join('');
  attachProblemEventListeners(allList);
}

function renderProblemCard(problem) {
  const difficultyClass = getDifficultyClass(problem.difficulty);
  const reviewDate = problem.completed
    ? 'Completed'
    : problem.nextReviewAt
      ? formatDate(problem.nextReviewAt)
      : 'N/A';
  const topics = Array.isArray(problem.topics) ? problem.topics.slice(0, 3).join(', ') : '';

  return `
    <div class="problem-card" data-id="${problem.id}">
      <div class="problem-header">
        <a href="${problem.url}" target="_blank" class="problem-title">${problem.title}</a>
        <span class="problem-site">${problem.site}</span>
      </div>
      <div class="problem-meta">
        <span class="difficulty ${difficultyClass}">${problem.difficulty || 'Unknown'}</span>
        <span class="bucket">Bucket ${problem.bucketIndex}</span>
        <span class="review-date">${reviewDate}</span>
      </div>
      <div class="problem-topics">${topics || 'None'}</div>
      ${problem.notes ? `<div class="problem-notes">${problem.notes}</div>` : ''}
      <div class="problem-actions">
        ${!problem.completed ? `<button class="btn-sm btn-revised" data-id="${problem.id}">Mark Revised</button>` : ''}
        <button class="btn-sm btn-move" data-id="${problem.id}">Move</button>
        <button class="btn-sm btn-notes" data-id="${problem.id}">Edit Notes</button>
        <button class="btn-sm btn-delete" data-id="${problem.id}">Delete</button>
      </div>
    </div>
  `;
}

function renderTagFilters() {
  const filterBar = document.getElementById('tagFilterBar');
  const tags = getAllUniqueTags();
  if (activeTagFilter !== 'All' && !tags.includes(activeTagFilter)) {
    activeTagFilter = 'All';
  }
  const buttons = ['All', ...tags]
    .map((tag) => `
      <button
        class="filter-chip ${tag === activeTagFilter ? 'active' : ''}"
        data-tag="${escapeAttribute(tag)}"
      >
        ${tag}
      </button>
    `)
    .join('');

  filterBar.innerHTML = buttons;

  filterBar.querySelectorAll('.filter-chip').forEach((button) => {
    button.addEventListener('click', () => {
      activeTagFilter = button.dataset.tag;
      renderAllList();
    });
  });
}

function renderStats() {
  const totalSolved = currentSolvedSessions.length;
  const weekCount = getThisWeekCount();
  const averageTime = totalSolved === 0
    ? '0m 0s'
    : formatDuration(Math.round(currentSolvedSessions.reduce((sum, session) => sum + (session.timeTaken || 0), 0) / totalSolved));
  const streak = calculateStreak();
  const notionRate = totalSolved === 0
    ? '0%'
    : `${Math.round((currentSolvedSessions.filter((session) => session.notionOpened).length / totalSolved) * 100)}%`;

  document.getElementById('statsTotalSolved').textContent = String(totalSolved);
  document.getElementById('statsWeekCount').textContent = String(weekCount);
  document.getElementById('statsAverageTime').textContent = averageTime;
  document.getElementById('statsStreak').textContent = `${streak} day${streak === 1 ? '' : 's'}`;
  document.getElementById('statsNotionRate').textContent = notionRate;

  renderSlowestTopics();
  renderTopicBreakdown();
}

function renderSlowestTopics() {
  const container = document.getElementById('slowestTopics');
  const averages = getTopicAverageTimes()
    .sort((a, b) => b.averageTime - a.averageTime)
    .slice(0, 3);

  if (averages.length === 0) {
    container.innerHTML = '<p class="stats-empty">No solve data yet.</p>';
    return;
  }

  container.innerHTML = averages
    .map((item) => `<div class="stats-row"><span>${item.tag}</span><strong>${formatDuration(Math.round(item.averageTime))}</strong></div>`)
    .join('');
}

function renderTopicBreakdown() {
  const container = document.getElementById('topicBreakdown');
  const breakdown = getTopicCounts();
  const rows = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) {
    container.innerHTML = '<p class="stats-empty">No topics logged yet.</p>';
    return;
  }

  container.innerHTML = `
    <table class="stats-table">
      <thead>
        <tr>
          <th>Topic</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(([tag, count]) => `<tr><td>${tag}</td><td>${count}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

function attachProblemEventListeners(container) {
  container.querySelectorAll('.btn-revised').forEach((btn) => {
    btn.addEventListener('click', () => markRevised(btn.dataset.id));
  });

  container.querySelectorAll('.btn-move').forEach((btn) => {
    btn.addEventListener('click', () => moveBucket(btn.dataset.id));
  });

  container.querySelectorAll('.btn-notes').forEach((btn) => {
    btn.addEventListener('click', () => openNotesModal(btn.dataset.id));
  });

  container.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteProblem(btn.dataset.id));
  });
}

function getTodayProblems() {
  const todayStart = getStartOfDay();
  const todayEnd = getEndOfDay();

  return Object.values(currentProblems).filter((problem) =>
    !problem.completed &&
    problem.nextReviewAt &&
    problem.nextReviewAt >= todayStart &&
    problem.nextReviewAt <= todayEnd
  );
}

function getFilteredProblems() {
  return Object.values(currentProblems).filter((problem) => {
    const topicMatches = activeTagFilter === 'All' ||
      (Array.isArray(problem.topics) && problem.topics.includes(activeTagFilter));
    const searchMatches = currentSearchTerm === '' ||
      problem.title.toLowerCase().includes(currentSearchTerm);

    return topicMatches && searchMatches;
  });
}

function getAllUniqueTags() {
  return Array.from(
    new Set(
      Object.values(currentProblems).flatMap((problem) => Array.isArray(problem.topics) ? problem.topics : [])
    )
  ).sort((a, b) => a.localeCompare(b));
}

function updateProgress() {
  const todayProblems = getTodayProblems();
  const total = todayProblems.length;

  if (total === 0) {
    document.getElementById('progressText').textContent = '0% complete (0/0)';
    document.getElementById('progressFill').style.width = '0%';
    return;
  }

  const todayStart = getStartOfDay();
  const revised = todayProblems.filter((problem) => {
    const lastRevision = problem.history.findLast((historyItem) => historyItem.action === 'revised');
    return lastRevision && lastRevision.date >= todayStart;
  }).length;

  const percent = Math.round((revised / total) * 100);
  document.getElementById('progressText').textContent = `${percent}% complete (${revised}/${total})`;
  document.getElementById('progressFill').style.width = `${percent}%`;
}

async function tryExtractProblem() {
  const extractStatus = document.getElementById('extractStatus');
  const extractedData = document.getElementById('extractedData');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !isSupportedProblemUrl(tab.url)) {
      extractStatus.textContent = 'Not on a LeetCode or Codeforces problem page.';
      return;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extract_problem' });

    if (response && response.title) {
      currentExtractedProblem = response;
      document.getElementById('detectedTitle').textContent = response.title;
      document.getElementById('detectedSite').textContent = response.site;
      document.getElementById('detectedDifficulty').textContent = response.difficulty || 'Unknown';
      document.getElementById('detectedTopics').textContent = response.tags.join(', ') || 'None';

      extractStatus.style.display = 'none';
      extractedData.style.display = 'block';
    } else {
      extractStatus.textContent = 'Could not extract problem data from this page.';
    }
  } catch (err) {
    extractStatus.textContent = 'Could not extract problem data from this page.';
  }
}

async function saveExtractedProblem() {
  if (!currentExtractedProblem) return;

  const response = await chrome.runtime.sendMessage({
    action: 'save_problem',
    problem: currentExtractedProblem,
  });

  if (response.success) {
    showToast('Problem saved successfully!');
    await loadProblems();
    document.querySelector('[data-tab="today"]').click();
  }
}

async function saveManualProblem() {
  const title = document.getElementById('manualTitle').value.trim();
  const url = document.getElementById('manualUrl').value.trim();
  const site = document.getElementById('manualSite').value;
  const tags = document.getElementById('manualTags').value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!title || !url) {
    showToast('Please enter both title and URL');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'save_problem',
    problem: { title, url, site, tags, difficulty: 'Unknown' },
  });

  if (response.success) {
    showToast('Problem saved successfully!');
    document.getElementById('manualTitle').value = '';
    document.getElementById('manualUrl').value = '';
    document.getElementById('manualTags').value = '';
    await loadProblems();
    document.querySelector('[data-tab="today"]').click();
  }
}

async function markRevised(problemId) {
  await chrome.runtime.sendMessage({ action: 'mark_revised', problemId });
  await loadProblems();
  showToast('Marked as revised!');
}

async function moveBucket(problemId) {
  const settings = await chrome.runtime.sendMessage({ action: 'get_settings' });
  const maxBucket = settings.intervals.length - 1;
  const newBucket = prompt(`Enter bucket index (0-${maxBucket}):`);

  if (newBucket === null) return;

  const bucketIndex = parseInt(newBucket, 10);
  if (Number.isNaN(bucketIndex) || bucketIndex < 0 || bucketIndex > maxBucket) {
    showToast('Invalid bucket index');
    return;
  }

  await chrome.runtime.sendMessage({ action: 'move_bucket', problemId, bucketIndex });
  await loadProblems();
  showToast('Moved to new bucket!');
}

function openNotesModal(problemId) {
  currentEditingId = problemId;
  const problem = currentProblems[problemId];
  document.getElementById('notesInput').value = problem.notes || '';
  document.getElementById('notesModal').style.display = 'flex';
}

function closeNotesModal() {
  document.getElementById('notesModal').style.display = 'none';
  currentEditingId = null;
}

async function saveNotes() {
  const notes = document.getElementById('notesInput').value;
  await chrome.runtime.sendMessage({
    action: 'update_notes',
    problemId: currentEditingId,
    notes,
  });
  await loadProblems();
  closeNotesModal();
  showToast('Notes saved!');
}

async function deleteProblem(problemId) {
  if (!confirm('Are you sure you want to delete this problem?')) return;

  await chrome.runtime.sendMessage({ action: 'delete_problem', problemId });
  await loadProblems();
  showToast('Problem deleted!');
}

async function openSettings() {
  const settings = await chrome.runtime.sendMessage({ action: 'get_settings' });
  const notionData = await chrome.storage.local.get('notionUrl');

  document.getElementById('intervalsInput').value = settings.intervals.join(',');
  document.getElementById('reminderHourInput').value = settings.reminderHour;
  document.getElementById('notionUrlInput').value = notionData.notionUrl || DEFAULT_NOTION_URL;
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function saveSettings() {
  const intervalsStr = document.getElementById('intervalsInput').value;
  const reminderHour = parseInt(document.getElementById('reminderHourInput').value, 10);
  const intervals = intervalsStr
    .split(',')
    .map((value) => parseInt(value.trim(), 10))
    .filter((value) => !Number.isNaN(value) && value > 0);

  if (intervals.length === 0 || Number.isNaN(reminderHour) || reminderHour < 0 || reminderHour > 23) {
    showToast('Invalid settings');
    return;
  }

  await chrome.runtime.sendMessage({
    action: 'update_settings',
    settings: { intervals, reminderHour },
  });

  closeSettingsModal();
  showToast('Settings saved!');
}

function exportCSV() {
  const problems = Object.values(currentProblems);
  if (problems.length === 0) {
    showToast('No problems to export');
    return;
  }

  const headers = ['Title', 'URL', 'Site', 'Difficulty', 'Topics', 'Bucket', 'Next Review', 'Completed', 'Notes', 'Added At'];
  const rows = problems.map((problem) => [
    problem.title,
    problem.url,
    problem.site,
    problem.difficulty,
    (problem.topics || []).join('; '),
    problem.bucketIndex,
    problem.nextReviewAt ? formatDate(problem.nextReviewAt) : 'N/A',
    problem.completed ? 'Yes' : 'No',
    (problem.notes || '').replace(/"/g, '""'),
    formatDate(problem.addedAt),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `revise_mate_export_${formatDateFile(Date.now())}.csv`;
  a.click();
  URL.revokeObjectURL(url);

  showToast('CSV exported!');
}

function getThisWeekCount() {
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = day === 0 ? 6 : day - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diff);
  startOfWeek.setHours(0, 0, 0, 0);

  return currentSolvedSessions.filter((session) => new Date(session.date) >= startOfWeek).length;
}

function getTopicCounts() {
  return currentSolvedSessions.reduce((accumulator, session) => {
    const uniqueTags = new Set(Array.isArray(session.tags) ? session.tags : []);
    uniqueTags.forEach((tag) => {
      accumulator[tag] = (accumulator[tag] || 0) + 1;
    });
    return accumulator;
  }, {});
}

function getTopicAverageTimes() {
  const topicTimes = {};

  currentSolvedSessions.forEach((session) => {
    const uniqueTags = new Set(Array.isArray(session.tags) ? session.tags : []);
    uniqueTags.forEach((tag) => {
      if (!topicTimes[tag]) {
        topicTimes[tag] = { total: 0, count: 0 };
      }

      topicTimes[tag].total += session.timeTaken || 0;
      topicTimes[tag].count += 1;
    });
  });

  return Object.entries(topicTimes).map(([tag, value]) => ({
    averageTime: value.total / value.count,
    tag,
  }));
}

function calculateStreak() {
  const uniqueDays = Array.from(
    new Set(currentSolvedSessions.map((session) => new Date(session.date).toISOString().slice(0, 10)))
  ).sort();

  if (uniqueDays.length === 0) {
    return 0;
  }

  let streak = 1;
  let currentDate = new Date(uniqueDays[uniqueDays.length - 1]);

  for (let index = uniqueDays.length - 2; index >= 0; index--) {
    const previousDate = new Date(uniqueDays[index]);
    const diffDays = Math.round((currentDate - previousDate) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      streak += 1;
      currentDate = previousDate;
    } else if (diffDays > 1) {
      break;
    }
  }

  return streak;
}

function getDifficultyClass(difficulty) {
  const normalized = String(difficulty || 'Unknown').toLowerCase();
  if (normalized.includes('easy')) return 'easy';
  if (normalized.includes('medium')) return 'medium';
  if (normalized.includes('hard')) return 'hard';
  if (/^\d+$/.test(normalized)) return 'rating';
  return 'unknown';
}

function isSupportedProblemUrl(url) {
  return (
    /^https:\/\/leetcode\.com\/problems\//.test(url) ||
    /^https:\/\/codeforces\.com\/problemset\/problem\//.test(url) ||
    /^https:\/\/codeforces\.com\/contest\/\d+\/problem\//.test(url)
  );
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

function formatDateFile(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
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

function escapeAttribute(value) {
  return String(value).replace(/"/g, '&quot;');
}

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
