/**
 * @module tauri
 * @description Barrel re-export of all Tauri plugin wrappers.
 *
 * Import everything from `./tauri/index.js` (relatif) rather than from
 * `@tauri-apps/*` directly. This keeps business logic decoupled from the
 * Tauri runtime and ensures all calls are intercepted by the global mocks in
 * tests.
 *
 * Available modules:
 * - `core`  — `tauriInvoke`, `tauriConvertFileSrc`
 * - `path`  — `pathJoin`, `pathAppLocalDataDir`, `pathResourceDir`
 * - `event` — `eventListen`, `eventEmit`
 * - `log`   — `logTrace`, `logDebug`, `logInfo`, `logWarn`, `logError`
 * - `store` — `storeGet`, `storeSet`, `storeDelete`, `storeClear`, `storeKeys`
 * - `process` — `processExit`, `processRelaunch`
 * - `window-state` — `windowStateRestore`, `windowStateSave`, `StateFlags`
 * - `updater` — `updaterCheck`, `updaterDownloadAndInstall`, `updaterClose`
 *
 * @example
 * import { tauriInvoke, storeGet, logInfo } from './tauri/index.js'
 */
export * from './core';
export * from './path';
export * from './event';
export * from './log';
export * from './store';
export * from './process';
export * from './window-state';
export * from './updater';
