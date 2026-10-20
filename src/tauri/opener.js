/**
 * @module tauri/opener
 * @description Thin wrapper around `@tauri-apps/plugin-opener`.
 * Opens links in the system browser: the webview does not follow `target="_blank"`.
 */
import { openUrl } from '@tauri-apps/plugin-opener';

/**
 * Typed error thrown by any `tauri/opener` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class OpenerError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'OpenerError';
    }
}
/**
 * Opens a URL in the default browser. The URL must be allowed by the
 * `opener:allow-open-url` scope in `src-tauri/capabilities/default.json`.
 *
 * @param {string} url - Absolute URL to open
 * @returns {Promise<void>}
 * @throws {OpenerError} If the URL is refused or cannot be opened
 */
export async function openerOpenUrl(url) {
    try {
        await openUrl(url);
    } catch (err) {
        throw new OpenerError(`openerOpenUrl: failed for "${url}"`, err);
    }
}
