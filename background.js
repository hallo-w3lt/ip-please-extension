import {
  DEFAULT_STATE, getSettings, getState, isRuleBlocked, hostMatches, countryName, badgeText, noCountryLabel,
} from './common.js';
import { setLang, t } from './i18n.js';

const ALARM = 'ip-check';
const GATE_URL = chrome.runtime.getURL('gate.html');
const TIMEOUT_MS = 6000;
const AUTHORIZE_MAX_AGE_MS = 10_000;
// While the IP stays the same its country is kept, but re-resolved this often
// so a corrected geolocation database is picked up.
const REVERIFY_MS = 30 * 60_000;
// How long a changed IP may spend looking for a second provider to agree.
const CONFIRM_MS = 5000;

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

// `offline` marks failures where the provider couldn't be reached at all, as
// opposed to answering with an error or something unusable.
class LookupError extends Error {
  constructor(message, offline = false) {
    super(message);
    this.offline = offline;
  }
}

function failure(e) {
  const timedOut = e.name === 'AbortError';
  return new LookupError(timedOut ? t('errTimeout') : e.message, true);
}

// One request to one provider. The timer also covers reading the body: a body
// that stalls would otherwise leave the check pending forever.
async function query(provider) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res;
    try {
      res = await fetch(provider.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: ctrl.signal });
    } catch (e) {
      throw failure(e);
    }
    if (!res.ok) throw new LookupError(`HTTP ${res.status}`);

    let parsed;
    try {
      parsed = await provider.parse(res);
    } catch (e) {
      throw e.name === 'AbortError' ? failure(e) : new LookupError(e.message);
    }
    const code = String(parsed.country || '').toUpperCase();
    if (!/^[A-Z][A-Z0-9]$/.test(code) || code === 'XX') throw new LookupError(t('errInvalidCountry'));
    return { ip: parsed.ip || null, country: code, provider: provider.name };
  } finally {
    clearTimeout(timer);
  }
}

// First provider that answers, plus the names of the ones that failed before it.
async function lookup() {
  const errors = [];
  const failed = new Set();
  let offline = true;
  for (const provider of PROVIDERS) {
    try {
      return { first: await query(provider), failed };
    } catch (e) {
      offline &&= e.offline === true;
      failed.add(provider.name);
      errors.push(`${provider.name}: ${e.message}`);
    }
  }
  if (offline || navigator.onLine === false) throw new LookupError(t('errOffline'), true);
  throw new LookupError(errors.join(' · '));
}

// The country is a function of the IP, so it only needs resolving when the IP
// changes. When it does, a single provider's (possibly lagging) database isn't
// trusted: other providers that report the same IP vote, and the country two
// of them agree on wins. If nobody agrees, the first provider's answer stands.
async function confirmCountry(first, failed) {
  const votes = new Map([[first.country, 1]]);
  const deadline = Date.now() + CONFIRM_MS;
  for (const provider of PROVIDERS) {
    if (provider.name === first.provider || failed.has(provider.name)) continue;
    if (Date.now() > deadline) break;
    let answer;
    try {
      answer = await query(provider);
    } catch {
      continue;
    }
    // Another IP (e.g. IPv6 vs IPv4, or a network still switching) isn't comparable.
    if (answer.ip !== first.ip) continue;
    const n = (votes.get(answer.country) ?? 0) + 1;
    votes.set(answer.country, n);
    if (n >= 2) return answer.country;
  }
  return first.country;
}

async function resolve(prev, { force }) {
  const { first, failed } = await lookup();
  const unchanged = !force && prev.country && prev.ip && first.ip === prev.ip
    && Date.now() - prev.resolvedAt < REVERIFY_MS;
  if (unchanged) {
    return { ip: first.ip, country: prev.country, provider: first.provider, resolvedAt: prev.resolvedAt };
  }
  return { ...first, country: await confirmCountry(first, failed), resolvedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// IP check

let inflight = null;

// Applying rules and saving the state must not interleave: two overlapping
// updateDynamicRules calls fail on duplicate ids, and a slow writer would
// overwrite the result of a newer check.
let queue = Promise.resolve();

function serialize(fn) {
  const run = queue.then(fn);
  queue = run.catch(() => {});
  return run;
}

// `force` re-resolves the country even if the IP hasn't changed.
function checkIp({ maxAgeMs = 0, force = false } = {}) {
  if (inflight) return inflight;
  inflight = (async () => {
    const prev = await getState();
    if (maxAgeMs && Date.now() - prev.checkedAt < maxAgeMs) return prev;
    setLang((await getSettings()).lang);

    let next;
    try {
      next = { ...DEFAULT_STATE, ...(await resolve(prev, { force })), checkedAt: Date.now() };
    } catch (e) {
      next = { ...DEFAULT_STATE, checkedAt: Date.now(), error: e.message, offline: e.offline === true };
    }
    return serialize(async () => {
      const { blockedKey } = await getState();
      try {
        next.blockedKey = await sync(next, blockedKey);
      } catch (e) {
        // Whatever went wrong applying the rules, the new state must still be saved.
        console.error('IP Please: could not apply the rules', e);
        next.blockedKey = blockedKey;
      }
      await chrome.storage.local.set({ state: next });
      return next;
    });
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
  chrome.action.setBadgeText({ text: badgeText(state) });
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  const names = blocked.map((r) => r.name || r.domains[0]).join(', ');
  const where = state.country ? `${countryName(state.country)} · ${state.ip}` : noCountryLabel(state);
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
  await serialize(async () => sync(await getState()));
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
  await serialize(async () => {
    const state = await getState();
    state.blockedKey = await sync(state);
    await chrome.storage.local.set({ state });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handlers = {
    check: () => checkIp({ force: true }),
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
