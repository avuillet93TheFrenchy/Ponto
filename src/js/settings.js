import { storeGet, storeSet } from '../tauri/index.js';

export const SETTINGS_STORE = 'settings.json';

/**
 * @typedef {object} HistoryEntry
 * @property {string} [direction] - Legacy field, replaced by `source` / `target`.
 * @property {string} [source]
 * @property {string} [target]
 */

/**
 * @typedef {object} Settings
 * @property {string} deeplKey
 * @property {string} laraId
 * @property {string} laraSecret
 * @property {boolean} autoTranslate
 * @property {'deepl' | 'lara' | 'both'} provider
 * @property {string} sourceLang
 * @property {string} targetLang
 * @property {boolean} formal
 * @property {HistoryEntry[]} history
 * @property {{ source: string[], target: string[] }} recentLangs
 * @property {{ fetchedAt: number, deepl: unknown, lara: unknown }} languageCache
 * @property {Record<string, string>} voices
 * @property {UiLang} uiLang - Interface language (not the translation languages).
 */

/** @type {Settings} */
const DEFAULTS = {
  deeplKey: '',
  laraId: '',
  laraSecret: '',
  autoTranslate: false,
  provider: 'deepl',
  sourceLang: 'en',
  targetLang: 'fr',
  formal: true,
  history: [],
  recentLangs: { source: [], target: [] },
  languageCache: { fetchedAt: 0, deepl: null, lara: null },
  voices: {},
  uiLang: 'fr',
};

const LEGACY_KEY = 'direction';
/** @type {Record<string, [string, string]>} */
const LEGACY_PAIRS = { 'en-fr': ['en', 'fr'], 'fr-en': ['fr', 'en-US'] };

/**
 * @param {string | undefined} direction
 * @returns {[string, string]}
 */
function legacyPair(direction) {
  return LEGACY_PAIRS[direction ?? ''] ?? LEGACY_PAIRS['en-fr'];
}

/**
 * @param {HistoryEntry} entry
 * @returns {HistoryEntry}
 */
function migrateEntry({ direction, ...entry }) {
  if (!direction) return entry;
  const [source, target] = legacyPair(direction);
  return { ...entry, source, target };
}

