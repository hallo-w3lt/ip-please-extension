// Shared helpers used by the service worker and the extension pages.

import { getLang, t } from './i18n.js';

export const DEFAULT_SETTINGS = Object.freeze({
  lang: 'auto',      // 'auto' | 'en' | 'es'
  intervalSec: 60,
  strict: true,      // verify the IP right before opening a protected site
  failClosed: true,  // block protected sites when the country is unknown
  notify: true,
  rules: [],         // { id, name, enabled, domains[], mode: 'allow'|'block', countries[] }
});

export const DEFAULT_STATE = Object.freeze({
  ip: null,
  country: null,
  provider: null,
  checkedAt: 0,
  resolvedAt: 0,    // when `country` was last resolved for `ip`
  error: null,
  offline: false,   // the check failed because there is no connection
});

export async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export function saveSettings(settings) {
  return chrome.storage.local.set({ settings });
}

export async function getState() {
  const { state } = await chrome.storage.local.get('state');
  return { ...DEFAULT_STATE, ...state };
}

// "https://www.Facebook.com/home" -> "facebook.com". Returns '' if invalid.
export function normalizeDomain(input) {
  const d = String(input).trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^\*\./, '')
    .split(/[/?#:]/)[0]
    .replace(/^www\./, '')
    .replace(/\.$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}

// A domain covers itself and all of its subdomains.
export function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

export function isRuleBlocked(rule, state, settings) {
  if (!rule.enabled || !rule.domains.length) return false;
  if (!state.country) return settings.failClosed;
  const listed = rule.countries.includes(state.country);
  return rule.mode === 'block' ? listed : !listed;
}

// Toolbar badge: the country, or why there isn't one.
// '?' = not checked yet, 'NoN' = no connection, 'Err' = the check failed.
export function badgeText(state) {
  if (state.country) return state.country;
  if (state.offline) return 'NoN';
  return state.error ? 'Err' : '?';
}

// What to show where the country would go when there isn't one.
export function noCountryLabel(state) {
  return t(state.offline ? 'noConnection' : 'unknownCountry');
}

const regionNames = {};

export function countryName(code) {
  if (!code) return t('unknown');
  if (code === 'T1') return t('torNetwork');
  const lang = getLang();
  try {
    regionNames[lang] ??= new Intl.DisplayNames([lang], { type: 'region' });
    return regionNames[lang].of(code);
  } catch {
    return code;
  }
}

export function describeRule(rule) {
  const names = rule.countries.map(countryName).join(', ') || t('noCountries');
  return t(rule.mode === 'block' ? 'blockedFrom' : 'onlyFrom', names);
}

export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return t('justNow');
  if (s < 60) return t('secondsAgo', s);
  const m = Math.round(s / 60);
  if (m < 60) return t('minutesAgo', m);
  return t('hoursAgo', Math.round(m / 60));
}

// ISO 3166-1 alpha-2 (+ XK, Kosovo, which some geo providers return).
export const COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS
BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE
EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM
HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC
LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA
NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO
TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`.trim().split(/\s+/);

export const PRESETS = [
  { name: 'Facebook', domains: ['facebook.com', 'facebook.net', 'fbcdn.net', 'fb.com', 'fbsbx.com', 'messenger.com'] },
  { name: 'Instagram', domains: ['instagram.com', 'cdninstagram.com'] },
  { name: 'WhatsApp Web', domains: ['whatsapp.com', 'whatsapp.net'] },
  { name: 'X (Twitter)', domains: ['x.com', 'twitter.com', 'twimg.com'] },
  { name: 'TikTok', domains: ['tiktok.com', 'tiktokv.com', 'tiktokcdn.com'] },
  { name: 'PayPal', domains: ['paypal.com', 'paypalobjects.com'] },
  { name: 'Claude (Anthropic)', domains: ['claude.ai', 'claude.com', 'anthropic.com', 'claudeusercontent.com'] },
  { name: 'ChatGPT (OpenAI)', domains: ['chatgpt.com', 'openai.com', 'oaistatic.com', 'oaiusercontent.com'] },
  { name: 'Grok (xAI)', domains: ['grok.com', 'x.ai'] },
  { name: 'Upwork', domains: ['upwork.com'] },
  { name: 'Fiverr', domains: ['fiverr.com', 'fiverrcdn.com'] },
  { name: 'Binance', domains: ['binance.com', 'bnbstatic.com'] },
  {
    name: 'Amazon Seller Central',
    domains: [
      'sellercentral.amazon.com', 'sellercentral-europe.amazon.com', 'sellercentral-japan.amazon.com',
      'sellercentral.amazon.com.mx', 'sellercentral.amazon.ca', 'sellercentral.amazon.com.br',
    ],
  },
  { name: 'Steam', domains: ['steampowered.com', 'steamcommunity.com', 'steamstatic.com'] },
  { name: 'itch.io', domains: ['itch.io', 'itch.zone'] },
];
