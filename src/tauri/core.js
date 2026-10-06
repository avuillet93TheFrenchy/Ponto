/**
 * @module tauri/core
 * @description Thin wrapper around `@tauri-apps/api/core`.
 * Routes all `invoke()` and `convertFileSrc()` calls through typed error
 * boundaries so business logic never catches raw Tauri internals.
 */
import { invoke, convertFileSrc, isTauri } from '@tauri-apps/api/core';

/**
 * Typed error thrown by any `tauri/core` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class CoreError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'CoreError';
    }
}

/**
 * Tells whether the app runs inside a Tauri webview (false in a plain browser).
 *
 * @returns {boolean}
 */
export function isTauriRuntime() {
    return isTauri();
}

/**
 * Invokes a Tauri backend command.
 *
 * @template T
 * @param {string} cmd - Rust command name (snake_case, matches `#[tauri::command]`)
 * @param {Record<string, unknown>} [args] - Arguments forwarded to the command
 * @param {import('@tauri-apps/api/core').InvokeOptions} [options] - Tauri invoke options
 * @returns {Promise<T>} Value returned by the Rust command
 * @throws {CoreError} If the backend command rejects or throws
 *
 * @example
 * const result = await tauriInvoke('download_assets', { version: '1.0', baseUrl: 'https://...' })
 */
export async function tauriInvoke(cmd, args, options) {
    try {
        if (!isTauriRuntime()) {
            // Loaded on demand: the Tauri build never fetches the web backend.
            const { webInvoke } = await import('@js/web/backend.js');
            return /** @type {T} */ (await webInvoke(cmd, args));
        }
        return await invoke(cmd, args, options);
    } catch (err) {
        throw new CoreError(`tauriInvoke: failed to invoke "${cmd}"`, err);
    }
}
/**
 * Converts a local file path to an `asset://` URL usable in the frontend
 * (e.g. as an `<img src>` or CSS `url()`).
 *
 * @param {string} filePath - Absolute local path to the file
 * @param {string} [protocol='asset'] - URL protocol prefix (default: `'asset'`)
 * @returns {string} The converted URL (e.g. `asset://localhost/path/to/file.png`)
 * @throws {CoreError} If the conversion fails
 *
 * @example
 * const url = tauriConvertFileSrc('/home/user/.local/share/hatmp/resources/bg.png')
 * // → 'asset://localhost/home/user/.local/share/hatmp/resources/bg.png'
 */
export function tauriConvertFileSrc(filePath, protocol = 'asset') {
    try {
        return convertFileSrc(filePath, protocol);
    } catch (err) {
        throw new CoreError(
            `tauriConvertFileSrc: failed for "${filePath}"`,
            err
        );
    }
}
