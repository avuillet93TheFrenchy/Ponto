/**
 * @module tauri/process
 * @description Thin wrapper around `@tauri-apps/plugin-process`.
 * Provides typed error boundaries for application lifecycle control.
 */
import { exit, relaunch } from '@tauri-apps/plugin-process';

/**
 * Typed error thrown by any `tauri/process` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class ProcessError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'ProcessError';
    }
}
/**
 * Terminates the application with the given exit code.
 *
 * @param {number} [code=0] - Exit code (0 = success, non-zero = error)
 * @returns {Promise<void>}
 * @throws {ProcessError} If the exit command fails
 */
export async function processExit(code = 0) {
    try {
        await exit(code);
    } catch (err) {
        throw new ProcessError(`processExit: failed with code ${code}`, err);
    }
}
/**
 * Restarts the application by re-launching the current executable.
 *
 * @returns {Promise<void>}
 * @throws {ProcessError} If the relaunch command fails
 */
export async function processRelaunch() {
    try {
        await relaunch();
    } catch (err) {
        throw new ProcessError('processRelaunch: failed', err);
    }
}
