/**
 * @module web/storage
 * @description Settings storage for the web build, replacing the Tauri Store plugin.
 * Secret keys go through the encrypted vault and never touch `localStorage`; every other
 * setting is a JSON object under one `localStorage` key. When `localStorage` is blocked,
 * values are kept in memory for the session and nothing throws.
 */
import { vaultDelete, vaultGet, vaultSet } from './vault.js';

/** Settings that hold credentials: stored in the vault only. */
export const SECRET_KEYS = ['deeplKey', 'laraId', 'laraSecret'];

const STORAGE_KEY = 'ponto-settings';

/** @type {Record<string, unknown>} Values that could not be persisted: they stay for the session and win over `localStorage`. */
const memory = {};

/**
 * @param {string} key
 * @returns {boolean}
 */
function isSecret(key) {
  return SECRET_KEYS.includes(key);
}

/**
 * Reads the persisted settings object, with the unpersisted session values on top.
 * @returns {Record<string, unknown>}
 */
function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw === null ? null : JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...parsed, ...memory };
    }
  } catch {
    // Blocked storage or corrupted JSON: fall back to the session copy.
  }
  return { ...memory };
}

/**
 * Retrieves a setting.
 *
 * @param {string} key - Setting name
 * @returns {Promise<unknown|null>} The stored value, or null when absent
 */
export async function webStoreGet(key) {
  if (isSecret(key)) return vaultGet(key);
  return readSettings()[key] ?? null;
}

/**
 * Writes a setting. An empty secret removes it from the vault.
 *
 * @param {string} key - Setting name
 * @param {unknown} value - Value to store
 * @returns {Promise<void>}
 */
export async function webStoreSet(key, value) {
  if (isSecret(key)) {
    if (value === '' || value === null || value === undefined) {
      await vaultDelete(key);
    } else if (typeof value === 'string') {
      await vaultSet(key, value);
    } else {
      throw new TypeError(`Secret setting "${key}" must be a string`);
    }
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readSettings(), [key]: value }));
    // Persisted: `localStorage` is the source of truth again (another tab may change it).
    delete memory[key];
  } catch {
    // Blocked or full storage: the value stays in memory for this session.
    memory[key] = value;
  }
}
