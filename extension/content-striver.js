(function () {
  const STYLE_ID = "rehash-striver-style";
  const POPOVER_ID = "rehash-striver-popover";
  const KEYWORDS = new Set(["solve", "status", "resources", "note", "revision", "difficulty", "practice"]);
  let scanTimer = null;
  let latestData = { problems: {}, sessions: [] };

  ensureStyle();
  observe();
  [800, 2000, 4000].forEach((delay) => window.setTimeout(scanAndInject, delay));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scanAndInject();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopover();
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(`#${POPOVER_ID}, .rehash-striver-btn`)) closePopover();
  });

  function observe() {
    const observer = new MutationObserver(() => {
      window.clearTimeout(scanTimer);
      scanTimer = window.setTimeout(scanAndInject, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scanAndInject();
  }

  function scanAndInject() {
    chrome.storage.local.get(["revise_mate_data", "solvedSessions"], (result) => {
      const data = result.revise_mate_data && typeof result.revise_mate_data === "object" ? result.revise_mate_data : {};
      latestData = {
        problems: data.problems || {},
        sessions: Array.isArray(result.solvedSessions) ? result.solvedSessions : [],
      };
      const titleMap = new Map(Object.values(latestData.problems).map((problem) => [normalizeTitle(problem.title), problem]));
      document.querySelectorAll('a[href*="leetcode.com"], a[href*="codeforces.com"]').forEach((anchor) => injectForAnchor(anchor, titleMap));
    });
  }

  function injectForAnchor(anchor, titleMap) {
    const row = anchor.closest("tr") || anchor.closest("li, div, article, section");
    if (!row || row.dataset.rehashInjected === "1") return;
    const titleEl = findTitleElement(row, anchor);
    if (!titleEl) return;
    row.dataset.rehashInjected = "1";
    const title = titleEl.textContent.trim();
    const problem = titleMap.get(normalizeTitle(title)) || findProblemByUrl(anchor.href);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `rehash-striver-btn ${stateClass(problem)}`;
    button.textContent = stateLabel(problem);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showPopover(button, problem, title, anchor.href);
    });
    const wrap = document.createElement("span");
    wrap.className = "rehash-striver-wrap";
    wrap.appendChild(button);
    titleEl.insertAdjacentElement("afterend", wrap);
  }

  function findTitleElement(row, anchor) {
    const candidates = Array.from(row.querySelectorAll("td, span, div, p, a"));
    return candidates.find((el) => {
      const text = el.textContent.trim();
      const normalized = text.toLowerCase();
      return text.length >= 3 && text.length <= 80 && !KEYWORDS.has(normalized) && !/^\d+$/.test(text);
    }) || anchor;
  }

  function findProblemByUrl(url) {
    const normalized = normalizeProblemUrl(url);
    return Object.values(latestData.problems).find((problem) => normalizeProblemUrl(problem.url) === normalized) || null;
  }

  function stateClass(problem) {
    if (!problem) return "track";
    if (isDue(problem)) return "due";
    return (problem.totalSolves || problem.iterationCount || 0) > 0 ? "tracked" : "queued";
  }

  function stateLabel(problem) {
    if (!problem) return "+ track";
    if (isDue(problem)) return "● due";
    const solves = problem.totalSolves || problem.iterationCount || 0;
    return solves > 0 ? `⟳ ${solves}x` : "◎ queued";
  }

  function showPopover(button, problem, fallbackTitle, fallbackUrl) {
    closePopover();
    const rect = button.getBoundingClientRect();
    const sessions = problem ? getProblemSessions(problem).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];
    const popover = document.createElement("div");
    popover.id = POPOVER_ID;
    popover.style.top = `${Math.min(window.innerHeight - 24, rect.bottom + 8)}px`;
    popover.style.left = `${Math.min(window.innerWidth - 340, Math.max(12, rect.left))}px`;
    popover.innerHTML = popoverHtml(problem, sessions, fallbackTitle, fallbackUrl);
    document.body.appendChild(popover);
    popover.querySelector(".rehash-pop-close").addEventListener("click", closePopover);
    popover.querySelector("[data-open]")?.addEventListener("click", () => window.open(problem?.url || fallbackUrl, "_blank", "noopener"));
    popover.querySelector("[data-track]")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "save_problem", problem: { title: fallbackTitle, url: fallbackUrl, site: inferSite(fallbackUrl), tags: [], difficulty: "Unknown" } }, () => {
        closePopover();
        document.querySelectorAll("[data-rehash-injected='1']").forEach((row) => {
          row.dataset.rehashInjected = "0";
          row.querySelector(".rehash-striver-wrap")?.remove();
        });
        scanAndInject();
      });
    });
    popover.querySelector("[data-revised]")?.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "MARK_REVISED", problemId: problem.id }, () => {
        closePopover();
        document.querySelectorAll("[data-rehash-injected='1']").forEach((row) => {
          row.dataset.rehashInjected = "0";
          row.querySelector(".rehash-striver-wrap")?.remove();
        });
        scanAndInject();
      });
    });
    popover.querySelector("[data-popup]")?.addEventListener("click", () => window.open(chrome.runtime.getURL("popup.html"), "_blank", "noopener"));
  }

  function popoverHtml(problem, sessions, fallbackTitle, fallbackUrl) {
    const title = problem?.title || fallbackTitle;
    const url = problem?.url || fallbackUrl;
    const avg = sessions.length ? formatSecs(Math.round(sessions.reduce((sum, session) => sum + getSecs(session), 0) / sessions.length)) : "-";
    return `
      <div class="rehash-pop-head"><strong>${escapeHtml(title)}</strong><button class="rehash-pop-close" type="button">x</button></div>
      <div class="rehash-badges"><span class="${difficultyClass(problem?.difficulty)}">${escapeHtml(problem?.difficulty || "Unknown")}</span><span>Bucket ${escapeHtml(String(problem?.bucketIndex ?? 0))}</span>${problem && isDue(problem) ? "<span class=\"rehash-due-text\">DUE TODAY</span>" : ""}</div>
      <div class="rehash-pop-grid"><span>Total Solves</span><b>${escapeHtml(String(problem?.totalSolves || sessions.length || 0))}</b><span>Average Time</span><b>${escapeHtml(avg)}</b><span>Next Review</span><b>${escapeHtml(problem?.nextReviewDate || "-")}</b><span>Striver</span><b>${escapeHtml(problem?.striverTopic || "-")}</b><span>Topics</span><b>${escapeHtml((problem?.topics || []).join(", ") || "-")}</b></div>
      <div class="rehash-history">${sessions.slice(0, 3).map(renderSession).join("") || "<p>No solve history.</p>"}${sessions.length > 3 ? `<p>+${sessions.length - 3} more</p>` : ""}</div>
      <div class="rehash-pop-actions"><button data-open type="button">Open</button>${problem ? "<button data-revised type=\"button\">Mark Revised</button>" : "<button data-track type=\"button\">Track</button>"}<button data-popup type="button">ReHash</button></div>
      <a class="rehash-hidden-link" href="${escapeAttribute(url)}" target="_blank" rel="noreferrer"></a>
    `;
  }

  function renderSession(session) {
    const tags = Array.isArray(session.mistakeTags) ? session.mistakeTags : [];
    return `<div class="rehash-session"><b>Iter ${escapeHtml(String(session.iteration || 1))} - ${escapeHtml(formatDate(session.date))} - ${escapeHtml(formatSecs(getSecs(session)))}</b><p>${escapeHtml(truncate(session.approach || "No approach", 100))}</p><div>${tags.map((tag) => `<span class="rehash-mistake-chip">${escapeHtml(tag.label)}</span>`).join("")}</div></div>`;
  }

  function getProblemSessions(problem) {
    const url = normalizeProblemUrl(problem.url);
    return latestData.sessions.filter((session) => session.problemId === problem.id || normalizeProblemUrl(session.problemUrl || session.url) === url);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ".rehash-striver-wrap{margin-left:8px}.rehash-striver-btn{border:0;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:800;cursor:pointer}.rehash-striver-btn.tracked{background:#dcfce7;color:#166534}.rehash-striver-btn.queued{background:#fef3c7;color:#92400e}.rehash-striver-btn.track{background:#e5e7eb;color:#374151}.rehash-striver-btn.due{background:#fee2e2;color:#991b1b;animation:rehashPulse 1s infinite}@keyframes rehashPulse{50%{transform:scale(1.06)}}#rehash-striver-popover{position:fixed;width:320px;z-index:999999;background:#0f172a;color:#e5e7eb;border:1px solid rgba(255,255,255,.14);border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px}.rehash-pop-head{display:flex;justify-content:space-between;gap:10px}.rehash-pop-close{border:0;background:#1f2937;color:#e5e7eb;border-radius:6px}.rehash-badges,.rehash-pop-actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.rehash-badges span,.rehash-pop-actions button{border-radius:999px;padding:4px 8px;background:#1f2937;color:#e5e7eb;border:0}.rehash-due-text{color:#fecaca!important;background:#7f1d1d!important}.rehash-pop-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;border-top:1px solid rgba(255,255,255,.1);padding-top:8px}.rehash-history{max-height:230px;overflow:auto;margin-top:8px}.rehash-session{background:#111827;border-radius:8px;padding:8px;margin-bottom:6px}.rehash-session p{margin:4px 0;color:#cbd5e1}.rehash-mistake-chip{display:inline-block;background:rgba(248,113,113,.14);color:#fecaca;border-radius:999px;padding:2px 6px;margin:2px}.easy{color:#86efac}.medium{color:#facc15}.hard{color:#fca5a5}.rehash-hidden-link{display:none}";
    document.head.appendChild(style);
  }

  function closePopover() { document.getElementById(POPOVER_ID)?.remove(); }
  function normalizeTitle(str) { return String(str || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim(); }
  function normalizeProblemUrl(url) { return window.STRIVER_SHEET_UTILS?.normalizeProblemUrl?.(url) || String(url || ""); }
  function isDue(problem) { return !problem.completed && Number.isFinite(problem.nextReviewAt) && problem.nextReviewAt <= Date.now() + 86400000; }
  function getSecs(session) { return Number(session.timeSecs ?? session.timeTaken ?? 0) || Math.round((Number(session.timeTakenMs) || 0) / 1000); }
  function formatSecs(secs) { return `${Math.floor(secs / 60)}m ${secs % 60}s`; }
  function formatDate(value) { return value ? new Date(value).toLocaleDateString() : "-"; }
  function truncate(value, max) { return String(value).length > max ? `${String(value).slice(0, max - 1)}...` : String(value); }
  function difficultyClass(value) { return String(value || "").toLowerCase().includes("hard") ? "hard" : String(value || "").toLowerCase().includes("medium") ? "medium" : "easy"; }
  function inferSite(url) { return /codeforces\.com/.test(url) ? "codeforces" : "leetcode"; }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function escapeAttribute(value) { return escapeHtml(value); }
})();
