import { storeGet, storeSet } from '../tauri/index.js';
import { MESSAGES } from './messages.js';

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

/** @typedef {import('./messages.js').MessageKey} MessageKey */

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
