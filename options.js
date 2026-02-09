// ── Simple Redirect — Options Page ──

const STORAGE_KEY = "redirectRules";
const ENABLED_KEY = "globalEnabled";
const ALLOWLIST_KEY = "allowlistRules";

const $addForm = document.getElementById("addForm");
const $sourceInput = document.getElementById("sourceInput");
const $targetInput = document.getElementById("targetInput");
const $rulesList = document.getElementById("rulesList");
const $emptyState = document.getElementById("emptyState");
const $ruleCount = document.getElementById("ruleCount");
const $globalToggle = document.getElementById("globalToggle");
const $globalLabel = document.getElementById("globalLabel");
const $allowlistForm = document.getElementById("allowlistForm");
const $allowlistInput = document.getElementById("allowlistInput");
const $allowlistList = document.getElementById("allowlistList");
const $allowlistEmpty = document.getElementById("allowlistEmpty");
const $allowlistCount = document.getElementById("allowlistCount");

// ── In-memory cache (sole writer — avoids async IPC on every click) ──

let _rules = [];
let _enabled = true;
let _allowlist = [];

// ── Helpers ──

function toast(msg) {
  let $t = document.querySelector(".toast");
  if (!$t) {
    $t = document.createElement("div");
    $t.className = "toast";
    document.body.appendChild($t);
  }
  $t.textContent = msg;
  $t.classList.add("show");
  clearTimeout($t._timer);
  $t._timer = setTimeout(() => $t.classList.remove("show"), 2200);
}

function getRules() {
  return _rules;
}

async function saveRules(rules) {
  _rules = rules;
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

function getGlobalEnabled() {
  return _enabled;
}

async function setGlobalEnabled(val) {
  _enabled = val;
  await chrome.storage.local.set({ [ENABLED_KEY]: val });
}

function getAllowlist() {
  return _allowlist;
}

async function saveAllowlist(list) {
  _allowlist = list;
  await chrome.storage.local.set({ [ALLOWLIST_KEY]: list });
}

async function refreshFromStorage() {
  const data = await chrome.storage.local.get([
    STORAGE_KEY,
    ENABLED_KEY,
    ALLOWLIST_KEY,
  ]);
  _rules = data[STORAGE_KEY] || [];
  _enabled = data[ENABLED_KEY] ?? true;
  _allowlist = data[ALLOWLIST_KEY] || [];
  renderRules(_rules);
  renderGlobalToggle(_enabled);
  renderAllowlist(_allowlist);
}

// ── Render ──

function renderGlobalToggle(enabled) {
  $globalToggle.setAttribute("data-on", enabled);
  $globalLabel.textContent = enabled ? "Active" : "Paused";
  $globalLabel.classList.toggle("paused", !enabled);
}

function renderRules(rules) {
  $rulesList.innerHTML = "";
  $emptyState.classList.toggle("visible", rules.length === 0);
  $ruleCount.textContent = `${rules.length} rule${rules.length !== 1 ? "s" : ""}`;

  rules.forEach((rule, index) => {
    const isEditing = index === editingIndex;
    const row = document.createElement("div");
    row.className = `rule-row${rule.enabled ? "" : " disabled"}${isEditing ? " editing" : ""}`;

    if (isEditing) {
      row.innerHTML = `
        <button class="rule-toggle" data-on="${rule.enabled}" data-index="${index}" aria-label="Toggle rule">
          <span class="mini-track"><span class="mini-thumb"></span></span>
        </button>
        <div class="rule-info">
          <input class="rule-edit-input" data-field="source" value="${escapeHtml(rule.source)}" spellcheck="false" autocomplete="off" />
          <span class="rule-arrow">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <input class="rule-edit-input" data-field="target" value="${escapeHtml(rule.target)}" spellcheck="false" autocomplete="off" />
        </div>
        <button class="rule-save" data-index="${index}" aria-label="Save changes">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="rule-cancel" data-index="${index}" aria-label="Cancel editing">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      `;
    } else {
      row.innerHTML = `
        <button class="rule-toggle" data-on="${rule.enabled}" data-index="${index}" aria-label="Toggle rule">
          <span class="mini-track"><span class="mini-thumb"></span></span>
        </button>
        <div class="rule-info">
          <span class="rule-source" title="${escapeHtml(rule.source)}">${escapeHtml(rule.source)}</span>
          <span class="rule-arrow">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="rule-target" title="${escapeHtml(rule.target)}">${escapeHtml(rule.target)}</span>
        </div>
        <button class="rule-edit" data-index="${index}" aria-label="Edit rule">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button class="rule-delete" data-index="${index}" aria-label="Delete rule">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      `;
    }

    $rulesList.appendChild(row);
  });
}

const escapeMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => escapeMap[ch]);
}