/** @returns {Promise<Settings>} */
export async function loadSettings() {
  /** @type {Record<string, unknown>} */
  const stored = {};
  await Promise.all(
    [...Object.keys(DEFAULTS), LEGACY_KEY].map(async (key) => {
      const value = await storeGet(SETTINGS_STORE, key);
      if (value !== null) stored[key] = value;
    })
  );
  const { direction, ...settings } = /** @type {Settings & { direction?: string }} */ ({
    ...structuredClone(DEFAULTS),
    ...stored,
  });
  settings.uiLang = isUiLang(stored.uiLang) ? stored.uiLang : detectUiLang();

  if (direction && stored.sourceLang === undefined) {
    [settings.sourceLang, settings.targetLang] = legacyPair(direction);
    await Promise.all([
      saveSetting('sourceLang', settings.sourceLang),
      saveSetting('targetLang', settings.targetLang),
    ]);
  }
  if (settings.history.some((entry) => entry.direction)) {
    settings.history = settings.history.map(migrateEntry);
    await saveSetting('history', settings.history);
  }
  return settings;
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {Promise<void>}
 */
export function saveSetting(key, value) {
  return storeSet(SETTINGS_STORE, key, value);
}

/**
 * Copies the checked state of a `role="switch"` checkbox into `aria-checked`.
 * Call it after changing `input.checked` from code, which fires no `change` event.
 *
 * @param {HTMLInputElement} input
 */
export function syncSwitchAria(input) {
  input.setAttribute('aria-checked', String(input.checked));
}

/**
 * Keeps `aria-checked` in sync with every `role="switch"` checkbox under `root`.
 *
 * @param {ParentNode} [root]
 */
export function bindSwitchAria(root = document) {
  /** @type {NodeListOf<HTMLInputElement>} */
  const switches = root.querySelectorAll('input[role="switch"]');
  for (const input of switches) {
    input.addEventListener('change', () => syncSwitchAria(input));
    syncSwitchAria(input);
  }
}

/** @typedef {'fr' | 'en'} UiLang */

/** @type {readonly UiLang[]} */
export const UI_LANGS = ['fr', 'en'];

/**
 * Interface messages, one entry per key: `[French, English]`. A key missing a
 * language fails `pnpm typecheck`.
 *
 * @satisfies {Record<string, readonly [string, string]>}
 */
const MESSAGES = {
  'provider.label': ['Moteur de traduction', 'Translation engine'],
  'provider.both': ['Les deux', 'Both'],
  'lang.sourceTitle': ['Choisir la langue source', 'Choose the source language'],
  'lang.targetTitle': ['Choisir la langue cible', 'Choose the target language'],
  'lang.swap': ['Inverser les langues', 'Swap languages'],
  'formality.label': ['Formalité', 'Formality'],
  'formality.title': ['Registre poli / familier', 'Formal / informal register'],
  'formality.formal': ['Vous', 'Formal'],
  'formality.informal': ['Tu', 'Informal'],
  'theme.toggle': ['Inverser le thème clair / sombre', 'Toggle light / dark theme'],
  'theme.toSystem': ['Revenir au thème du système', 'Back to the system theme'],
  'theme.toLight': ['Passer en thème clair', 'Switch to light theme'],
  'theme.toDark': ['Passer en thème sombre', 'Switch to dark theme'],
  'settings.open': ['Paramètres', 'Settings'],
  recent: ['Récent', 'Recent'],
  translate: ['Traduire', 'Translate'],
  'pane.source': ['Texte source', 'Source text'],
  'pane.placeholder': ['Saisissez ou collez votre texte…', 'Type or paste your text…'],
  'pane.clear': ['Effacer le texte', 'Clear the text'],
  'pane.target': ['Traduction', 'Translation'],
  'pane.speak': ['Écouter la traduction', 'Listen to the translation'],
  'pane.copy': ['Copier la traduction', 'Copy the translation'],
  'settings.title': ['Paramètres', 'Settings'],
  'settings.save': ['Enregistrer', 'Save'],
  'settings.closeNoSave': ['Fermer sans enregistrer', 'Close without saving'],
  'settings.apiKeys': ['Clés API', 'API keys'],
  'settings.deeplKey': ['Clé DeepL', 'DeepL key'],
  'settings.showKey': ['Afficher la clé', 'Show the key'],
  'settings.showSecret': ['Afficher le secret', 'Show the secret'],
  'settings.preferences': ['Préférences', 'Preferences'],
  'settings.uiLang': ["Langue de l'interface", 'Interface language'],
  'settings.autoTranslate': ['Traduction automatique pendant la saisie', 'Automatic translation while typing'],
  'settings.voices': ['Voix de lecture', 'Reading voice'],
  'settings.note': [
    "Vos clés sont enregistrées en clair dans le fichier settings.json de cet appareil et ne sont jamais incluses dans l'application. Vos textes sont envoyés à DeepL et à Lara pour être traduits.",
    'Your keys are stored in plain text in the settings.json file on this device and are never included in the app. Your text is sent to DeepL and Lara to be translated.',
  ],
  'settings.noteWeb': [
    'Vos clés sont chiffrées dans ce navigateur ; elles protègent le stockage, pas contre un script malveillant du site. Vos textes transitent par le serveur du site vers DeepL et Lara, sans être conservés.',
    'Your keys are encrypted in this browser; this protects the storage, not against a malicious script on the site. Your text goes through the site server to DeepL and Lara, without being kept.',
  ],
  'settings.clearKeys': ['Effacer mes clés', 'Erase my keys'],
  'settings.keysCleared': ['Vos clés ont été effacées', 'Your keys have been erased'],
  'settings.keysClearFailed': [
    "Impossible d'effacer vos clés. Videz les données de ce site dans votre navigateur.",
    "Your keys could not be erased. Clear this site's data in your browser.",
  ],
  'install.label': ['Installer Ponto', 'Install Ponto'],
  'install.native': [
    'Ponto existe en application native pour votre appareil, plus rapide et sans navigateur.',
    'Ponto is available as a native app for your device, faster and without a browser.',
  ],
  'install.nativeLink': ['Télécharger l\'application', 'Download the app'],
  'install.button': ['Installer', 'Install'],
  'install.later': ['Plus tard', 'Later'],
  'install.ios': [
    'Pour installer Ponto : Partager › Sur l\'écran d\'accueil.',
    'To install Ponto: Share › Add to Home Screen.',
  ],
  'install.mac': [
    'Pour installer Ponto : Fichier › Ajouter au Dock.',
    'To install Ponto: File › Add to Dock.',
  ],
  'install.keysNote': [
    'Le stockage de l\'application installée est séparé de Safari : vous devrez y ressaisir vos clés.',
    'The installed app\'s storage is separate from Safari: you will need to enter your keys again in it.',
  ],
  'update.label': ['Mise à jour disponible', 'Update available'],
  'update.text': [
    'Une nouvelle version de Ponto est disponible. La mise à jour recharge la page.',
    'A new version of Ponto is available. Updating reloads the page.',
  ],
  'update.button': ['Mettre à jour', 'Update'],
  'update.later': ['Plus tard', 'Later'],
  'picker.titleSource': ['Langue source', 'Source language'],
  'picker.titleTarget': ['Langue cible', 'Target language'],
  'picker.close': ['Fermer', 'Close'],
  'picker.search': ['Rechercher une langue', 'Search for a language'],
  'picker.searchPlaceholder': ['Rechercher une langue…', 'Search for a language…'],
  'picker.recent': ['Récentes', 'Recent'],
  'picker.all': ['Toutes les langues', 'All languages'],
  'picker.empty': ['Aucune langue trouvée.', 'No language found.'],
  'picker.laraOnly': ['Lara uniquement', 'Lara only'],
  'picker.deeplOnly': ['DeepL uniquement', 'DeepL only'],
  'lang.detect': ['Détecter la langue', 'Detect language'],
  'translate.both': ['Traduire avec les deux', 'Translate with both'],
  'pane.translatedWith': ['Traduit avec {engine}', 'Translated with {engine}'],
  'error.tooLong': ['Texte trop long : {max} caractères maximum.', 'Text too long: {max} characters maximum.'],
  'error.unsupported': [
    '{lang} : langue non prise en charge par {engine}.',
    '{lang}: language not supported by {engine}.',
  ],
  'error.generic': ['Une erreur est survenue.', 'An error occurred.'],
  'error.deeplKeyMissing': [
    'Clé API DeepL manquante. Ajoutez-la dans les Paramètres.',
    'DeepL API key missing. Add it in the Settings.',
  ],
  'error.laraMissing': [
    'Identifiants Lara manquants. Ajoutez-les dans les Paramètres.',
    'Lara credentials missing. Add them in the Settings.',
  ],
  'error.laraDenied': [
    'Identifiants Lara refusés (code {status}). Vérifiez-les dans les Paramètres.',
    'Lara credentials refused (code {status}). Check them in the Settings.',
  ],
  'error.network': [
    'Erreur réseau avec {engine}. Vérifiez votre connexion.',
    'Network error with {engine}. Check your connection.',
  ],
  'error.api': ['Erreur de {engine} (code {status}).', '{engine} error (code {status}).'],
  'error.invalidResponse': ['Réponse de {engine} invalide.', 'Invalid response from {engine}.'],
  'error.badRequest': [
    'Requête invalide. Vérifiez le texte et les langues.',
    'Invalid request. Check the text and the languages.',
  ],
  'error.origin': [
    'Requête refusée par le site. Rechargez la page ; si cela continue, une extension bloque peut-être la requête.',
    'Request refused by the site. Reload the page; if it persists, an extension may be blocking the request.',
  ],
  'error.internal': [
    'Erreur interne du serveur. Réessayez dans un instant.',
    'Internal server error. Try again in a moment.',
  ],
  'error.rateLimited': [
    'Trop de requêtes. Réessayez dans un instant.',
    'Too many requests. Try again in a moment.',
  ],
  'toast.copied': ['Traduction copiée', 'Translation copied'],
  'toast.copyFailed': ['Impossible de copier', 'Unable to copy'],
  'toast.saved': ['Paramètres enregistrés', 'Settings saved'],
  'toast.saveFailed': ["Échec de l'enregistrement", 'Failed to save'],
  'settings.deeplFree': ['Clé Free détectée (:fx)', 'Free key detected (:fx)'],
  'settings.deeplPro': ['Clé Pro', 'Pro key'],
  'voice.default': ['Voix par défaut du système', 'System default voice'],
  'voice.test': ['Essayer la voix ({lang})', 'Try the voice ({lang})'],
  'voice.none': [
    "Le système n'expose aucune voix : la voix par défaut sera utilisée.",
    'The system exposes no voice: the default voice will be used.',
  ],
  'voice.unavailable': [
    "La lecture vocale n'est pas disponible sur cet appareil.",
    'Speech playback is not available on this device.',
  ],
};

/** @typedef {keyof typeof MESSAGES} MessageKey */

/** @type {Record<UiLang, 0 | 1>} */
const LANG_COLUMN = { fr: 0, en: 1 };

/** @type {UiLang} */
let currentLang = 'fr';
/** @type {Set<(lang: UiLang) => void>} */
const languageListeners = new Set();

/**
 * @param {unknown} value
 * @returns {value is UiLang}
 */
export function isUiLang(value) {
  return value === 'fr' || value === 'en';
}

/**
 * Picks the interface language from the system language: French for `fr*`, English otherwise.
 *
 * @returns {UiLang}
 */
export function detectUiLang() {
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

/** @returns {UiLang} */
export function getUiLang() {
  return currentLang;
}

/**
 * @param {string} key
 * @param {Record<string, string | number>} [params] - Values for `{name}` placeholders.
 * @returns {string}
 */
function lookup(key, params) {
  const entry = /** @type {Record<string, readonly [string, string]>} */ (MESSAGES)[key];
  const message = entry?.[LANG_COLUMN[currentLang]] ?? entry?.[0] ?? key;
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}

/**
 * Returns the message for the current interface language. Falls back to French,
 * then to the key itself, so a missing translation never renders an empty label.
 *
 * @param {MessageKey} key
 * @param {Record<string, string | number>} [params] - Values for `{name}` placeholders.
 * @returns {string}
 */
export function t(key, params) {
  return lookup(key, params);
}

/**
 * Translates every element under `root` that carries a translation attribute:
 * - `data-i18n="key"` sets the text content;
 * - `data-i18n-attr="aria-label:key;title:key"` sets the listed attributes.
 *
 * Pass a cloned `<template>` fragment before inserting it, since template
 * content is not part of the document.
 *
 * @param {ParentNode} [root]
 */
export function applyTranslations(root = document) {
  /** @type {NodeListOf<HTMLElement>} */
  const texts = root.querySelectorAll('[data-i18n]');
  for (const el of texts) {
    el.textContent = lookup(el.dataset.i18n ?? '');
  }
  /** @type {NodeListOf<HTMLElement>} */
  const withAttrs = root.querySelectorAll('[data-i18n-attr]');
  for (const el of withAttrs) {
    for (const pair of (el.dataset.i18nAttr ?? '').split(';')) {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      if (attr && key) el.setAttribute(attr, lookup(key));
    }
  }
}

/**
 * Registers a callback run each time the interface language changes. Use it to
 * refresh text that JavaScript generates itself (titles, counters, toasts).
 *
 * @param {(lang: UiLang) => void} listener
 * @returns {() => void} Function that removes the listener
 */
export function onUiLanguageChange(listener) {
  languageListeners.add(listener);
  return () => languageListeners.delete(listener);
}

/**
 * Switches the interface language: updates `<html lang>`, translates the page
 * and notifies listeners. Pass `persist: false` at startup to apply the stored
 * language without writing it back.
 *
 * @param {UiLang} lang
 * @param {{ persist?: boolean }} [options]
 * @returns {Promise<void>}
 */
export async function setUiLanguage(lang, { persist = true } = {}) {
  if (!isUiLang(lang)) return;
  currentLang = lang;
  document.documentElement.lang = lang;
  applyTranslations();
  for (const listener of languageListeners) listener(lang);
  if (persist) await saveSetting('uiLang', lang);
}
