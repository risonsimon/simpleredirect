// ── Simple Redirect — Background Service Worker ──

const STORAGE_KEY = "redirectRules";
const ENABLED_KEY = "globalEnabled";
const ALLOWLIST_KEY = "allowlistRules";

// ── Icon state ──

function setIcon(enabled) {
  const suffix = enabled ? "" : "-off";
  chrome.action.setIcon({
    path: {
      16: `icons/icon-16${suffix}.png`,
      32: `icons/icon-32${suffix}.png`,
      48: `icons/icon-48${suffix}.png`,
      128: `icons/icon-128${suffix}.png`,
    },
  });
  chrome.action.setTitle({
    title: enabled
      ? "Simple Redirect — Active (click to pause)"
      : "Simple Redirect — Paused (click to resume)",
  });
}

// ── Convert stored pattern to a urlFilter with || domain anchor ──

function toUrlFilter(pattern) {
  // Strip any protocol prefix — || domain anchor handles all protocols + subdomains
  const cleaned = pattern.replace(/^(\*|https?):\/\//, "");
  return `||${cleaned}`;
}

// ── Sync rules to declarativeNetRequest ──

async function syncRules() {
  const {
    [STORAGE_KEY]: rules = [],
    [ENABLED_KEY]: globalEnabled = true,
    [ALLOWLIST_KEY]: allowlist = [],
  } = await chrome.storage.local.get([STORAGE_KEY, ENABLED_KEY, ALLOWLIST_KEY]);

  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map((r) => r.id);

  // Build new rules — only when global is on
  const addRules = [];
  let ruleId = 1;

  if (globalEnabled) {
    // Redirect rules (priority 1)
    rules.forEach((rule) => {
      if (!rule.enabled) return;
      addRules.push({
        id: ruleId++,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: rule.target },
        },
        condition: {
          urlFilter: toUrlFilter(rule.source),
          resourceTypes: ["main_frame"],
        },
      });
    });

    // Allowlist rules (priority 2 — higher priority takes precedence)
    allowlist.forEach((entry) => {
      addRules.push({
        id: ruleId++,
        priority: 2,
        action: { type: "allow" },
        condition: {
          urlFilter: toUrlFilter(entry),
          resourceTypes: ["main_frame"],
        },
      });
    });
  }

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeIds,
      addRules,
    });
  } catch (e) {
    console.error("Failed to update redirect rules:", e);
  }
}

// ── Toggle on icon click ──

chrome.action.onClicked.addListener(async () => {
  const { [ENABLED_KEY]: current = true } = await chrome.storage.local.get(
    ENABLED_KEY
  );
  const next = !current;
  await chrome.storage.local.set({ [ENABLED_KEY]: next });
  // setIcon + syncRules handled by storage.onChanged listener
});

// ── Re-sync whenever storage changes (options page edits) ──

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY] || changes[ENABLED_KEY] || changes[ALLOWLIST_KEY]) {
    syncRules();
    if (changes[ENABLED_KEY]) {
      setIcon(changes[ENABLED_KEY].newValue);
    }
  }
});

// ── Init on install / startup ──

async function init() {
  const { [ENABLED_KEY]: enabled = true } = await chrome.storage.local.get(
    ENABLED_KEY
  );
  setIcon(enabled);
  await syncRules();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
