import {
  DEFAULT_STATE, getSettings, getState, isRuleBlocked, hostMatches, countryName,
} from './common.js';
import { setLang, t } from './i18n.js';

const ALARM = 'ip-check';
const GATE_URL = chrome.runtime.getURL('gate.html');
const TIMEOUT_MS = 6000;
const AUTHORIZE_MAX_AGE_MS = 10_000;

// Tried in order until one returns a valid country code.
const PROVIDERS = [
  {
    name: 'Cloudflare',
    url: 'https://www.cloudflare.com/cdn-cgi/trace',
    async parse(res) {
      const fields = Object.fromEntries(
        (await res.text()).trim().split('\n').map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i), line.slice(i + 1)];
        }),
      );
      return { ip: fields.ip, country: fields.loc };
    },
  },
  {
    name: 'country.is',
    url: 'https://api.country.is/',
    async parse(res) {
      const j = await res.json();
      return { ip: j.ip, country: j.country };
    },
  },
  {
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    async parse(res) {
      const j = await res.json();
      return { ip: j.ip, country: j.country };
    },
  },
  {
    name: 'ipwho.is',
    url: 'https://ipwho.is/',
    async parse(res) {
      const j = await res.json();
      if (j.success === false) throw new Error(j.message || 'error');
      return { ip: j.ip, country: j.country_code };
    },
  },
];

async function fetchWithTimeout(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function lookup() {
  const errors = [];
  for (const provider of PROVIDERS) {
    try {
      const { ip, country } = await provider.parse(await fetchWithTimeout(provider.url));
      const code = String(country || '').toUpperCase();
      if (!/^[A-Z][A-Z0-9]$/.test(code) || code === 'XX') throw new Error(t('errInvalidCountry'));
      return { ip: ip || null, country: code, provider: provider.name };
    } catch (e) {
      errors.push(`${provider.name}: ${e.name === 'AbortError' ? t('errTimeout') : e.message}`);
    }
  }
  throw new Error(errors.join(' · '));
}

// ---------------------------------------------------------------------------
// IP check

let inflight = null;

function checkIp({ maxAgeMs = 0 } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    const prev = await getState();
    if (maxAgeMs && Date.now() - prev.checkedAt < maxAgeMs) return prev;
    setLang((await getSettings()).lang);

    let next;
    try {
      next = { ...(await lookup()), checkedAt: Date.now(), error: null };
    } catch (e) {
      next = { ...DEFAULT_STATE, checkedAt: Date.now(), error: e.message };
    }
    next.blockedKey = await sync(next, prev.blockedKey);
    await chrome.storage.local.set({ state: next });
    return next;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

// ---------------------------------------------------------------------------
// Applying rules

// Updates network rules, badge and open tabs for the given state.
// Returns a key identifying the set of blocked rules.
async function sync(state, prevBlockedKey) {
  const settings = await getSettings();
  setLang(settings.lang);
  const active = settings.rules.filter((r) => r.enabled && r.domains.length);
  const blocked = active.filter((r) => isRuleBlocked(r, state, settings));
  const gated = settings.strict ? active.filter((r) => !blocked.includes(r)) : [];

  await updateNetRules(blocked, gated);
  await revokeTabAllows(blocked);
  await kickOpenTabs(blocked);
  updateBadge(state, blocked);

  const key = blocked.map((r) => r.id).sort().join(',');
  if (settings.notify && prevBlockedKey !== undefined && key !== prevBlockedKey) {
    notify(state, blocked);
  }
  return key;
}

// Blocked rules: main frame -> gate page, every other request -> blocked.
// Gated rules (strict mode, currently allowed): main frame -> gate page, which
// re-checks the IP and grants a per-tab allow rule.
async function updateNetRules(blocked, gated) {
  const addRules = [];
  let id = 1;
  for (const rule of [...blocked, ...gated]) {
    addRules.push({
      id: id++,
      priority: 1,
      action: { type: 'redirect', redirect: { regexSubstitution: `${GATE_URL}#\\0` } },
      condition: { regexFilter: '^.+$', requestDomains: rule.domains, resourceTypes: ['main_frame'] },
    });
  }
  for (const rule of blocked) {
    // No resourceTypes = every type except main_frame.
    addRules.push({ id: id++, priority: 1, action: { type: 'block' }, condition: { requestDomains: rule.domains } });
  }
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: old.map((r) => r.id), addRules });
}

async function revokeTabAllows(blocked, { all = false } = {}) {
  const domains = blocked.flatMap((r) => r.domains);
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const stale = all
    ? rules
    : rules.filter((r) => r.condition.requestDomains?.some((d) => domains.includes(d)));
  if (stale.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: stale.map((r) => r.id) });
  }
}

// Sends tabs that are already open on a blocked site to the gate page.
async function kickOpenTabs(blocked) {
  if (!blocked.length) return;
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    let host;
    try {
      host = new URL(tab.url).hostname;
    } catch {
      continue;
    }
    if (blocked.some((r) => r.domains.some((d) => hostMatches(host, d)))) {
      chrome.tabs.update(tab.id, { url: `${GATE_URL}#${tab.url}` });
    }
  }
}

