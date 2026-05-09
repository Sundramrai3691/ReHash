(function () {
  const PANEL_ID = "rehash-review-panel";
  const STYLE_ID = "rehash-review-panel-style";
  const COLORS = {
    bg: "#1e1e2e",
    surface: "#181825",
    text: "#cdd6f4",
    muted: "#a6adc8",
    purple: "#cba6f7",
    blue: "#89b4fa",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    red: "#f38ba8",
  };

  window.ReHashReviewPanel = {
    trigger,
  };

  async function trigger(site, title, url) {
    ensureStyle();
    renderShell();
    renderLoading();

    const code = extractCode(site);
    const language = detectLanguage(site);
    if (!code.trim()) {
      renderError("Could not read code from the editor.", []);
      return;
    }

    const response = await sendRuntimeMessage({
      type: "AI_REVIEW",
      problemTitle: title,
      problemUrl: url,
      language,
      code,
    });

    if (!response?.ok) {
      renderError(response?.message || "All configured reviewers failed.", response?.log || []);
      return;
    }

    renderReview(response.review, response.log || []);
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID}{position:fixed;right:220px;bottom:24px;z-index:10001;width:min(520px,calc(100vw - 32px));max-height:min(760px,calc(100vh - 48px));overflow:auto;background:${COLORS.bg};color:${COLORS.text};border:1px solid rgba(203,166,247,.28);border-radius:8px;box-shadow:0 22px 54px rgba(0,0,0,.45);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;font-size:13px;line-height:1.45}
      #${PANEL_ID} *{box-sizing:border-box} .rh-review-header{position:sticky;top:0;background:${COLORS.surface};display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid rgba(205,214,244,.12)}.rh-review-title{font-weight:800;color:${COLORS.purple}}.rh-provider{color:${COLORS.muted};font-size:12px}.rh-close{border:0;background:#313244;color:${COLORS.text};border-radius:8px;width:28px;height:28px;cursor:pointer}.rh-body{padding:14px;display:grid;gap:12px}.rh-spinner{width:24px;height:24px;border:3px solid #313244;border-top-color:${COLORS.purple};border-radius:50%;animation:rh-spin 1s linear infinite}@keyframes rh-spin{to{transform:rotate(360deg)}}.rh-loading{display:flex;align-items:center;gap:12px}.rh-card{background:${COLORS.surface};border:1px solid rgba(205,214,244,.12);border-radius:8px;padding:12px}.rh-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-weight:800;color:#11111b}.rh-score{height:8px;background:#313244;border-radius:999px;overflow:hidden;margin-top:7px}.rh-score-fill{height:100%;background:${COLORS.blue}}.rh-chips{display:flex;flex-wrap:wrap;gap:8px}.rh-chip{background:#313244;border-radius:999px;padding:5px 9px}.rh-issue{border-left:4px solid ${COLORS.muted};padding:10px;background:#11111b;border-radius:6px;margin-top:8px}.rh-issue h4{margin:0 0 5px;font-size:13px}.rh-issue p{margin:4px 0;color:${COLORS.text}}.rh-table{width:100%;border-collapse:collapse}.rh-table td,.rh-table th{border-bottom:1px solid rgba(205,214,244,.12);padding:7px;text-align:left}.rh-positive{color:${COLORS.green};margin:5px 0}.rh-code{white-space:pre;overflow:auto;max-height:280px;background:#11111b;border-radius:8px;padding:12px;font-family:Consolas,"SFMono-Regular",monospace;font-size:12px}.rh-copy{float:right;border:0;border-radius:8px;background:${COLORS.purple};color:#11111b;padding:7px 10px;font-weight:800;cursor:pointer}.rh-callout{border-left:4px solid ${COLORS.purple};background:#11111b;border-radius:6px;padding:10px}.rh-note{border-left:4px solid ${COLORS.yellow};background:#11111b;border-radius:6px;padding:10px;color:${COLORS.yellow}}.rh-error{color:${COLORS.red}}.rh-log{font-size:12px;color:${COLORS.muted};white-space:pre-wrap}
    `;
    document.documentElement.appendChild(style);
  }

  function renderShell(provider) {
    document.getElementById(PANEL_ID)?.remove();
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="rh-review-header">
        <div><div class="rh-review-title">⟳ Interview review</div><div class="rh-provider">${escapeHtml(provider || "")}</div></div>
        <button class="rh-close" type="button" aria-label="Close review">×</button>
      </div>
      <div class="rh-body" id="rh-review-body"></div>
    `;
    document.documentElement.appendChild(panel);
    panel.querySelector(".rh-close").addEventListener("click", () => panel.remove());
  }

  function renderLoading() {
    getBody().innerHTML = '<div class="rh-card rh-loading"><div class="rh-spinner"></div><div>Analysing your code...</div></div>';
  }

  function renderError(message, log) {
    getBody().innerHTML = `
      <div class="rh-card"><strong class="rh-error">${escapeHtml(message)}</strong></div>
      ${renderLog(log)}
    `;
  }

  function renderReview(review, log) {
    const issues = Array.isArray(review.issues) ? review.issues.slice().sort(compareIssues) : [];
    const namingIssues = Array.isArray(review.namingIssues) ? review.namingIssues : [];
    const positives = Array.isArray(review.positives) ? review.positives : [];
    const complexity = review.complexity || {};
    const verdictColor = verdictColorFor(review.verdict);
    const score = Math.max(1, Math.min(10, Number(review.score) || 1));
    getBody().innerHTML = `
      <div class="rh-card">
        <span class="rh-badge" style="background:${verdictColor}">${escapeHtml(formatVerdict(review.verdict))}</span>
        <div style="margin-top:10px"><strong>Score:</strong> ${score}/10<div class="rh-score"><div class="rh-score-fill" style="width:${score * 10}%"></div></div></div>
        <p>${escapeHtml(review.summary || "")}</p>
      </div>
      <div class="rh-card"><div class="rh-chips">
        <span class="rh-chip">Time: ${escapeHtml(complexity.time || "Unknown")}</span>
        <span class="rh-chip">Space: ${escapeHtml(complexity.space || "Unknown")}</span>
        <span class="rh-chip" style="color:${complexity.isOptimal ? COLORS.green : COLORS.yellow}">Optimal: ${complexity.isOptimal ? "yes" : "no"}</span>
      </div>${!complexity.isOptimal && complexity.optimalNote ? `<div class="rh-note" style="margin-top:10px">${escapeHtml(complexity.optimalNote)}</div>` : ""}</div>
      <div class="rh-card"><strong>Issues</strong>${issues.length ? issues.map(renderIssue).join("") : '<p>No major issues found.</p>'}</div>
      ${namingIssues.length ? `<div class="rh-card"><strong>Naming issues</strong><table class="rh-table"><tbody>${namingIssues.map(renderNamingIssue).join("")}</tbody></table></div>` : ""}
      ${positives.length ? `<div class="rh-card"><strong>Positives</strong>${positives.map((item) => `<div class="rh-positive">✓ ${escapeHtml(item)}</div>`).join("")}</div>` : ""}
      ${review.improvedCode ? `<div class="rh-card"><button class="rh-copy" type="button">Copy improved code</button><strong>Improved code</strong><pre class="rh-code">${escapeHtml(review.improvedCode)}</pre></div>` : ""}
      ${review.interviewTips ? `<div class="rh-card rh-callout"><strong>Interview tips</strong><div>${escapeHtml(review.interviewTips)}</div></div>` : ""}
      ${renderLog(log)}
    `;
    const copyButton = getBody().querySelector(".rh-copy");
    copyButton?.addEventListener("click", async () => {
      await navigator.clipboard.writeText(review.improvedCode || "");
      copyButton.textContent = "Copied";
    });
    const provider = log.find((item) => item.ok)?.provider || "";
    document.querySelector(`#${PANEL_ID} .rh-provider`).textContent = provider ? `Reviewed by ${provider}` : "";
  }

  function renderIssue(issue) {
    const color = severityColor(issue.severity);
    return `<div class="rh-issue" style="border-left-color:${color}"><h4>${escapeHtml(issue.title || "Issue")} · ${escapeHtml(issue.severity || "minor")}</h4><p>${escapeHtml(issue.description || "")}</p>${issue.fix ? `<p><strong>Fix:</strong> ${escapeHtml(issue.fix)}</p>` : ""}</div>`;
  }

  function renderNamingIssue(issue) {
    return `<tr><td><s>${escapeHtml(issue.original || "")}</s></td><td><strong>${escapeHtml(issue.suggested || "")}</strong></td><td>${escapeHtml(issue.reason || "")}</td></tr>`;
  }

  function renderLog(log) {
    if (!Array.isArray(log) || !log.length) return "";
    return `<details class="rh-card"><summary>Log details</summary><div class="rh-log">${escapeHtml(log.map((item) => `${item.provider}: ${item.ok ? "ok" : item.error || item.status || "failed"}`).join("\n"))}</div></details>`;
  }

  function extractCode(site) {
    if (site === "leetcode") {
      const lines = Array.from(document.querySelectorAll(".monaco-editor .view-lines .view-line")).map((line) => line.textContent || "");
      if (lines.length) return lines.join("\n");
      const cm = document.querySelector(".CodeMirror")?.CodeMirror;
      if (cm?.getValue) return cm.getValue();
      const ace = document.querySelector(".ace_editor")?.env?.editor;
      if (ace?.getValue) return ace.getValue();
    }
    if (site === "codeforces") {
      const textarea = document.querySelector("#sourceCodeTextarea, textarea[name='source']");
      if (textarea) return textarea.value || "";
      return Array.from(document.querySelectorAll(".ace_content .ace_line")).map((line) => line.textContent || "").join("\n");
    }
    return "";
  }

  function detectLanguage(site) {
    if (site === "leetcode") {
      const buttonText = Array.from(document.querySelectorAll("button")).map((button) => button.textContent.trim()).find((text) => /python|java|c\+\+|cpp|javascript|typescript|go|rust/i.test(text));
      return normalizeLanguage(buttonText || "python3");
    }
    const option = document.querySelector("select[name='programTypeId'] option:checked")?.textContent || "";
    return normalizeLanguage(option);
  }

  function normalizeLanguage(text) {
    const value = String(text || "").toLowerCase();
    if (value.includes("c++") || value.includes("gnu")) return "cpp";
    if (value.includes("java")) return "java";
    if (value.includes("python") || value.includes("pypy")) return "python3";
    if (value.includes("javascript")) return "javascript";
    if (value.includes("typescript")) return "typescript";
    return value.replace(/\s+/g, "") || "python3";
  }

  function compareIssues(first, second) {
    const order = { critical: 0, major: 1, minor: 2, style: 3 };
    return (order[first.severity] ?? 9) - (order[second.severity] ?? 9);
  }

  function verdictColorFor(verdict) {
    return { strong_hire: COLORS.green, hire: COLORS.blue, borderline: COLORS.yellow, no_hire: COLORS.red }[verdict] || COLORS.muted;
  }

  function severityColor(severity) {
    return { critical: COLORS.red, major: COLORS.yellow, minor: COLORS.blue, style: COLORS.purple }[severity] || COLORS.muted;
  }

  function formatVerdict(verdict) {
    return String(verdict || "borderline").replace(/_/g, " ");
  }

  function getBody() {
    return document.getElementById("rh-review-body");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, (response) => resolve(response)));
  }
})();
