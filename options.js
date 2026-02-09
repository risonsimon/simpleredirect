// ── Simple Redirect — Options Page ──

const STORAGE_KEY = "redirectRules";
const ENABLED_KEY = "globalEnabled";

const $addForm = document.getElementById("addForm");
const $sourceInput = document.getElementById("sourceInput");
const $targetInput = document.getElementById("targetInput");
const $rulesList = document.getElementById("rulesList");
const $emptyState = document.getElementById("emptyState");
const $ruleCount = document.getElementById("ruleCount");
const $globalToggle = document.getElementById("globalToggle");
const $globalLabel = document.getElementById("globalLabel");

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

async function getRules() {
  const { [STORAGE_KEY]: rules = [] } = await chrome.storage.local.get(STORAGE_KEY);
  return rules;
}

async function saveRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
}

async function getGlobalEnabled() {
  const { [ENABLED_KEY]: enabled = true } = await chrome.storage.local.get(ENABLED_KEY);
  return enabled;
}

async function setGlobalEnabled(val) {
  await chrome.storage.local.set({ [ENABLED_KEY]: val });
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
    const row = document.createElement("div");
    row.className = `rule-row${rule.enabled ? "" : " disabled"}`;

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
      <button class="rule-delete" data-index="${index}" aria-label="Delete rule">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    $rulesList.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── Events ──

// Add rule
$addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const source = $sourceInput.value.trim();
  const target = $targetInput.value.trim();

  if (!source || !target) {
    toast("Both fields are required");
    return;
  }

  // Basic URL validation for target
  try {
    new URL(target);
  } catch {
    toast("Target must be a valid URL");
    return;
  }

  const rules = await getRules();
  rules.push({ source, target, enabled: true });
  await saveRules(rules);

  $sourceInput.value = "";
  $targetInput.value = "";
  $sourceInput.focus();
  renderRules(rules);
  toast("Redirect added");
});

// Toggle & delete individual rules (event delegation)
$rulesList.addEventListener("click", async (e) => {
  const toggleBtn = e.target.closest(".rule-toggle");
  const deleteBtn = e.target.closest(".rule-delete");

  if (toggleBtn) {
    const idx = parseInt(toggleBtn.dataset.index, 10);
    const rules = await getRules();
    rules[idx].enabled = !rules[idx].enabled;
    await saveRules(rules);
    renderRules(rules);
    toast(rules[idx].enabled ? "Redirect enabled" : "Redirect paused");
  }

  if (deleteBtn) {
    const idx = parseInt(deleteBtn.dataset.index, 10);
    const rules = await getRules();
    rules.splice(idx, 1);
    await saveRules(rules);
    renderRules(rules);
    toast("Redirect removed");
  }
});

// Global toggle
$globalToggle.addEventListener("click", async () => {
  const current = await getGlobalEnabled();
  const next = !current;
  await setGlobalEnabled(next);
  renderGlobalToggle(next);
  toast(next ? "All redirects active" : "All redirects paused");
});

// ── Init ──

(async () => {
  const [rules, enabled] = await Promise.all([getRules(), getGlobalEnabled()]);
  renderRules(rules);
  renderGlobalToggle(enabled);
})();