async function allowTab(tabId, domains) {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const mine = rules.filter((r) => r.condition.tabIds?.includes(tabId));
  const merged = [...new Set([...mine.flatMap((r) => r.condition.requestDomains || []), ...domains])];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: mine.map((r) => r.id),
    addRules: [{
      id: Math.max(0, ...rules.map((r) => r.id)) + 1,
      priority: 2,
      action: { type: 'allow' },
      condition: { requestDomains: merged, tabIds: [tabId], resourceTypes: ['main_frame'] },
    }],
  });
}

function updateBadge(state, blocked) {
  const color = !state.country ? '#6b7280' : blocked.length ? '#dc2626' : '#16a34a';
  chrome.action.setBadgeText({ text: state.country || '?' });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  const names = blocked.map((r) => r.name || r.domains[0]).join(', ');
  const where = state.country ? `${countryName(state.country)} · ${state.ip}` : t('unknownCountry');
  const what = blocked.length ? t('badgeBlocked', names) : t('badgeNoBlocks');
  chrome.action.setTitle({ title: `IP Please\n${where}\n${what}` });
}

function notify(state, blocked) {
  const names = blocked.map((r) => r.name || r.domains[0]).join(', ');
  const where = state.country
    ? t('notifyWhere', countryName(state.country), state.country)
    : t('notifyUnknown');
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: t(blocked.length ? 'notifyBlockedTitle' : 'notifyUnblockedTitle'),
    message: blocked.length ? t('notifyBlockedMsg', where, names) : t('notifyUnblockedMsg', where),
  });
}

// ---------------------------------------------------------------------------
// Gate page

// gate.html is web-accessible, so any site can embed it. Only the gate page
// loaded in a tab's top frame may grant that tab an allow rule.
function isTopFrameGate(sender) {
  return sender.id === chrome.runtime.id
    && sender.frameId === 0
    && String(sender.url).startsWith(GATE_URL)
    && String(sender.tab?.url).startsWith(GATE_URL);
}

async function authorize(url, sender) {
  if (!isTopFrameGate(sender)) return { allowed: false };

  let target;
  try {
    target = new URL(url);
  } catch {
    return { allowed: false, invalid: true };
  }
  if ((target.protocol !== 'http:' && target.protocol !== 'https:') || !target.hostname) {
    return { allowed: false, invalid: true };
  }
  const host = target.hostname;
  const settings = await getSettings();
  const matching = settings.rules.filter((r) => r.enabled && r.domains.some((d) => hostMatches(host, d)));
  // The gate only ever sends the user on to a protected site, never elsewhere.
  if (!matching.length) return { allowed: false, invalid: true };

  const state = await checkIp({ maxAgeMs: AUTHORIZE_MAX_AGE_MS });
  const blocked = matching.filter((r) => isRuleBlocked(r, state, settings));

  if (blocked.length) {
    return {
      allowed: false,
      host,
      state,
      failClosed: settings.failClosed,
      blocked: blocked.map(({ name, domains, mode, countries }) => ({ name, domains, mode, countries })),
    };
  }
  if (settings.strict && sender.tab.id != null) {
    await allowTab(sender.tab.id, [...new Set(matching.flatMap((r) => r.domains))]);
  }
  return { allowed: true, url: target.href };
}

// ---------------------------------------------------------------------------
// Lifecycle

async function ensureAlarm() {
  const { intervalSec } = await getSettings();
  const period = Math.max(30, intervalSec) / 60;
  const alarm = await chrome.alarms.get(ALARM);
  if (!alarm || alarm.periodInMinutes !== period) {
    await chrome.alarms.create(ALARM, { periodInMinutes: period, delayInMinutes: period });
  }
}

async function init() {
  await ensureAlarm();
  await sync(await getState());
  await checkIp();
}

chrome.runtime.onInstalled.addListener(init);

chrome.runtime.onStartup.addListener(async () => {
  // The last known country may be stale (VPN could have changed while closed).
  await chrome.storage.local.set({ state: { ...DEFAULT_STATE } });
  await init();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) checkIp();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  await ensureAlarm();
  await revokeTabAllows([], { all: true });
  const state = await getState();
  state.blockedKey = await sync(state);
  await chrome.storage.local.set({ state });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    check: () => checkIp(),
    authorize: () => authorize(msg.url, sender),
  };
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler().then(sendResponse, (e) => sendResponse({ error: e.message }));
  return true;
});

// A tab's allowance ends when it leaves the protected site or is closed.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url || info.url.startsWith(GATE_URL)) return;
  let host;
  try {
    host = new URL(info.url).hostname;
  } catch {
    return;
  }
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const stale = rules.filter((r) => r.condition.tabIds?.includes(tabId)
    && !r.condition.requestDomains.some((d) => hostMatches(host, d)));
  if (stale.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: stale.map((r) => r.id) });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const rules = await chrome.declarativeNetRequest.getSessionRules();
  const mine = rules.filter((r) => r.condition.tabIds?.includes(tabId));
  if (mine.length) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: mine.map((r) => r.id) });
  }
});
