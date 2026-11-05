import {
  getSettings, getState, isRuleBlocked, countryName, describeRule, timeAgo, noCountryLabel,
} from './common.js';
import { localize, setLang, t } from './i18n.js';

const $ = (id) => document.getElementById(id);

let checking = false;

async function render() {
  const [settings, state] = await Promise.all([getSettings(), getState()]);
  setLang(settings.lang);
  localize();
  if (checking) $('check').textContent = t('checking');

  $('country').textContent = state.country
    ? `${countryName(state.country)} (${state.country})`
    : noCountryLabel(state);
  $('ip').textContent = state.ip ? t('ipLabel', state.ip) : '';
  $('checked').textContent = state.checkedAt
    ? `${t('checkedAgo', timeAgo(state.checkedAt))}${state.provider ? ` · ${state.provider}` : ''}`
    : t('notChecked');
  $('error').hidden = !state.error;
  $('error').textContent = state.error ? t('checkFailed', state.error) : '';

  const rules = settings.rules.filter((r) => r.enabled && r.domains.length);
  const list = $('rules');
  if (!rules.length) {
    const p = document.createElement('p');
    p.className = 'muted small center';
    p.textContent = t('popupNoRules');
    list.replaceChildren(p);
    return;
  }
  list.replaceChildren(...rules.map((rule) => {
    const blocked = isRuleBlocked(rule, state, settings);
    const el = document.createElement('div');
    el.className = 'card rule-status';
    el.innerHTML = '<div><div class="name"></div><div class="muted small desc"></div></div><span class="pill"></span>';
    el.querySelector('.name').textContent = rule.name || rule.domains[0];
    el.querySelector('.desc').textContent = describeRule(rule);
    const pill = el.querySelector('.pill');
    pill.classList.add(blocked ? 'bad' : 'ok');
    pill.textContent = t(blocked ? 'blocked' : 'allowed');
    return el;
  }));
}

$('opts').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('check').addEventListener('click', async () => {
  const btn = $('check');
  btn.disabled = true;
  checking = true;
  btn.textContent = t('checking');
  try {
    await chrome.runtime.sendMessage({ type: 'check' });
  } finally {
    btn.disabled = false;
    checking = false;
    btn.textContent = t('checkNow');
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') render();
});

setInterval(render, 5000);
render();
