/**
 * @module tauri/updater
 * @description Thin wrapper around `@tauri-apps/plugin-updater`.
 * Checks the configured endpoints for a new release and installs it, with
 * typed error boundaries. Desktop only: the updater plugin does not apply to Android.
 */
import { check } from '@tauri-apps/plugin-updater';

/**
 * Typed error thrown by any `tauri/updater` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class UpdaterError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'UpdaterError';
    }
}
/**
 * Checks whether a new version is available.
 *
 * @param {import('@tauri-apps/plugin-updater').CheckOptions} [options] - Headers, timeout, proxy, target
 * @returns {Promise<import('@tauri-apps/plugin-updater').Update | null>} The update, or `null` if the app is up to date
 * @throws {UpdaterError} If the update check fails
 *
 * @example
 * const update = await updaterCheck()
 * if (update) await updaterDownloadAndInstall(update)
 */
export async function updaterCheck(options) {
    try {
        return await check(options);
    } catch (err) {
        throw new UpdaterError('updaterCheck: failed', err);
    }
}
/**
 * Downloads and installs an update returned by {@link updaterCheck}.
 * On Windows the installer restarts the app unless `restartAfterInstall` is `false`.
 *
 * @param {import('@tauri-apps/plugin-updater').Update} update - Update returned by `updaterCheck`
 * @param {(event: import('@tauri-apps/plugin-updater').DownloadEvent) => void} [onEvent] - Download progress callback
 * @returns {Promise<void>}
 * @throws {UpdaterError} If the download or the installation fails
 */
export async function updaterDownloadAndInstall(update, onEvent) {
    try {
        await update.downloadAndInstall(onEvent);
    } catch (err) {
        throw new UpdaterError(`updaterDownloadAndInstall: failed for version "${update.version}"`, err);
    }
}
/**
 * Releases the Rust-side resource held by an update that will not be installed.
 *
 * @param {import('@tauri-apps/plugin-updater').Update} update - Update returned by `updaterCheck`
 * @returns {Promise<void>}
 * @throws {UpdaterError} If the resource cannot be released
 */
export async function updaterClose(update) {
    try {
        await update.close();
    } catch (err) {
        throw new UpdaterError('updaterClose: failed', err);
    }
}