function normalizePattern(val) {
  val = val.trim();
  if (!val) return val;
  // Strip protocol — || domain anchor in background handles all protocols + subdomains
  val = val.replace(/^(\*|https?):\/\//, "");
  // Bare domain with no path — append /* to match all paths
  if (!val.includes("/")) {
    val += "/*";
  }
  return val;
}

function normalizeTarget(val) {
  val = val.trim();
  if (!val) return val;
  if (/^https?:\/\//.test(val)) return val;
  // Reject dangerous schemes
  if (/^[a-z][a-z0-9+.-]*:/i.test(val)) return null;
  return `https://${val}`;
}

let editingIndex = -1;

// ── Validation ──

function wouldLoop(source, target) {
  try {
    const url = new URL(target);
    const host = url.hostname.replace(/^www\./, "");
    const patternHost = source.split("/")[0].replace(/^www\./, "");
    // Check if the target domain matches the source pattern domain
    if (host === patternHost || host.endsWith(`.${patternHost}`)) return true;
  } catch { /* ignore */ }
  return false;
}

function validateRule(source, target) {
  if (!source || !target) {
    toast("Both fields are required");
    return false;
  }
  try {
    new URL(target);
  } catch {
    toast("Target must be a valid URL");
    return false;
  }
  if (wouldLoop(source, target)) {
    toast("Target matches source — this would loop");
    return false;
  }
  return true;
}

// ── Events ──

// Add rule
$addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const source = normalizePattern($sourceInput.value);
  const target = normalizeTarget($targetInput.value);

  if (!validateRule(source, target)) return;

  const rules = getRules();
  if (rules.some((r) => r.source === source)) {
    toast("A rule for this pattern already exists");
    return;
  }
  rules.push({ source, target, enabled: true });
  await saveRules(rules);

  $sourceInput.value = "";
  $targetInput.value = "";
  $sourceInput.focus();
  renderRules(rules);
  toast("Redirect added");
});

// Toggle, delete, edit, save, cancel (event delegation)
$rulesList.addEventListener("click", async (e) => {
  const toggleBtn = e.target.closest(".rule-toggle");
  const deleteBtn = e.target.closest(".rule-delete");
  const editBtn = e.target.closest(".rule-edit");
  const saveBtn = e.target.closest(".rule-save");
  const cancelBtn = e.target.closest(".rule-cancel");

  if (toggleBtn) {
    const idx = parseInt(toggleBtn.dataset.index, 10);
    const rules = getRules();
    if (idx < 0 || idx >= rules.length) return;
    rules[idx].enabled = !rules[idx].enabled;
    await saveRules(rules);
    renderRules(rules);
    toast(rules[idx].enabled ? "Redirect enabled" : "Redirect paused");
  }

  if (deleteBtn) {
    const idx = parseInt(deleteBtn.dataset.index, 10);
    const rules = getRules();
    if (idx < 0 || idx >= rules.length) return;
    rules.splice(idx, 1);
    await saveRules(rules);
    editingIndex = -1;
    renderRules(rules);
    toast("Redirect removed");
  }

  if (editBtn) {
    editingIndex = parseInt(editBtn.dataset.index, 10);
    renderRules(getRules());
    const sourceInput = $rulesList.querySelector('[data-field="source"]');
    if (sourceInput) sourceInput.focus();
  }

  if (saveBtn) {
    const idx = parseInt(saveBtn.dataset.index, 10);
    const sourceInput = $rulesList.querySelector('[data-field="source"]');
    const targetInput = $rulesList.querySelector('[data-field="target"]');
    const source = normalizePattern(sourceInput.value);
    const target = normalizeTarget(targetInput.value);

    if (!validateRule(source, target)) return;

    const rules = getRules();
    if (idx < 0 || idx >= rules.length) return;
    if (rules.some((r, i) => i !== idx && r.source === source)) {
      toast("A rule for this pattern already exists");
      return;
    }
    rules[idx].source = source;
    rules[idx].target = target;
    await saveRules(rules);
    editingIndex = -1;
    renderRules(rules);
    toast("Redirect updated");
  }

  if (cancelBtn) {
    editingIndex = -1;
    renderRules(getRules());
  }
});

