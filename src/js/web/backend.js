/**
 * @module web/backend
 * @description Web replacement for the Rust commands: calls the Cloudflare Worker (`/api/*`) with the
 * user's own keys, read from the encrypted vault and sent in headers only (never in a URL or a body).
 * Failures are thrown as `Error`s whose message is the French text a Rust command would reject with,
 * so `errors.js` recognises them once `tauriInvoke` wraps them in a `CoreError` (`causeText` reads `message`).
 */
import { webStoreGet } from './storage.js';

/**
 * @typedef {object} CommandSpec
 * @property {string} route - Worker route.
 * @property {'DeepL' | 'Lara'} engine - Engine name used in error texts.
 * @property {boolean} translate - Whether the command translates (else it lists languages).
 */

/** @type {Record<string, CommandSpec>} */
const COMMANDS = {
  translate_deepl: { route: '/api/translate/deepl', engine: 'DeepL', translate: true },
  translate_lara: { route: '/api/translate/lara', engine: 'Lara', translate: true },
  deepl_languages: { route: '/api/languages/deepl', engine: 'DeepL', translate: false },
  lara_languages: { route: '/api/languages/lara', engine: 'Lara', translate: false },
};

/** A request that never answers must not leave the interface waiting forever. */
const REQUEST_TIMEOUT_MS = 30_000;
/** Longest server error text passed on to the UI (and to error reports). */
const MAX_ERROR_LENGTH = 300;

const MISSING = {
  DeepL: 'Clé API DeepL manquante. Ajoutez-la dans les Paramètres.',
  Lara: 'Identifiants Lara manquants. Ajoutez-les dans les Paramètres.',
};

/**
 * Reads a stored key with all whitespace removed (a pasted newline would make `fetch` throw).
 *
 * @param {string} name - Setting name.
 * @returns {Promise<string>} The cleaned key, or an empty string.
 */
async function readKey(name) {
  const value = await webStoreGet(name);
  return typeof value === 'string' ? value.replace(/\s+/g, '') : '';
}

/**
 * Builds the credential headers of an engine.
 *
 * @param {'DeepL' | 'Lara'} engine
 * @returns {Promise<Record<string, string>>}
 * @throws {Error} The "missing credentials" text when a key is absent.
 */
async function credentialHeaders(engine) {
  if (engine === 'DeepL') {
    const key = await readKey('deeplKey');
    if (!key) throw new Error(MISSING.DeepL);
    return { 'X-Deepl-Key': key };
  }
  const [id, secret] = await Promise.all([readKey('laraId'), readKey('laraSecret')]);
  if (!id || !secret) throw new Error(MISSING.Lara);
  return { 'X-Lara-Id': id, 'X-Lara-Secret': secret };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * @param {string} text
 * @returns {string}
 */
function truncate(text) {
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;
}

/**
 * Posts to the Worker and returns the parsed JSON of a successful reply.
 *
 * @param {CommandSpec} spec
 * @param {Record<string, unknown>} body
 * @param {Record<string, string>} credentials
 * @returns {Promise<unknown>}
 * @throws {Error} The Worker's error text, or a network / invalid response text.
 */
async function post({ route, engine }, body, credentials) {
  let response;
  try {
    response = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...credentials },
      body: JSON.stringify(body),
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`Erreur réseau ${engine} : ${messageOf(err)}`, { cause: err });
  }

  /** @type {unknown} */
  let data;
  try {
    data = await response.json();
  } catch {
    // No parser message here: it is raw English and would end up in error reports.
    throw new Error(`Réponse ${engine} invalide : réponse non JSON (statut ${response.status}).`);
  }
  if (!response.ok) {
    if (isRecord(data) && typeof data.error === 'string') throw new Error(truncate(data.error));
    throw new Error(`Réponse ${engine} invalide : statut ${response.status}`);
  }
  return data;
}

/**
 * Runs a backend command through the Worker.
 *
 * @param {string} command - Rust command name (`translate_deepl`, `translate_lara`, `deepl_languages`, `lara_languages`).
 * @param {Record<string, unknown>} [args] - Command arguments (`text`, `source`, `target`, `formal` for translations).
 * @returns {Promise<unknown>} The translation text, or the language lists as returned by the Worker.
 * @throws {Error} Its message is a French error text.
 */
export async function webInvoke(command, args = {}) {
  const spec = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!spec) throw new Error(`Commande inconnue : ${command}`);

  const credentials = await credentialHeaders(spec.engine);
  if (!spec.translate) return post(spec, {}, credentials);

  const { text, source, target, formal } = args;
  const data = await post(
    spec,
    { text, source: source || null, target, formal: formal ?? null },
    credentials
  );
  if (!isRecord(data) || typeof data.translation !== 'string') {
    throw new Error(`Réponse ${spec.engine} invalide : traduction absente.`);
  }
  return data.translation;
}
