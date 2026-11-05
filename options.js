import {
  getSettings, saveSettings, getState, countryName, normalizeDomain, timeAgo, noCountryLabel, COUNTRY_CODES, PRESETS,
} from './common.js';
import { localize, setLang, t } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);

let settings;
let state;
let saveTimer;
let countries = [];

const fold = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function parseCountry(input) {
  const text = input.trim();
  const m = text.match(/\(([A-Za-z]{2})\)$/);
  const code = (m ? m[1] : text).toUpperCase();
  if (COUNTRY_CODES.includes(code)) return code;
  return countries.find((c) => fold(c.name) === fold(text))?.code ?? null;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await saveSettings(settings);
    const el = $('#saved');
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1200);
  }, 300);
}

// ---------------------------------------------------------------------------
// Language

function renderCountryList() {
  countries = COUNTRY_CODES
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, document.documentElement.lang));
  $('#countries').replaceChildren(...countries.map((c) => {
    const o = document.createElement('option');
    o.value = `${c.name} (${c.code})`;
    return o;
  }));
}

function applyLanguage() {
  setLang(settings.lang);
  localize();
  document.title = t('optionsTitle');
  renderCountryList();
}

// ---------------------------------------------------------------------------
// Current status

function renderStatus() {
  $('#cur-country').textContent = state.country
    ? `${countryName(state.country)} (${state.country})`
    : noCountryLabel(state);
  $('#cur-ip').textContent = state.ip ? `· ${t('ipLabel', state.ip)}` : '';
  $('#cur-checked').textContent = state.checkedAt
    ? `${t('checkedAgo', timeAgo(state.checkedAt))}${state.provider ? ` · ${state.provider}` : ''}`
    : t('notChecked');
  $('#cur-error').hidden = !state.error;
  $('#cur-error').textContent = state.error ? t('checkFailed', state.error) : '';

  for (const btn of document.querySelectorAll('.add-current')) {
    btn.hidden = !state.country;
    btn.textContent = t('addCurrent', state.country);
  }
}

// ---------------------------------------------------------------------------
// Rules

function renderRules() {
  const list = $('#rules');
  if (!settings.rules.length) {
    const empty = document.createElement('div');
    empty.className = 'empty muted';
    empty.textContent = t('noRules');
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...settings.rules.map(ruleCard));
  renderStatus();
}

function ruleCard(rule) {
  const el = $('#rule-tpl').content.firstElementChild.cloneNode(true);
  localize(el);
  const name = $('.name', el);
  const enabled = $('.enabled', el);
  const domains = $('.domains', el);
  const mode = $('.mode', el);
  const chips = $('.chips', el);
  const input = $('.country-input', el);
  const warn = $('.warn', el);
  let invalid = [];

  name.value = rule.name;
  enabled.checked = rule.enabled;
  domains.value = rule.domains.join('\n');
  mode.value = rule.mode;
  el.classList.toggle('disabled', !rule.enabled);

  const showWarnings = () => {
    const msgs = [];
    if (invalid.length) msgs.push(t('warnInvalidDomains', invalid.join(', ')));
    if (!rule.domains.length) msgs.push(t('warnNoDomains'));
    if (rule.mode === 'allow' && !rule.countries.length) msgs.push(t('warnNoCountries'));
    warn.hidden = !msgs.length;
    warn.textContent = msgs.join(' ');
  };

  const renderChips = () => {
    chips.replaceChildren(...rule.countries.map((code) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${countryName(code)} (${code})`;
      const x = document.createElement('button');
      x.textContent = '×';
      x.title = t('remove');
      x.addEventListener('click', () => {
        rule.countries = rule.countries.filter((c) => c !== code);
        renderChips();
        scheduleSave();
      });
      chip.append(x);
      return chip;
    }));
    showWarnings();
  };

  const addCountry = (code) => {
    if (!code) {
      input.setCustomValidity(t('countryNotRecognized'));
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    input.value = '';
    if (!rule.countries.includes(code)) {
      rule.countries.push(code);
      renderChips();
      scheduleSave();
    }
  };

  name.addEventListener('input', () => {
    rule.name = name.value.trim();
    scheduleSave();
  });
  enabled.addEventListener('change', () => {
    rule.enabled = enabled.checked;
    el.classList.toggle('disabled', !rule.enabled);
    scheduleSave();
  });
  domains.addEventListener('change', () => {
    const good = [];
    invalid = [];
    for (const raw of domains.value.split(/[\s,;]+/).filter(Boolean)) {
      const d = normalizeDomain(raw);
      if (!d) invalid.push(raw);
      else if (!good.includes(d)) good.push(d);
    }
    rule.domains = good;
    domains.value = good.join('\n');
    showWarnings();
    scheduleSave();
  });
  mode.addEventListener('change', () => {
    rule.mode = mode.value;
    showWarnings();
    scheduleSave();
  });
  input.addEventListener('input', () => input.setCustomValidity(''));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCountry(parseCountry(input.value));
  });
  $('.add-country', el).addEventListener('click', () => addCountry(parseCountry(input.value)));
  $('.add-current', el).addEventListener('click', () => addCountry(state.country));
  $('.del', el).addEventListener('click', () => {
    if (!confirm(t('confirmDelete', rule.name || rule.domains[0] || t('untitled')))) return;
    settings.rules = settings.rules.filter((r) => r !== rule);
    renderRules();
    scheduleSave();
  });

  renderChips();
  return el;
}

function addRule(preset) {
  const rule = {
    id: crypto.randomUUID(),
    name: preset?.name ?? '',
    enabled: true,
    domains: preset ? [...preset.domains] : [],
    mode: 'allow',
    countries: state.country && state.country !== 'T1' ? [state.country] : [],
  };
  settings.rules.push(rule);
  renderRules();
  scheduleSave();
  const card = $('#rules').lastElementChild;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  $(preset ? '.country-input' : '.name', card).focus();
}

// ---------------------------------------------------------------------------
// Init

async function init() {
  [settings, state] = await Promise.all([getSettings(), getState()]);
  settings.rules = settings.rules.map((r) => ({ ...r }));
  applyLanguage();

  const lang = $('#lang');
  lang.value = settings.lang;
  lang.addEventListener('change', () => {
    settings.lang = lang.value;
    applyLanguage();
    renderRules();
    renderStatus();
    scheduleSave();
  });

  const add = $('#add');
  add.append(...PRESETS.map((p, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = p.name;
    return o;
  }));
  add.addEventListener('change', () => {
    if (add.value === 'blank') addRule();
    else if (add.value) addRule(PRESETS[Number(add.value)]);
    add.value = '';
  });

  const interval = $('#interval');
  interval.value = String(settings.intervalSec);
  if (!interval.value) interval.value = '60';
  interval.addEventListener('change', () => {
    settings.intervalSec = Number(interval.value);
    scheduleSave();
  });

  for (const key of ['strict', 'failClosed', 'notify']) {
    const box = $(`#${key}`);
    box.checked = settings[key];
    box.addEventListener('change', () => {
      settings[key] = box.checked;
      scheduleSave();
    });
  }

  $('#check').addEventListener('click', async () => {
    const btn = $('#check');
    btn.disabled = true;
    btn.textContent = t('checking');
    try {
      await chrome.runtime.sendMessage({ type: 'check' });
    } finally {
      btn.disabled = false;
      btn.textContent = t('checkNow');
    }
  });

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && changes.state) {
      state = await getState();
      renderStatus();
    }
  });
  setInterval(renderStatus, 5000);

  renderRules();
  renderStatus();
}

init();