// Enter to save, Escape to cancel when editing
$rulesList.addEventListener("keydown", async (e) => {
  if (editingIndex === -1) return;
  if (e.key === "Enter") {
    e.preventDefault();
    const saveBtn = $rulesList.querySelector(".rule-save");
    if (saveBtn) saveBtn.click();
  }
  if (e.key === "Escape") {
    editingIndex = -1;
    renderRules(getRules());
  }
});

// Global toggle
$globalToggle.addEventListener("click", async () => {
  const next = !getGlobalEnabled();
  await setGlobalEnabled(next);
  renderGlobalToggle(next);
  toast(next ? "All redirects active" : "All redirects paused");
});

// ── Allowlist ──

function renderAllowlist(list) {
  $allowlistList.innerHTML = "";
  $allowlistEmpty.classList.toggle("visible", list.length === 0);
  $allowlistCount.textContent = `${list.length} entr${list.length !== 1 ? "ies" : "y"}`;

  list.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = "allowlist-row";
    row.innerHTML = `
      <span class="allowlist-icon">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M8 1.5l5 2.5v4c0 3.5-2.5 5.5-5 6.5-2.5-1-5-3-5-6.5V4l5-2.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6 8l1.5 1.5L10.5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      <span class="allowlist-pattern" title="${escapeHtml(entry)}">${escapeHtml(entry)}</span>
      <button class="allowlist-delete" data-index="${index}" aria-label="Remove from allowlist">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    $allowlistList.appendChild(row);
  });
}

$allowlistForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const entry = normalizePattern($allowlistInput.value);
  if (!entry) {
    toast("Enter a URL pattern");
    return;
  }
  const list = getAllowlist();
  if (list.includes(entry)) {
    toast("Already in allowlist");
    return;
  }
  list.push(entry);
  await saveAllowlist(list);
  $allowlistInput.value = "";
  $allowlistInput.focus();
  renderAllowlist(list);
  toast("Added to allowlist");
});

$allowlistList.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest(".allowlist-delete");
  if (deleteBtn) {
    const idx = parseInt(deleteBtn.dataset.index, 10);
    const list = getAllowlist();
    if (idx < 0 || idx >= list.length) return;
    list.splice(idx, 1);
    await saveAllowlist(list);
    renderAllowlist(list);
    toast("Removed from allowlist");
  }
});

// Keep options page in sync when toggled from toolbar action
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY]) {
    _rules = changes[STORAGE_KEY].newValue || [];
    renderRules(_rules);
  }
  if (changes[ENABLED_KEY]) {
    _enabled = changes[ENABLED_KEY].newValue ?? true;
    renderGlobalToggle(_enabled);
  }
  if (changes[ALLOWLIST_KEY]) {
    _allowlist = changes[ALLOWLIST_KEY].newValue || [];
    renderAllowlist(_allowlist);
  }
});

// If the tab is resumed later, pull latest state once.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    refreshFromStorage();
  }
});

// ── Init ──

(async () => {
  await refreshFromStorage();
})();
