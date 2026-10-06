/**
 * @module tauri/path
 * @description Thin wrapper around `@tauri-apps/api/path`.
 * Provides typed error boundaries for filesystem path resolution functions.
 */
import { join, appLocalDataDir, resourceDir } from '@tauri-apps/api/path';

/**
 * Typed error thrown by any `tauri/path` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class PathError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'PathError';
    }
}
/**
 * Joins path segments into a single platform-appropriate path.
 *
 * @param {...string} parts - Path segments to join
 * @returns {Promise<string>} The joined path
 * @throws {PathError} If the underlying Tauri `join` call fails
 *
 * @example
 * const path = await pathJoin('/home/user/.local', 'resources', 'images')
 * // → '/home/user/.local/resources/images'
 */
export async function pathJoin(...parts) {
    try {
        return await join(...parts);
    } catch (err) {
        throw new PathError(`pathJoin: failed for [${parts.join(', ')}]`, err);
    }
}
/**
 * Returns the application's local data directory.
 * On Windows: `C:\Users\<user>\AppData\Local\<bundle-id>\`.
 * On Android: the app's internal storage directory.
 *
 * @returns {Promise<string>} Absolute path to the local data directory
 * @throws {PathError} If the path cannot be resolved
 */
export async function pathAppLocalDataDir() {
    try {
        return await appLocalDataDir();
    } catch (err) {
        throw new PathError('pathAppLocalDataDir: failed', err);
    }
}
/**
 * Returns the application's resource directory (bundled assets).
 * In dev mode this resolves to the local `resources/` folder served by Tauri.
 *
 * @returns {Promise<string>} Absolute path to the resource directory
 * @throws {PathError} If the path cannot be resolved
 */
export async function pathResourceDir() {
    try {
        return await resourceDir();
    } catch (err) {
        throw new PathError('pathResourceDir: failed', err);
    }
}
