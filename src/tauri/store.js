/**
 * @module tauri/store
 * @description Thin wrapper around `@tauri-apps/plugin-store`.
 * Provides a simple key-value persistence API backed by Tauri's Store plugin.
 * Each function opens (or reuses) the store file at `storePath` before operating.
 */
import { Store } from '@tauri-apps/plugin-store';
import { isTauriRuntime } from './core';

/**
 * Typed error thrown by any `tauri/store` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class StoreError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'StoreError';
    }
}
/**
 * Retrieves a value from the store.
 *
 * Outside Tauri (web build), reads from the browser storage and ignores `storePath`.
 *
 * @param {string} storePath - Path to the store file
 * @param {string} key - Key to retrieve
 * @returns {Promise<unknown|null>} The stored value
 * @throws {StoreError} If loading the store or reading the key fails
 */
export async function storeGet(storePath, key) {
    // Loaded on demand: the Tauri build never fetches the web storage (and its key vault).
    if (!isTauriRuntime()) return (await import('@js/web/storage.js')).webStoreGet(key);
    try {
        const store = await Store.load(storePath);
        return (await store.get(key)) ?? null;
    } catch (err) {
        throw new StoreError(
            `storeGet: failed for "${key}" in "${storePath}"`,
            err
        );
    }
}
/**
 * Writes a value to the store.
 * Outside Tauri (web build), writes to the browser storage and ignores `storePath`.
 *
 * @param {string} storePath - Path to the store file
 * @param {string} key - Key to write
 * @param {unknown} value - Value to store
 * @returns {Promise<void>}
 * @throws {StoreError} If loading the store or writing the key fails
 */
export async function storeSet(storePath, key, value) {
    if (!isTauriRuntime()) return (await import('@js/web/storage.js')).webStoreSet(key, value);
    try {
        const store = await Store.load(storePath);
        await store.set(key, value);
    } catch (err) {
        throw new StoreError(
            `storeSet: failed for "${key}" in "${storePath}"`,
            err
        );
    }
}
/**
 * Deletes a key from the store.
 *
 * @param {string} storePath - Path to the store file
 * @param {string} key - Key to delete
 * @returns {Promise<void>}
 * @throws {StoreError} If loading the store or deleting the key fails
 */
export async function storeDelete(storePath, key) {
    try {
        const store = await Store.load(storePath);
        await store.delete(key);
    } catch (err) {
        throw new StoreError(
            `storeDelete: failed for "${key}" in "${storePath}"`,
            err
        );
    }
}
/**
 * Removes all entries from the store.
 *
 * @param {string} storePath - Path to the store file
 * @returns {Promise<void>}
 * @throws {StoreError} If loading the store or clearing it fails
 */
export async function storeClear(storePath) {
    try {
        const store = await Store.load(storePath);
        await store.clear();
    } catch (err) {
        throw new StoreError(`storeClear: failed for "${storePath}"`, err);
    }
}
/**
 * Returns all keys currently stored in the store file.
 *
 * @param {string} storePath - Path to the store file
 * @returns {Promise<string[]>} Array of key names (may be empty)
 * @throws {StoreError} If loading the store or listing the keys fails
 */
export async function storeKeys(storePath) {
    try {
        const store = await Store.load(storePath);
        return await store.keys();
    } catch (err) {
        throw new StoreError(`storeKeys: failed for "${storePath}"`, err);
    }
}
