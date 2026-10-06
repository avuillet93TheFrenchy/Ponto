import { t } from './settings.js';

/**
 * @typedef {object} BackendError
 * @property {string} message - Text to show, in the interface language.
 * @property {boolean} needsSettings - Whether the user must fix their settings (missing credentials).
 */

/**
 * Rust commands return French sentences (see `src-tauri/src/translate.rs`, `lara.rs`, `languages.rs`).
 * Each rule recognises one family of them so the UI can show the same error through `t()`.
 *
 * @type {{ pattern: RegExp, key: import('./settings.js').MessageKey, params?: (match: RegExpMatchArray, engine: string) => Record<string, string>, needsSettings?: boolean }[]}
 */
const RULES = [
  { pattern: /^Clé API DeepL manquante/, key: 'error.deeplKeyMissing', needsSettings: true },
  { pattern: /^Identifiants Lara manquants/, key: 'error.laraMissing', needsSettings: true },
  { pattern: /^Identifiants Lara refusés \((\d+)\)/, key: 'error.laraDenied', params: (m) => ({ status: m[1] }) },
  { pattern: /^Lara refuse le jeton/, key: 'error.laraDenied', params: () => ({ status: '401' }) },
  { pattern: /^Erreur réseau (DeepL|Lara)/, key: 'error.network', params: (m) => ({ engine: m[1] }) },
  { pattern: /^Erreur API Lara \((\d+)\)/, key: 'error.api', params: (m) => ({ engine: 'Lara', status: m[1] }) },
  { pattern: /\(code (\d{3})[^)]*\)$/, key: 'error.api', params: (m, engine) => ({ engine, status: m[1] }) },
  { pattern: /^Requête invalide/, key: 'error.badRequest' },
  { pattern: /^Origine refusée/, key: 'error.origin' },
  { pattern: /^(?:Erreur interne|Route inconnue)/, key: 'error.internal' },
  { pattern: /^Trop de requêtes/, key: 'error.rateLimited' },
  {
    pattern: /^(?:Réponse|Liste des langues).*\b(DeepL|Lara)\b/,
    key: 'error.invalidResponse',
    params: (m) => ({ engine: m[1] }),
  },
];

/**
 * Turns an error text returned by a Rust command into a message in the interface language.
 * Unknown texts are returned unchanged, so nothing is ever hidden.
 *
 * @param {string} raw - Error text from the backend.
 * @param {string} engine - Display name of the engine that failed, for messages that do not name it.
 * @returns {BackendError}
 */
export function describeBackendError(raw, engine) {
  for (const { pattern, key, params, needsSettings = false } of RULES) {
    const match = pattern.exec(raw);
    if (match) return { message: t(key, params?.(match, engine)), needsSettings };
  }
  return { message: raw, needsSettings: false };
}
