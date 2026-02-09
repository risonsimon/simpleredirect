// ── Simple Redirect — Background Service Worker ──

const STORAGE_KEY = "redirectRules";
const ENABLED_KEY = "globalEnabled";

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

// ── Convert a user pattern (with wildcards) to a declarativeNetRequest regex ──

function patternToRegex(pattern) {
  // Escape regex-special characters except our wildcard *
  let escaped = pattern.replace(/([.+?^${}()|[\]\\])/g, "\\$1");
  // Replace * with .*
  escaped = escaped.replace(/\*/g, ".*");
  // Anchor it
  return `^${escaped}$`;
}

// ── Sync rules to declarativeNetRequest ──

async function syncRules() {
  const { [STORAGE_KEY]: rules = [], [ENABLED_KEY]: globalEnabled = true } =
    await chrome.storage.local.get([STORAGE_KEY, ENABLED_KEY]);

  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map((r) => r.id);

  // Build new rules — only for enabled rules when global is on
  const addRules = [];
  if (globalEnabled) {
    rules.forEach((rule, index) => {
      if (!rule.enabled) return;
      addRules.push({
        id: index + 1,
        priority: 1,
        action: {
          type: "redirect",
          redirect: { url: rule.target },
        },
        condition: {
          regexFilter: patternToRegex(rule.source),
          resourceTypes: ["main_frame"],
        },
      });
    });
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules,
  });
}

// ── Toggle on icon click ──

chrome.action.onClicked.addListener(async () => {
  const { [ENABLED_KEY]: current = true } = await chrome.storage.local.get(
    ENABLED_KEY
  );
  const next = !current;
  await chrome.storage.local.set({ [ENABLED_KEY]: next });
  setIcon(next);
  await syncRules();
});

// ── Re-sync whenever storage changes (options page edits) ──

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY] || changes[ENABLED_KEY]) {
    syncRules();
    if (changes[ENABLED_KEY]) {
      setIcon(changes[ENABLED_KEY].newValue);
    }
  }
});

// ── Init on install / startup ──

chrome.runtime.onInstalled.addListener(async () => {
  const { [ENABLED_KEY]: enabled = true } = await chrome.storage.local.get(
    ENABLED_KEY
  );
  setIcon(enabled);
  await syncRules();
});

chrome.runtime.onStartup.addListener(async () => {
  const { [ENABLED_KEY]: enabled = true } = await chrome.storage.local.get(
    ENABLED_KEY
  );
  setIcon(enabled);
  await syncRules();
});
