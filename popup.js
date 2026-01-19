let currentProblems = {};
let currentExtractedProblem = null;
let currentEditingId = null;

document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  loadProblems();
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
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`${tab}Tab`).classList.add('active');
    });
  });
}

async function loadProblems() {
  const response = await chrome.runtime.sendMessage({ action: 'get_all_problems' });
  currentProblems = response || {};
  renderTodayList();
  renderAllList();
  updateProgress();
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
  todayList.innerHTML = todayProblems.map(p => renderProblemCard(p, true)).join('');
  attachEventListeners();
}

function renderAllList() {
  const allList = document.getElementById('allList');
  const allEmpty = document.getElementById('allEmpty');
  const allProblems = Object.values(currentProblems);

  if (allProblems.length === 0) {
    allList.innerHTML = '';
    allEmpty.style.display = 'block';
    return;
  }

  allEmpty.style.display = 'none';
  allList.innerHTML = allProblems
    .sort((a, b) => (a.nextReviewAt || Infinity) - (b.nextReviewAt || Infinity))
    .map(p => renderProblemCard(p, false))
    .join('');
  attachEventListeners();
}

function renderProblemCard(problem, isToday) {
  const difficultyClass = problem.difficulty.toLowerCase();
  const reviewDate = problem.completed ? 'Completed' :
    problem.nextReviewAt ? formatDate(problem.nextReviewAt) : 'N/A';
  const topics = problem.topics.slice(0, 3).join(', ') || 'None';

  return `
    <div class="problem-card" data-id="${problem.id}">
      <div class="problem-header">
        <a href="${problem.url}" target="_blank" class="problem-title">${problem.title}</a>
        <span class="problem-site">${problem.site}</span>
      </div>
      <div class="problem-meta">
        <span class="difficulty ${difficultyClass}">${problem.difficulty}</span>
        <span class="bucket">Bucket ${problem.bucketIndex}</span>
        <span class="review-date">${reviewDate}</span>
      </div>
      <div class="problem-topics">${topics}</div>
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

function attachEventListeners() {
  document.querySelectorAll('.btn-revised').forEach(btn => {
    btn.addEventListener('click', () => markRevised(btn.dataset.id));
  });

  document.querySelectorAll('.btn-move').forEach(btn => {
    btn.addEventListener('click', () => moveBucket(btn.dataset.id));
  });

  document.querySelectorAll('.btn-notes').forEach(btn => {
    btn.addEventListener('click', () => openNotesModal(btn.dataset.id));
  });

  document.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteProblem(btn.dataset.id));
  });
}

function getTodayProblems() {
  const todayStart = getStartOfDay();
  const todayEnd = getEndOfDay();

  return Object.values(currentProblems).filter(p =>
    !p.completed &&
    p.nextReviewAt &&
    p.nextReviewAt >= todayStart &&
    p.nextReviewAt <= todayEnd
  );
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
  const revised = todayProblems.filter(p => {
    const lastRevision = p.history.findLast(h => h.action === 'revised');
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

    if (!tab || !tab.url || !(tab.url.includes('leetcode.com') || tab.url.includes('codeforces.com'))) {
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
    problem: currentExtractedProblem
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
  const tags = document.getElementById('manualTags').value.split(',').map(t => t.trim()).filter(Boolean);

  if (!title || !url) {
    showToast('Please enter both title and URL');
    return;
  }

  const response = await chrome.runtime.sendMessage({
    action: 'save_problem',
    problem: { title, url, site, tags, difficulty: 'Unknown' }
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

  const bucketIndex = parseInt(newBucket);
  if (isNaN(bucketIndex) || bucketIndex < 0 || bucketIndex > maxBucket) {
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
    notes
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
  document.getElementById('intervalsInput').value = settings.intervals.join(',');
  document.getElementById('reminderHourInput').value = settings.reminderHour;
  document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('settingsModal').style.display = 'none';
}

async function saveSettings() {
  const intervalsStr = document.getElementById('intervalsInput').value;
  const reminderHour = parseInt(document.getElementById('reminderHourInput').value);

  const intervals = intervalsStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);

  if (intervals.length === 0 || isNaN(reminderHour) || reminderHour < 0 || reminderHour > 23) {
    showToast('Invalid settings');
    return;
  }

  await chrome.runtime.sendMessage({
    action: 'update_settings',
    settings: { intervals, reminderHour }
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
  const rows = problems.map(p => [
    p.title,
    p.url,
    p.site,
    p.difficulty,
    p.topics.join('; '),
    p.bucketIndex,
    p.nextReviewAt ? formatDate(p.nextReviewAt) : 'N/A',
    p.completed ? 'Yes' : 'No',
    p.notes.replace(/"/g, '""'),
    formatDate(p.addedAt)
  ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
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

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

function formatDateFile(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
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
