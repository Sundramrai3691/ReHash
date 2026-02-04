chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract_problem') {
    const data = extractLeetCodeProblem();
    sendResponse(data);
  }
  return true;
});

function extractLeetCodeProblem() {
  const title = extractTitle();
  const difficulty = extractDifficulty();
  const tags = extractTags();

  return {
    title,
    url: window.location.href,
    site: 'leetcode',
    difficulty,
    tags
  };
}

function extractTitle() {
  const selectors = [
    'div[data-cy="question-title"]',
    '.css-1hwfws3 h1',
    'h1',
    '[class*="title"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  const title = document.title.replace(' - LeetCode', '').trim();
  if (title) return title;

  return 'Unknown Problem';
}

function extractDifficulty() {
  const selectors = [
    'div[diff]',
    '.css-1oz8vj0',
    '.difficulty',
    '[class*="difficulty"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) {
      const text = element.textContent.trim().toLowerCase();
      if (text.includes('easy')) return 'Easy';
      if (text.includes('medium')) return 'Medium';
      if (text.includes('hard')) return 'Hard';
    }
  }

  const diffAttr = document.querySelector('[diff]');
  if (diffAttr) {
    const diff = diffAttr.getAttribute('diff');
    if (diff === '1') return 'Easy';
    if (diff === '2') return 'Medium';
    if (diff === '3') return 'Hard';
  }

  return 'Unknown';
}

function extractTags() {
  const tags = [];
  const selectors = [
    '.topic-tag',
    '.tag',
    '[class*="topic"]',
    'a[href*="/tag/"]'
  ];

  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      const text = el.textContent.trim();
      if (text && !tags.includes(text)) {
        tags.push(text);
      }
    });

    if (tags.length > 0) break;
  }

  return tags.slice(0, 10);
}
