// Storage extension introduced here:
// revise_mate_data.customMistakeTags: [{ id, label, category: "Custom" }]
(function () {
  const MISTAKE_TAGS = [
    { category: "Pattern Recognition", tags: [
      { id: "no-pattern", label: "Didn't recognize the pattern" },
      { id: "wrong-algo", label: "Wrong algorithm choice" },
      { id: "missed-greedy", label: "Missed greedy opportunity" },
      { id: "overcomplicated", label: "Overcomplicated the solution" },
    ] },
    { category: "Logic & Conditions", tags: [
      { id: "off-by-one", label: "Off-by-one error" },
      { id: "wrong-loop", label: "Wrong loop condition" },
      { id: "wrong-base-case", label: "Incorrect base case (DP/recursion)" },
      { id: "wrong-transition", label: "Wrong DP transition" },
      { id: "missed-return", label: "Missed return / early exit" },
    ] },
    { category: "Edge Cases", tags: [
      { id: "empty-input", label: "Empty input not handled" },
      { id: "single-element", label: "Single element case missed" },
      { id: "negative-nums", label: "Negative numbers not considered" },
      { id: "int-overflow", label: "Integer overflow missed" },
      { id: "duplicates", label: "Duplicate handling missed" },
    ] },
    { category: "Problem Understanding", tags: [
      { id: "misread", label: "Misread the problem statement" },
      { id: "constraint-confusion", label: "Constraint confusion" },
      { id: "unused-constraint", label: "Didn't use a key constraint" },
      { id: "wrong-output", label: "Wrong interpretation of output" },
    ] },
    { category: "State & Data Structure", tags: [
      { id: "wrong-ds", label: "Wrong data structure chosen" },
      { id: "state-confusion", label: "State confusion" },
      { id: "bad-init", label: "Incorrect state initialization" },
      { id: "index-confusion", label: "Index confusion (0-based vs 1-based)" },
    ] },
    { category: "Optimization", tags: [
      { id: "tle", label: "Got TLE (correct logic, too slow)" },
      { id: "no-space-opt", label: "Missed space optimization" },
      { id: "no-early-exit", label: "Missed early termination" },
    ] },
    { category: "Implementation", tags: [
      { id: "syntax-error", label: "Syntax / API error" },
      { id: "logic-bug", label: "Coding bug (correct logic, wrong code)" },
      { id: "naming-confusion", label: "Variable naming confusion" },
    ] },
  ];

  const flatBaseTags = MISTAKE_TAGS.flatMap((group) => group.tags.map((tag) => ({ ...tag, category: group.category })));

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `custom-${Date.now()}`;
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function fuzzyMatch(query, label) {
    const q = normalizeText(query);
    const text = normalizeText(label);
    if (!q) return true;
    if (text.includes(q)) return true;
    let cursor = 0;
    for (const char of q.replace(/\s+/g, "")) {
      cursor = text.indexOf(char, cursor);
      if (cursor === -1) return false;
      cursor += 1;
    }
    return true;
  }

  function getCustomTags(cb) {
    chrome.storage.local.get(["revise_mate_data"], (result) => {
      const data = result.revise_mate_data && typeof result.revise_mate_data === "object" ? result.revise_mate_data : {};
      cb(Array.isArray(data.customMistakeTags) ? data.customMistakeTags : []);
    });
  }

  function saveCustomTag(label, cb) {
    const cleanLabel = String(label || "").trim().slice(0, 80);
    if (!cleanLabel) {
      cb(null);
      return;
    }
    chrome.storage.local.get(["revise_mate_data"], (result) => {
      const data = result.revise_mate_data && typeof result.revise_mate_data === "object" ? result.revise_mate_data : {};
      const existing = Array.isArray(data.customMistakeTags) ? data.customMistakeTags : [];
      const idBase = `custom-${slugify(cleanLabel)}`;
      const existingLabels = new Set(existing.map((tag) => normalizeText(tag.label)));
      const tag = existingLabels.has(normalizeText(cleanLabel))
        ? existing.find((item) => normalizeText(item.label) === normalizeText(cleanLabel))
        : { id: existing.some((item) => item.id === idBase) ? `${idBase}-${Date.now()}` : idBase, label: cleanLabel, category: "Custom" };
      const next = existingLabels.has(normalizeText(cleanLabel)) ? existing : [...existing, tag];
      chrome.storage.local.set({ revise_mate_data: { ...data, customMistakeTags: next } }, () => cb(tag));
    });
  }

  function groupTags(tags) {
    return tags.reduce((groups, tag) => {
      const category = tag.category || "Custom";
      if (!groups[category]) groups[category] = [];
      groups[category].push(tag);
      return groups;
    }, {});
  }

  function createPicker(root, initialTags) {
    const selected = Array.isArray(initialTags) ? initialTags.map((tag) => ({ ...tag, elaboration: tag.elaboration || "" })) : [];
    let allTags = flatBaseTags.slice();
    root.innerHTML = `
      <div class="rh-mistake-picker">
        <input id="rh-mistake-search" class="rh-field" type="text" placeholder="Search mistake tags..." autocomplete="off" />
        <div id="rh-mistake-dropdown" class="rh-mistake-dropdown"></div>
        <div id="rh-selected-tags" class="rh-selected-tags"></div>
      </div>
    `;
    const search = root.querySelector("#rh-mistake-search");
    const dropdown = root.querySelector("#rh-mistake-dropdown");
    const selectedEl = root.querySelector("#rh-selected-tags");

    getCustomTags((customTags) => {
      allTags = [...flatBaseTags, ...customTags.map((tag) => ({ ...tag, category: "Custom" }))];
      renderDropdown();
      renderSelected();
    });

    search.addEventListener("focus", renderDropdown);
    search.addEventListener("input", renderDropdown);

    function renderDropdown() {
      const query = search.value.trim();
      const matches = allTags.filter((tag) => fuzzyMatch(query, tag.label) && !selected.some((item) => item.id === tag.id));
      const groups = groupTags(matches);
      const noExact = query && !allTags.some((tag) => normalizeText(tag.label) === normalizeText(query));
      dropdown.style.display = "block";
      dropdown.innerHTML = Object.entries(groups).map(([category, tags]) => `
        <div class="rh-mistake-group"><div class="rh-mistake-category">${escapeHtml(category)}</div>
          ${tags.map((tag) => `<button type="button" class="rh-mistake-option" data-id="${escapeAttribute(tag.id)}">${escapeHtml(tag.label)}</button>`).join("")}
        </div>
      `).join("") + (noExact ? `<button type="button" class="rh-create-custom" data-label="${escapeAttribute(query)}">+ Create custom tag: "${escapeHtml(query)}"</button>` : "");

      dropdown.querySelectorAll(".rh-mistake-option").forEach((button) => {
        button.addEventListener("click", () => {
          const tag = allTags.find((item) => item.id === button.dataset.id);
          if (tag) selected.push({ ...tag, elaboration: "" });
          search.value = "";
          renderSelected();
          renderDropdown();
        });
      });
      dropdown.querySelector(".rh-create-custom")?.addEventListener("click", (event) => {
        saveCustomTag(event.currentTarget.dataset.label, (tag) => {
          if (!tag) return;
          allTags = [...allTags, tag];
          selected.push({ ...tag, elaboration: "" });
          search.value = "";
          renderSelected();
          renderDropdown();
        });
      });
    }

    function renderSelected() {
      selectedEl.innerHTML = selected.length ? selected.map((tag, index) => `
        <div class="rh-selected-block">
          <button type="button" class="rh-selected-chip" data-remove="${index}">${escapeHtml(tag.label)} x</button>
          <textarea class="rh-field rh-elaboration" data-index="${index}" maxlength="200" rows="2" placeholder="${escapeAttribute(tag.label)} - what exactly went wrong?">${escapeHtml(tag.elaboration || "")}</textarea>
        </div>
      `).join("") : '<div class="rh-muted">No mistake tags selected.</div>';
      selectedEl.querySelectorAll("[data-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          selected.splice(Number(button.dataset.remove), 1);
          renderSelected();
          renderDropdown();
        });
      });
      selectedEl.querySelectorAll(".rh-elaboration").forEach((textarea) => {
        textarea.addEventListener("input", () => {
          const tag = selected[Number(textarea.dataset.index)];
          if (tag) tag.elaboration = textarea.value.slice(0, 200);
        });
      });
    }

    return {
      getSelected() {
        return selected.map((tag) => ({
          id: tag.id,
          label: tag.label,
          category: tag.category || "Custom",
          elaboration: String(tag.elaboration || "").trim().slice(0, 200),
        }));
      },
    };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  window.MISTAKE_TAGS = MISTAKE_TAGS;
  window.ReHashMistakeTags = { createPicker, fuzzyMatch, getBaseTags: () => flatBaseTags.slice(), getCustomTags, saveCustomTag };
})();
