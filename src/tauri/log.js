/**
 * @module tauri/log
 * @description Thin wrapper around `@tauri-apps/plugin-log`.
 * Routes all log calls through typed error boundaries.
 * Prefer these wrappers over `console.*` in production code so logs are
 * captured by the Tauri log file on desktop and Android.
 */
import { trace, debug, info, warn, error } from '@tauri-apps/plugin-log';

/**
 * Typed error thrown by any `tauri/log` wrapper function.
 * The original Tauri error is preserved on the `cause` property.
 */
export class LogError extends Error {
    /** @type {unknown} */
    cause;
    /**
     * @param {string} message
     * @param {unknown} [cause]
     */
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = 'LogError';
    }
}
/**
 * Logs a TRACE-level message (finest granularity, disabled in release builds).
 * @param {string} message - Message to log
 * @returns {Promise<void>}
 * @throws {LogError} If the log call fails
 */
export async function logTrace(message) {
    try {
        await trace(message);
    } catch (err) {
        throw new LogError('logTrace: failed', err);
    }
}
/**
 * Logs a DEBUG-level message.
 * @param {string} message - Message to log
 * @returns {Promise<void>}
 * @throws {LogError} If the log call fails
 */
export async function logDebug(message) {
    try {
        await debug(message);
    } catch (err) {
        throw new LogError('logDebug: failed', err);
    }
}
/**
 * Logs an INFO-level message.
 * @param {string} message - Message to log
 * @returns {Promise<void>}
 * @throws {LogError} If the log call fails
 */
export async function logInfo(message) {
    try {
        await info(message);
    } catch (err) {
        throw new LogError('logInfo: failed', err);
    }
}
/**
 * Logs a WARN-level message.
 * @param {string} message - Message to log
 * @returns {Promise<void>}
 * @throws {LogError} If the log call fails
 */
export async function logWarn(message) {
    try {
        await warn(message);
    } catch (err) {
        throw new LogError('logWarn: failed', err);
    }
}
/**
 * Logs an ERROR-level message.
 * @param {string} message - Message to log
 * @returns {Promise<void>}
 * @throws {LogError} If the log call fails
 */
export async function logError(message) {
    try {
        await error(message);
    } catch (err) {
        throw new LogError('logError: failed', err);
    }
}
