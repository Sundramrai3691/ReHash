(function () {
  let problems = {};
  let sessions = [];
  let rows = [];

  document.addEventListener("DOMContentLoaded", () => {
    chrome.storage.local.get(["revise_mate_data", "solvedSessions"], (result) => {
      const data = result.revise_mate_data && typeof result.revise_mate_data === "object" ? result.revise_mate_data : {};
      problems = data.problems || {};
      sessions = Array.isArray(result.solvedSessions) ? result.solvedSessions : [];
      rows = buildRows();
      bind();
      renderAll();
    });
  });

  function bind() {
    document.getElementById("rangeSelect").addEventListener("change", renderDistribution);
    document.getElementById("topicSelect").addEventListener("change", renderTopicDrilldown);
    document.getElementById("mistakeSearch").addEventListener("input", renderSearch);
    ["historyTopic", "historyMistake", "historySort"].forEach((id) => document.getElementById(id).addEventListener("change", renderHistory));
  }

  function renderAll() {
    fillSelects();
    renderOverview();
    renderHeatmapSection();
    renderDistribution();
    renderTrend();
    renderTopicDrilldown();
    renderSearch();
    renderHistory();
  }

  function buildRows() {
    return sessions.flatMap((session) => {
      const problem = problems[session.problemId] || findProblemByUrl(session.problemUrl || session.url) || {};
      const mistakeTags = Array.isArray(session.mistakeTags) && session.mistakeTags.length
        ? session.mistakeTags
        : String(session.mistakes || "").split(",").map((label) => label.trim()).filter(Boolean).map((label) => ({ id: label.toLowerCase().replace(/\W+/g, "-"), label, category: "Legacy", elaboration: "" }));
      return mistakeTags.map((tag) => ({ session, problem, tag, date: new Date(session.date || Date.now()) }));
    });
  }

  function renderOverview() {
    const topicCounts = countBy(sessions.flatMap((session) => session.tags || []));
    const practiced = topEntries(topicCounts, 1)[0]?.[0] || "-";
    const totalTime = sessions.reduce((sum, session) => sum + getSecs(session), 0);
    const stats = [
      ["Total Problems Tracked", Object.keys(problems).length],
      ["Total Solves", sessions.length],
      ["Current Streak", `${streak()}d`],
      ["Total Time Spent", formatHours(totalTime)],
      ["Most Practiced Topic", practiced],
    ];
    document.getElementById("overviewStats").innerHTML = stats.map(([label, value]) => `<div class="stat"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></div>`).join("");
  }

  function renderHeatmapSection() {
    const topics = unique(sessions.flatMap((session) => session.tags || [])).slice(0, 12);
    const categories = unique(rows.map((row) => row.tag.category || "Other"));
    const matrix = topics.map((topic) => categories.map((category) => rows.filter((row) => (row.session.tags || []).includes(topic) && row.tag.category === category).length));
    renderHeatmap(document.getElementById("heatmapGrid"), topics, categories, matrix);
  }

  function renderDistribution() {
    const range = document.getElementById("rangeSelect").value;
    const since = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    const counts = countBy(rows.filter((row) => row.date.getTime() >= since).map((row) => row.tag.label));
    renderBarChart(document.getElementById("barChart"), topEntries(counts, 12).map(([label, value]) => ({ label, value })), {});
  }

  function renderTrend() {
    const topLabels = topEntries(countBy(rows.map((row) => row.tag.label)), 5).map(([label]) => label);
    const weeks = unique(rows.map((row) => weekKey(row.date))).sort();
    const series = topLabels.map((label) => ({
      label,
      values: weeks.map((week) => rows.filter((row) => row.tag.label === label && weekKey(row.date) === week).length),
    }));
    renderLineChart(document.getElementById("lineChart"), series, { labels: weeks });
  }

  function renderTopicDrilldown() {
    const topic = document.getElementById("topicSelect").value;
    const filtered = rows.filter((row) => !topic || (row.session.tags || []).includes(topic));
    const grouped = Object.values(filtered.reduce((acc, row) => {
      const key = row.tag.id;
      if (!acc[key]) acc[key] = { tag: row.tag, count: 0, last: row.date, problems: new Set(), elaborations: [] };
      acc[key].count += 1;
      if (row.date > acc[key].last) acc[key].last = row.date;
      acc[key].problems.add(row.problem.title || row.session.problemTitle);
      if (row.tag.elaboration) acc[key].elaborations.push(row.tag.elaboration);
      return acc;
    }, {})).sort((a, b) => b.count - a.count);
    document.getElementById("topicTable").innerHTML = table(["Mistake", "Count", "Last Date", "Problems", "Elaborations"], grouped.map((item) => [item.tag.label, item.count, item.last.toLocaleDateString(), Array.from(item.problems).join(", "), item.elaborations.join(" | ")]));
  }

  function renderSearch() {
    const q = document.getElementById("mistakeSearch").value.toLowerCase().trim();
    const grouped = Object.values(rows.filter((row) => !q || row.tag.label.toLowerCase().includes(q)).reduce((acc, row) => {
      const key = row.tag.id;
      if (!acc[key]) acc[key] = { tag: row.tag, rows: [] };
      acc[key].rows.push(row);
      return acc;
    }, {})).sort((a, b) => b.rows.length - a.rows.length).slice(0, 20);
    document.getElementById("searchResults").innerHTML = grouped.map((group) => `
      <details class="result"><summary>${escapeHtml(group.tag.label)} (${group.rows.length} occurrences)</summary>
        ${table(["Problem", "Difficulty", "Date", "Elaboration", "Link"], group.rows.map((row) => [row.problem.title || row.session.problemTitle, row.problem.difficulty || row.session.difficulty || "-", row.date.toLocaleDateString(), row.tag.elaboration || "-", `<a class="link" href="${escapeAttribute(row.problem.url || row.session.problemUrl)}" target="_blank">open</a>`]), true)}
      </details>`).join("");
  }

  function renderHistory() {
    const topic = document.getElementById("historyTopic").value;
    const mistake = document.getElementById("historyMistake").value;
    const sort = document.getElementById("historySort").value;
    let list = Object.values(problems).filter((problem) => !topic || (problem.topics || []).includes(topic));
    if (mistake) {
      const ids = new Set(rows.filter((row) => row.tag.id === mistake).map((row) => row.problem.id || row.session.problemId));
      list = list.filter((problem) => ids.has(problem.id));
    }
    list.sort((a, b) => sort === "difficulty" ? difficultyRank(b.difficulty) - difficultyRank(a.difficulty) : sort === "solves" ? (b.totalSolves || 0) - (a.totalSolves || 0) : latestDate(b) - latestDate(a));
    document.getElementById("historyTable").innerHTML = table(["Problem", "Topics", "Mistakes", "Last Solve", "Solves"], list.map((problem) => {
      const mistakeChips = rows.filter((row) => row.problem.id === problem.id).slice(0, 6).map((row) => `<span class="chip">${escapeHtml(row.tag.label)}</span>`).join("");
      return [`<a class="link" href="${escapeAttribute(problem.url)}" target="_blank">${escapeHtml(problem.title)}</a>`, (problem.topics || []).join(", "), mistakeChips || "-", formatDate(latestDate(problem)), problem.totalSolves || problem.iterationCount || 0];
    }), true);
  }

  function fillSelects() {
    const topics = unique(Object.values(problems).flatMap((problem) => problem.topics || []));
    const mistakes = unique(rows.map((row) => row.tag.label));
    document.getElementById("topicSelect").innerHTML = topics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join("");
    document.getElementById("historyTopic").innerHTML = `<option value="">All topics</option>${topics.map((topic) => `<option>${escapeHtml(topic)}</option>`).join("")}`;
    document.getElementById("historyMistake").innerHTML = `<option value="">All mistakes</option>${unique(rows.map((row) => row.tag.id)).map((id) => `<option value="${escapeAttribute(id)}">${escapeHtml(rows.find((row) => row.tag.id === id)?.tag.label || id)}</option>`).join("")}`;
    if (!document.getElementById("topicSelect").value && topics[0]) document.getElementById("topicSelect").value = topics[0];
    void mistakes;
  }

  function renderBarChart(svg, data) {
    const max = Math.max(1, ...data.map((item) => item.value));
    svg.innerHTML = data.map((item, index) => {
      const y = 28 + index * 24;
      const width = Math.round((item.value / max) * 620);
      return `<text class="chart-label" x="10" y="${y + 14}">${escapeHtml(truncate(item.label, 28))}</text><rect x="230" y="${y}" width="${width}" height="16" rx="5" fill="#38bdf8"></rect><text class="chart-muted" x="${240 + width}" y="${y + 13}">${item.value}</text>`;
    }).join("");
  }

  function renderLineChart(svg, seriesArray, options) {
    const colors = ["#38bdf8", "#fb7185", "#a78bfa", "#facc15", "#34d399"];
    const max = Math.max(1, ...seriesArray.flatMap((series) => series.values));
    const labels = options.labels || [];
    const plot = { x: 60, y: 30, w: 760, h: 250 };
    svg.innerHTML = `<line x1="${plot.x}" y1="${plot.y + plot.h}" x2="${plot.x + plot.w}" y2="${plot.y + plot.h}" stroke="#334155"/><line x1="${plot.x}" y1="${plot.y}" x2="${plot.x}" y2="${plot.y + plot.h}" stroke="#334155"/>` + seriesArray.map((series, si) => {
      const points = series.values.map((value, index) => `${plot.x + (index / Math.max(1, labels.length - 1)) * plot.w},${plot.y + plot.h - (value / max) * plot.h}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${colors[si]}" stroke-width="3"/>${series.values.map((value, index) => `<circle cx="${plot.x + (index / Math.max(1, labels.length - 1)) * plot.w}" cy="${plot.y + plot.h - (value / max) * plot.h}" r="4" fill="${colors[si]}"/>`).join("")}<text class="chart-label" x="60" y="${310 + si * 18}" fill="${colors[si]}">${escapeHtml(series.label)}</text>`;
    }).join("");
  }

  function renderHeatmap(container, rowLabels, colLabels, matrix) {
    const max = Math.max(1, ...matrix.flat());
    container.innerHTML = `<div class="heatmap" style="--cols:${colLabels.length}"><div></div>${colLabels.map((label) => `<div class="heat-label heat-head">${escapeHtml(label)}</div>`).join("")}${rowLabels.map((row, r) => `<div class="heat-label">${escapeHtml(row)}</div>${colLabels.map((col, c) => {
      const value = matrix[r][c];
      const alpha = 0.08 + (value / max) * 0.72;
      return `<div class="heat-cell" style="background:rgba(56,189,248,${alpha})" title="${escapeAttribute(row)} x ${escapeAttribute(col)}">${value}</div>`;
    }).join("")}`).join("")}</div>`;
  }

  function table(headers, bodyRows, trustedHtml) {
    return `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead><tbody>${bodyRows.map((row) => `<tr>${row.map((cell) => `<td>${trustedHtml ? cell : escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function findProblemByUrl(url) { const normalized = normalizeProblemUrl(url); return Object.values(problems).find((problem) => normalizeProblemUrl(problem.url) === normalized) || null; }
  function normalizeProblemUrl(url) { try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`; } catch { return String(url || ""); } }
  function getSecs(session) { return Number(session.timeSecs ?? session.timeTaken ?? 0) || Math.round((Number(session.timeTakenMs) || 0) / 1000); }
  function countBy(items) { return items.reduce((acc, item) => { if (item) acc[item] = (acc[item] || 0) + 1; return acc; }, {}); }
  function topEntries(obj, n) { return Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n); }
  function unique(items) { return Array.from(new Set(items.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b))); }
  function weekKey(date) { const d = new Date(date); const first = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-W${Math.ceil((((d - first) / 86400000) + first.getDay() + 1) / 7)}`; }
  function streak() { const days = unique(sessions.map((s) => String(s.date || "").slice(0, 10))).sort(); let count = 0; let cursor = new Date(); cursor.setHours(0, 0, 0, 0); for (let i = days.length - 1; i >= 0; i -= 1) { const day = new Date(days[i]); day.setHours(0, 0, 0, 0); const diff = Math.round((cursor - day) / 86400000); if (diff === count) count += 1; else if (diff > count) break; } return count; }
  function latestDate(problem) { return Math.max(0, ...sessions.filter((s) => s.problemId === problem.id).map((s) => new Date(s.date).getTime())); }
  function difficultyRank(value) { const v = String(value || "").toLowerCase(); return v.includes("hard") ? 3 : v.includes("medium") ? 2 : v.includes("easy") ? 1 : Number(v) || 0; }
  function formatHours(secs) { return secs >= 3600 ? `${Math.round(secs / 360) / 10}h` : `${Math.round(secs / 60)}m`; }
  function formatDate(ms) { return ms ? new Date(ms).toLocaleDateString() : "-"; }
  function truncate(value, max) { return String(value).length > max ? `${String(value).slice(0, max - 1)}...` : String(value); }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
  function escapeAttribute(value) { return escapeHtml(value); }
})();
