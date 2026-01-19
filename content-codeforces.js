chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract_problem') {
    const data = extractCodeforcesesProblem();
    sendResponse(data);
  }
  return true;
});

function extractCodeforcesesProblem() {
  const title = extractTitle();
  const tags = extractTags();

  return {
    title,
    url: window.location.href,
    site: 'codeforces',
    difficulty: 'Unknown',
    tags
  };
}

function extractTitle() {
  const selectors = [
    '.problem-statement .title',
    '.title',
    'div.header .title'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.textContent.trim()) {
      return element.textContent.trim();
    }
  }

  const title = document.title.trim();
  if (title && title !== 'Codeforces') {
    return title.split(' - ')[0].trim();
  }

  return 'Unknown Problem';
}

function extractTags() {
  const tags = [];
  const selectors = [
    '.problem-statement .tag-box',
    '.tag-box',
    '.roundbox .tags a',
    'a[href*="/problemset?tags="]'
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
