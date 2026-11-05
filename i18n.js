// UI strings. chrome.i18n can't switch language at runtime, so the extension
// keeps its own dictionaries; _locales/ only holds the manifest strings.

const MESSAGES = {
  en: {
    // common
    unknown: 'Unknown',
    torNetwork: 'Tor network',
    noCountries: 'no country',
    onlyFrom: 'Only from: {0}',
    blockedFrom: 'Blocked from: {0}',
    justNow: 'just now',
    secondsAgo: '{0} s ago',
    minutesAgo: '{0} min ago',
    hoursAgo: '{0} h ago',
    unknownCountry: 'Unknown country',
    noConnection: 'No connection',
    checkNow: 'Check now',
    checking: 'Checking…',
    checkedAgo: 'Checked {0}',
    notChecked: 'Not checked yet',
    checkFailed: "Couldn't check: {0}",
    ipLabel: 'IP {0}',

    // background
    errTimeout: 'timed out',
    errInvalidCountry: 'invalid country',
    errOffline: 'no connection',
    badgeBlocked: 'Blocked: {0}',
    badgeNoBlocks: 'Nothing blocked',
    notifyWhere: 'Your IP is now from {0} ({1}).',
    notifyUnknown: "Couldn't determine your IP's country.",
    notifyBlockedTitle: 'Sites blocked',
    notifyUnblockedTitle: 'Sites unblocked',
    notifyBlockedMsg: '{0} Blocked: {1}.',
    notifyUnblockedMsg: '{0} All your protected sites are available.',

    // gate
    gateChecking: 'Checking your IP…',
    gateYourIp: 'Your IP',
    gateCountry: 'Detected country',
    gateChecked: 'Checked',
    gateHint: 'This page will open on its own as soon as your IP meets the rule (for example, when you turn off or switch your VPN).',
    gateBlocked: 'Access blocked',
    gateDocTitle: 'Blocked · {0}',
    gateReasonCountry: "Your current IP is from {0} and this site has a rule that doesn't allow it.",
    gateReasonUnknown: "Couldn't determine your IP's country, so the site stays blocked for safety.",
    gateReasonOffline: "There's no connection, so the site stays blocked for safety.",
    retry: 'Check again',
    back: 'Go back',
    configureRules: 'Configure rules',
    error: 'Error',
    invalidAddress: 'Invalid address',
    noResponse: 'No response from the extension',

    // popup
    rulesButton: '⚙ Rules',
    settingsTitle: 'Settings',
    popupNoRules: 'No rules yet. Use “⚙ Rules” to add sites.',
    blocked: 'Blocked',
    allowed: 'Allowed',

    // options
    optionsTitle: 'IP Please · Settings',
    tagline: "Blocks sites when your public IP isn't from the country you choose.",
    saved: 'Saved ✓',
    general: 'General',
    language: 'Language',
    langAuto: 'Automatic (browser language)',
    interval: 'Check the IP every',
    sec30: '30 seconds',
    min1: '1 minute',
    min2: '2 minutes',
    min5: '5 minutes',
    min10: '10 minutes',
    min30: '30 minutes',
    strictLabel: 'Check the IP on every visit (recommended)',
    strictHelp: 'Before a protected site opens in a tab, your IP is checked at that moment. This keeps a VPN you just turned on from slipping in between two checks.',
    failClosedLabel: "Block if the country can't be determined",
    failClosedHelp: 'If there is no connection or the geolocation services fail, protected sites stay blocked.',
    notifyLabel: 'Notify me when sites are blocked or unblocked',
    rules: 'Rules',
    addRule: '+ Add rule…',
    blankRule: 'Blank rule',
    noRules: 'No rules yet. Add one with the “+ Add rule…” menu.',
    ruleName: 'Name (e.g. Facebook)',
    enabled: 'Enabled',
    delete: 'Delete',
    domains: 'Domains',
    domainsHint: '(one per line, includes subdomains)',
    condition: 'Condition',
    modeAllow: 'Allow only if my IP is from…',
    modeBlock: 'Block if my IP is from…',
    countryPlaceholder: 'Type a country…',
    add: 'Add',
    addCurrent: '+ My current country ({0})',
    remove: 'Remove',
    countryNotRecognized: 'Country not recognized',
    warnInvalidDomains: 'Ignored invalid domains: {0}.',
    warnNoDomains: 'Add at least one domain.',
    warnNoCountries: 'No allowed countries: these domains will always be blocked.',
    confirmDelete: 'Delete the rule “{0}”?',
    untitled: 'untitled',
  },

  es: {
    unknown: 'Desconocido',
    torNetwork: 'Red Tor',
    noCountries: 'ningún país',
    onlyFrom: 'Solo desde: {0}',
    blockedFrom: 'Bloqueado desde: {0}',
    justNow: 'justo ahora',
    secondsAgo: 'hace {0} s',
    minutesAgo: 'hace {0} min',
    hoursAgo: 'hace {0} h',
    unknownCountry: 'País desconocido',
    noConnection: 'Sin conexión',
    checkNow: 'Verificar ahora',
    checking: 'Verificando…',
    checkedAgo: 'Verificado {0}',
    notChecked: 'Aún no verificado',
    checkFailed: 'No se pudo verificar: {0}',
    ipLabel: 'IP {0}',

    errTimeout: 'tiempo agotado',
    errInvalidCountry: 'país no válido',
    errOffline: 'sin conexión',
    badgeBlocked: 'Bloqueado: {0}',
    badgeNoBlocks: 'Sin bloqueos',
    notifyWhere: 'Tu IP ahora es de {0} ({1}).',
    notifyUnknown: 'No se pudo determinar el país de tu IP.',
    notifyBlockedTitle: 'Sitios bloqueados',
    notifyUnblockedTitle: 'Sitios desbloqueados',
    notifyBlockedMsg: '{0} Bloqueado: {1}.',
    notifyUnblockedMsg: '{0} Todos tus sitios protegidos están disponibles.',

    gateChecking: 'Verificando tu IP…',
    gateYourIp: 'Tu IP',
    gateCountry: 'País detectado',
    gateChecked: 'Verificado',
    gateHint: 'La página se abrirá sola en cuanto tu IP cumpla la regla (por ejemplo, al desactivar o cambiar tu VPN).',
    gateBlocked: 'Acceso bloqueado',
    gateDocTitle: 'Bloqueado · {0}',
    gateReasonCountry: 'Tu IP actual es de {0} y este sitio tiene una regla que no lo permite.',
    gateReasonUnknown: 'No se pudo determinar el país de tu IP, así que el sitio se mantiene bloqueado por seguridad.',
    gateReasonOffline: 'No hay conexión, así que el sitio se mantiene bloqueado por seguridad.',
    retry: 'Verificar de nuevo',
    back: 'Volver',
    configureRules: 'Configurar reglas',
    error: 'Error',
    invalidAddress: 'Dirección no válida',
    noResponse: 'Sin respuesta de la extensión',

    rulesButton: '⚙ Reglas',
    settingsTitle: 'Configuración',
    popupNoRules: 'Aún no tienes reglas. Usa “⚙ Reglas” para agregar sitios.',
    blocked: 'Bloqueado',
    allowed: 'Permitido',

    optionsTitle: 'IP Please · Configuración',
    tagline: 'Bloquea sitios cuando tu IP pública no es del país que tú decides.',
    saved: 'Guardado ✓',
    general: 'General',
    language: 'Idioma',
    langAuto: 'Automático (idioma del navegador)',
    interval: 'Revisar la IP cada',
    sec30: '30 segundos',
    min1: '1 minuto',
    min2: '2 minutos',
    min5: '5 minutos',
    min10: '10 minutos',
    min30: '30 minutos',
    strictLabel: 'Verificar la IP en cada visita (recomendado)',
    strictHelp: 'Antes de abrir un sitio protegido en una pestaña, se comprueba tu IP en ese momento. Evita que una VPN recién activada se cuele entre dos revisiones.',
    failClosedLabel: 'Bloquear si no se puede determinar el país',
    failClosedHelp: 'Si no hay conexión o los servicios de geolocalización fallan, los sitios protegidos quedan bloqueados.',
    notifyLabel: 'Notificarme cuando se bloqueen o desbloqueen sitios',
    rules: 'Reglas',
    addRule: '+ Agregar regla…',
    blankRule: 'Regla vacía',
    noRules: 'Sin reglas todavía. Agrega una con el menú “+ Agregar regla…”.',
    ruleName: 'Nombre (ej. Facebook)',
    enabled: 'Activa',
    delete: 'Eliminar',
    domains: 'Dominios',
    domainsHint: '(uno por línea, incluye subdominios)',
    condition: 'Condición',
    modeAllow: 'Permitir solo si mi IP es de…',
    modeBlock: 'Bloquear si mi IP es de…',
    countryPlaceholder: 'Escribe un país…',
    add: 'Agregar',
    addCurrent: '+ Mi país actual ({0})',
    remove: 'Quitar',
    countryNotRecognized: 'País no reconocido',
    warnInvalidDomains: 'Dominios ignorados por no ser válidos: {0}.',
    warnNoDomains: 'Agrega al menos un dominio.',
    warnNoCountries: 'Sin países permitidos: estos dominios quedarán siempre bloqueados.',
    confirmDelete: '¿Eliminar la regla “{0}”?',
    untitled: 'sin nombre',
  },
};

export const LANGUAGES = ['en', 'es'];

let current = 'en';

// 'auto' follows the browser UI language; anything other than Spanish is English.
export function resolveLang(pref) {
  if (LANGUAGES.includes(pref)) return pref;
  const ui = globalThis.chrome?.i18n?.getUILanguage?.() || globalThis.navigator?.language || 'en';
  return ui.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function setLang(pref) {
  current = resolveLang(pref);
  if (typeof document !== 'undefined') document.documentElement.lang = current;
  return current;
}

export function getLang() {
  return current;
}

export function t(key, ...args) {
  const text = MESSAGES[current][key] ?? MESSAGES.en[key] ?? key;
  return text.replace(/\{(\d)\}/g, (_, i) => args[i] ?? '');
}

// Fills elements marked with data-i18n / data-i18n-placeholder / data-i18n-title.
export function localize(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
