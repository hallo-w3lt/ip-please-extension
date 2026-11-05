import { countryName, describeRule, getSettings, noCountryLabel, timeAgo } from './common.js';
import { localize, setLang, t } from './i18n.js';

const $ = (id) => document.getElementById(id);

function httpUrl(href) {
  try {
    const url = new URL(href);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url : null;
  } catch {
    return null;
  }
}

// The hash only says which site was requested; the service worker decides
// whether, and where, to navigate.
const target = location.hash.slice(1);
const host = httpUrl(target)?.hostname ?? '';

let busy = false;
let again = false;
let lastState = null;

function setChecking() {
  $('card').classList.remove('blocked');
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  $('title').replaceChildren(spinner, ` ${t('gateChecking')}`);
}

function render(res) {
  if (res.error) {
    $('title').textContent = t('error');
    $('reason').textContent = res.error;
    $('details').hidden = false;
    return;
  }
  const { state } = res;
  lastState = state;
  document.title = t('gateDocTitle', host);
  $('card').classList.add('blocked');
  $('tick').style.display = 'none';
  $('title').textContent = t('gateBlocked');
  $('reason').textContent = state.country
    ? t('gateReasonCountry', countryName(state.country))
    : t(state.offline ? 'gateReasonOffline' : 'gateReasonUnknown');
  $('ip').textContent = state.ip || '—';
  $('country').textContent = state.country ? `${countryName(state.country)} (${state.country})` : noCountryLabel(state);
  $('checked').textContent = state.checkedAt ? timeAgo(state.checkedAt) : '—';

  $('reqs').replaceChildren(...res.blocked.map((rule) => {
    const li = document.createElement('li');
    const b = document.createElement('strong');
    b.textContent = `${rule.name || rule.domains[0]}: `;
    li.append(b, describeRule(rule));
    return li;
  }));
  $('details').hidden = false;
}

function showInvalid() {
  $('card').classList.remove('blocked');
  $('details').hidden = true;
  $('title').textContent = t('invalidAddress');
}

async function attempt() {
  if (!host) {
    showInvalid();
    return;
  }
  if (busy) {
    again = true;
    return;
  }
  busy = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'authorize', url: target });
    if (res?.allowed) {
      const dest = httpUrl(res.url);
      if (dest) location.replace(dest.href);
      else showInvalid();
      return;
    }
    if (!res || res.error) render(res || { error: t('noResponse') });
    else if (res.blocked) render(res);
    else showInvalid();
  } catch (e) {
    render({ error: e.message });
  } finally {
    busy = false;
    if (again) {
      again = false;
      attempt();
    }
  }
}

setLang((await getSettings()).lang);
localize();
$('host').textContent = host || target;

$('retry').addEventListener('click', async () => {
  $('retry').disabled = true;
  setChecking();
  try {
    await chrome.runtime.sendMessage({ type: 'check' });
  } finally {
    $('retry').disabled = false;
    attempt();
  }
});

$('back').addEventListener('click', async () => {
  if (history.length > 1) {
    history.back();
  } else {
    const tab = await chrome.tabs.getCurrent();
    chrome.tabs.remove(tab.id);
  }
});

$('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(changes.state || changes.settings)) return;
  if (changes.settings) {
    setLang(changes.settings.newValue?.lang);
    localize();
  }
  attempt();
});

setInterval(() => {
  if (lastState?.checkedAt) $('checked').textContent = timeAgo(lastState.checkedAt);
}, 5000);

attempt();
