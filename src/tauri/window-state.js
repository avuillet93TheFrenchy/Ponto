/**
 * @module tauri/window-state
 * @description Thin wrapper around `@tauri-apps/plugin-window-state`.
 * Provides typed error boundaries for saving and restoring the main window state
 * (size, position, maximised, fullscreen…) across sessions.
 *
 * `StateFlags` is re-exported directly for convenience — use it to select
 * which properties to persist (e.g. `StateFlags.SIZE | StateFlags.POSITION`).
 */
import {
    restoreStateCurrent,
    saveWindowState,
    StateFlags,
} from '@tauri-apps/plugin-window-state';

/** @see {@link https://docs.rs/tauri-plugin-window-state/latest/tauri_plugin_window_state/struct.StateFlags.html} */
export { StateFlags } from '@tauri-apps/plugin-window-state';

/**
 * Typed error thrown by any `tauri/window-state` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class WindowStateError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'WindowStateError';
    }
}
/**
 * Restores the previously saved window state for the current window.
 * Call this on application startup before the window is shown.
 *
 * @param {number} [flags=StateFlags.ALL] - Bitmask of state properties to restore
 * @returns {Promise<void>}
 * @throws {WindowStateError} If the state cannot be restored
 *
 * @example
 * await windowStateRestore(StateFlags.SIZE | StateFlags.POSITION)
 */
export async function windowStateRestore(flags = StateFlags.ALL) {
    try {
        await restoreStateCurrent(flags);
    } catch (err) {
        throw new WindowStateError('windowStateRestore: failed', err);
    }
}
/**
 * Saves the current window state so it can be restored on next launch.
 * Call this on application close or at key moments (e.g. before minimising).
 *
 * @param {number} [flags=StateFlags.ALL] - Bitmask of state properties to save
 * @returns {Promise<void>}
 * @throws {WindowStateError} If the state cannot be saved
 */
export async function windowStateSave(flags = StateFlags.ALL) {
    try {
        await saveWindowState(flags);
    } catch (err) {
        throw new WindowStateError('windowStateSave: failed', err);
    }
}
