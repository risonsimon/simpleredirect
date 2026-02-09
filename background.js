// ── Simple Redirect — Background Service Worker ──

const STORAGE_KEY = "redirectRules";
const ENABLED_KEY = "globalEnabled";
const ALLOWLIST_KEY = "allowlistRules";
const PAUSE_RULE_ID = 1_000_000;

// ── In-memory cache for webNavigation fallback (synchronous access) ──

let _cachedRules = [];
let _cachedEnabled = true;
let _cachedAllowlist = [];

// Prime cache as soon as the worker starts so toolbar clicks have current state.
const _cacheReady = chrome.storage.local
  .get([STORAGE_KEY, ENABLED_KEY, ALLOWLIST_KEY])
  .then((data) => {
    _cachedRules = data[STORAGE_KEY] || [];
    _cachedEnabled = data[ENABLED_KEY] ?? true;
    _cachedAllowlist = data[ALLOWLIST_KEY] || [];
    setIcon(_cachedEnabled);
  })
  .catch((e) => {
    console.error("Failed to prime cache:", e);
  });

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

let _syncRulesPromise = Promise.resolve();

function enqueueRuleSync(task) {
  // Prevent overlapping updateDynamicRules calls (can throw duplicate id errors).
  _syncRulesPromise = _syncRulesPromise.catch(() => {}).then(task);
  return _syncRulesPromise;
}

function syncRules() {
  return enqueueRuleSync(syncRulesNow);
}

async function syncRulesNow() {
  await _cacheReady;
  const {
    [STORAGE_KEY]: rules = [],
    [ALLOWLIST_KEY]: allowlist = [],
  } = await chrome.storage.local.get([STORAGE_KEY, ALLOWLIST_KEY]);
  const globalEnabled = _cachedEnabled;

  // Update in-memory cache for the webNavigation fallback
  _cachedRules = rules;
  _cachedAllowlist = allowlist;

  // Remove all existing dynamic rules first
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeIds = existingRules.map((r) => r.id);

  // Build base rules from current options state.
  const addRules = [];
  let ruleId = 1;

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

  // Global pause is a single high-priority allow rule.
  if (!globalEnabled) {
    addRules.push({
      id: PAUSE_RULE_ID,
      priority: 10_000,
      action: { type: "allow" },
      condition: {
        resourceTypes: ["main_frame"],
        regexFilter: "^https?://.*",
      },
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
  await _cacheReady;
  const next = !_cachedEnabled;

  // Optimistic update for instant UI and immediate fallback behavior.
  _cachedEnabled = next;
  setIcon(next);

  await chrome.storage.local.set({ [ENABLED_KEY]: next });
  syncRules();
});

// ── Re-sync whenever storage changes (options page edits) ──

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_KEY] || changes[ALLOWLIST_KEY]) {
    syncRules();
  }
  if (changes[ENABLED_KEY]) {
    const enabled = changes[ENABLED_KEY].newValue ?? true;
    // Skip self-triggered changes from the toggle click handler.
    if (enabled !== _cachedEnabled) {
      _cachedEnabled = enabled;
      setIcon(enabled);
      syncRules();
    }
  }
});

// ── Init on install / startup ──

let _initDone = false;

async function init() {
  if (_initDone) return;
  _initDone = true;
  await _cacheReady;
  setIcon(_cachedEnabled);
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

  // Use in-memory state for deterministic toggles.
  // Cache is hydrated on worker start and kept in sync via storage.onChanged.
  await _cacheReady;
  const rules = _cachedRules;
  const globalEnabled = _cachedEnabled;
  const allowlist = _cachedAllowlist;

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
