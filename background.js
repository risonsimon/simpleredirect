// ── Simple Redirect — Background Service Worker ──

const STORAGE_KEY = "redirectRules";
const ENABLED_KEY = "globalEnabled";
const ALLOWLIST_KEY = "allowlistRules";

// ── In-memory cache for webNavigation fallback (synchronous access) ──

let _cachedRules = [];
let _cachedEnabled = true;
let _cachedAllowlist = [];

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

// ── Parse stored pattern into domain + path ──

function parsePattern(pattern) {
  const cleaned = pattern.replace(/^(\*|https?):\/\//, "");
  const slashIdx = cleaned.indexOf("/");
  if (slashIdx === -1) return { domain: cleaned, path: null };
  return {
    domain: cleaned.substring(0, slashIdx),
    path: cleaned.substring(slashIdx),
  };
}

// ── Build a declarativeNetRequest condition from a pattern ──

function buildCondition(pattern) {
  const { domain, path } = parsePattern(pattern);
  const condition = { resourceTypes: ["main_frame"] };

  // Use requestDomains for reliable domain matching (handles subdomains too)
  if (domain) {
    condition.requestDomains = [domain.replace(/^\*\./, "")];
  }

  // Only add urlFilter when there's a specific path (not the catch-all /*)
  if (path && path !== "/*") {
    condition.urlFilter = path;
  }

  return condition;
}

// ── Sync rules to declarativeNetRequest ──

async function syncRules() {
  const {
    [STORAGE_KEY]: rules = [],
    [ENABLED_KEY]: globalEnabled = true,
    [ALLOWLIST_KEY]: allowlist = [],
  } = await chrome.storage.local.get([STORAGE_KEY, ENABLED_KEY, ALLOWLIST_KEY]);

  // Update in-memory cache for the webNavigation fallback
  _cachedRules = rules;
  _cachedEnabled = globalEnabled;
  _cachedAllowlist = allowlist;

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
        condition: buildCondition(rule.source),
      });
    });

    // Allowlist rules (priority 2 — higher priority takes precedence)
    allowlist.forEach((entry) => {
      addRules.push({
        id: ruleId++,
        priority: 2,
        action: { type: "allow" },
        condition: buildCondition(entry),
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

// ── Fallback: catch navigations that bypass declarativeNetRequest ──
// Sites with Service Workers (e.g. x.com) can serve cached responses
// without hitting the network, so declarativeNetRequest never fires.
// tabs.onUpdated still fires when the tab URL changes, no extra permissions needed.

function urlMatchesDomain(url, pattern) {
  const { domain } = parsePattern(pattern);
  if (!domain) return false;
  try {
    const host = new URL(url).hostname;
    const clean = domain.replace(/^\*\./, "");
    return host === clean || host.endsWith("." + clean);
  } catch {
    return false;
  }
}

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const currentUrl = changeInfo.url || tab?.pendingUrl || tab?.url;
  if (!currentUrl) return;

  // MV3 service workers are ephemeral; refresh cache from storage on each event.
  // This keeps fallback redirects working even after worker restarts.
  const {
    [STORAGE_KEY]: rules = _cachedRules,
    [ENABLED_KEY]: globalEnabled = _cachedEnabled,
    [ALLOWLIST_KEY]: allowlist = _cachedAllowlist,
  } = await chrome.storage.local.get([STORAGE_KEY, ENABLED_KEY, ALLOWLIST_KEY]);

  _cachedRules = rules;
  _cachedEnabled = globalEnabled;
  _cachedAllowlist = allowlist;

  if (!globalEnabled) return;

  const matched = rules.find(
    (r) => r.enabled && urlMatchesDomain(currentUrl, r.source)
  );
  if (!matched) return;

  const allowed = allowlist.some((entry) =>
    urlMatchesDomain(currentUrl, entry)
  );
  if (allowed) return;

  if (currentUrl === matched.target) return;

  chrome.tabs.update(tabId, { url: matched.target });
});
