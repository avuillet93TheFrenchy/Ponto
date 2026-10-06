/**
 * @module tauri/event
 * @description Thin wrapper around `@tauri-apps/api/event`.
 * Provides typed error boundaries for Tauri event bus operations.
 */
import { listen, emit } from '@tauri-apps/api/event';

/**
 * Typed error thrown by any `tauri/event` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class EventError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'EventError';
    }
}
/**
 * Registers a listener for a Tauri backend event.
 *
 * @param {string} event - Event name to subscribe to (e.g. `'assets:progress'`)
 * @param {(event: import('@tauri-apps/api/event').Event<unknown>) => void} handler - Callback invoked on each event
 * @returns {Promise<() => void>} An unlisten function — call it to remove the listener
 * @throws {EventError} If the listener cannot be registered
 *
 * @example
 * const unlisten = await eventListen('assets:progress', (e) => console.log(e.payload))
 * // Later:
 * unlisten()
 */
export async function eventListen(event, handler) {
    try {
        return await listen(event, handler);
    } catch (err) {
        throw new EventError(`eventListen: failed for "${event}"`, err);
    }
}
/**
 * Emits an event to the Tauri backend.
 *
 * @param {string} event - Event name to emit
 * @param {unknown} [payload] - Optional payload to attach to the event
 * @returns {Promise<void>}
 * @throws {EventError} If the event cannot be emitted
 */
export async function eventEmit(event, payload) {
    try {
        await emit(event, payload);
    } catch (err) {
        throw new EventError(`eventEmit: failed for "${event}"`, err);
    }
}
