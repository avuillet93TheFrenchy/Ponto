import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as tauri from '@tauri/index.js';

const plugin = vi.hoisted(() => {
  /** @param {...string} names */
  const fns = (...names) => Object.fromEntries(names.map((name) => [name, vi.fn()]));
  return {
    core: fns('invoke', 'convertFileSrc', 'isTauri'),
    web: fns('webStoreGet', 'webStoreSet'),
    path: fns('join', 'appLocalDataDir', 'resourceDir'),
    event: fns('listen', 'emit'),
    log: fns('trace', 'debug', 'info', 'warn', 'error'),
    store: { Store: { load: vi.fn() } },
    process: fns('exit', 'relaunch'),
    windowState: Object.assign(fns('restoreStateCurrent', 'saveWindowState'), { StateFlags: { SIZE: 1, ALL: 63 } }),
  };
});

vi.mock('@tauri-apps/api/core', () => plugin.core);
vi.mock('@js/web/storage.js', () => plugin.web);
vi.mock('@tauri-apps/api/path', () => plugin.path);
vi.mock('@tauri-apps/api/event', () => plugin.event);
vi.mock('@tauri-apps/plugin-log', () => plugin.log);
vi.mock('@tauri-apps/plugin-store', () => plugin.store);
vi.mock('@tauri-apps/plugin-process', () => plugin.process);
vi.mock('@tauri-apps/plugin-window-state', () => plugin.windowState);

beforeEach(() => {
  vi.resetAllMocks();
  plugin.core.isTauri.mockReturnValue(true);
});

const handler = () => {};

/**
 * Every wrapper takes arbitrary arguments, so the tests call them by name through this view of the module.
 *
 * @type {Record<string, (...args: unknown[]) => Promise<unknown>>}
 */
const wrappers = /** @type {never} */ (tauri);

/**
 * @typedef {object} WrapperCase
 * @property {string} wrapper - Name of the exported wrapper.
 * @property {import('vitest').Mock} target - Plugin function the wrapper calls.
 * @property {unknown[]} args - Arguments given to the wrapper.
 * @property {unknown[]} [pluginArgs] - Arguments the plugin must receive, when they differ from `args`.
 * @property {string} error - Expected error name.
 * @property {string} message - Expected error message.
 * @property {boolean} [returns] - Whether the wrapper returns the plugin's result (default `true`).
 */

/** @type {WrapperCase[]} */
const cases = [
  { wrapper: 'tauriInvoke', target: plugin.core.invoke, args: ['cmd', { a: 1 }, { flag: true }], error: 'CoreError', message: 'tauriInvoke: failed to invoke "cmd"' },
  { wrapper: 'tauriConvertFileSrc', target: plugin.core.convertFileSrc, args: ['/img.png', 'stream'], error: 'CoreError', message: 'tauriConvertFileSrc: failed for "/img.png"' },

  { wrapper: 'pathJoin', target: plugin.path.join, args: ['a', 'b'], error: 'PathError', message: 'pathJoin: failed for [a, b]' },
  { wrapper: 'pathAppLocalDataDir', target: plugin.path.appLocalDataDir, args: [], error: 'PathError', message: 'pathAppLocalDataDir: failed' },
  { wrapper: 'pathResourceDir', target: plugin.path.resourceDir, args: [], error: 'PathError', message: 'pathResourceDir: failed' },

  { wrapper: 'eventListen', target: plugin.event.listen, args: ['evt', handler], error: 'EventError', message: 'eventListen: failed for "evt"' },
  { wrapper: 'eventEmit', target: plugin.event.emit, args: ['evt', { p: 1 }], error: 'EventError', message: 'eventEmit: failed for "evt"', returns: false },

  { wrapper: 'logTrace', target: plugin.log.trace, args: ['msg'], error: 'LogError', message: 'logTrace: failed', returns: false },
  { wrapper: 'logDebug', target: plugin.log.debug, args: ['msg'], error: 'LogError', message: 'logDebug: failed', returns: false },
  { wrapper: 'logInfo', target: plugin.log.info, args: ['msg'], error: 'LogError', message: 'logInfo: failed', returns: false },
  { wrapper: 'logWarn', target: plugin.log.warn, args: ['msg'], error: 'LogError', message: 'logWarn: failed', returns: false },
  { wrapper: 'logError', target: plugin.log.error, args: ['msg'], error: 'LogError', message: 'logError: failed', returns: false },

  { wrapper: 'processExit', target: plugin.process.exit, args: [2], error: 'ProcessError', message: 'processExit: failed with code 2', returns: false },
  { wrapper: 'processRelaunch', target: plugin.process.relaunch, args: [], error: 'ProcessError', message: 'processRelaunch: failed', returns: false },

  { wrapper: 'windowStateRestore', target: plugin.windowState.restoreStateCurrent, args: [1], error: 'WindowStateError', message: 'windowStateRestore: failed', returns: false },
  { wrapper: 'windowStateSave', target: plugin.windowState.saveWindowState, args: [1], error: 'WindowStateError', message: 'windowStateSave: failed', returns: false },
];

describe.each(cases)('$wrapper', ({ wrapper, target, args, pluginArgs = args, error, message, returns = true }) => {
  const run = async () => wrappers[wrapper](...args);

  it('transmet ses arguments au plugin', async () => {
    target.mockReturnValue('résultat');

    const result = await run();

    expect(target).toHaveBeenCalledWith(...pluginArgs);
    expect(result).toBe(returns ? 'résultat' : undefined);
  });

  it(`remplace l'erreur du plugin par une ${error}`, async () => {
    const cause = new Error('erreur native');
    target.mockImplementation(() => {
      throw cause;
    });

    const thrown = await run().catch((err) => err);

    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toMatchObject({ name: error, message, cause });
  });
});

describe('valeurs par défaut', () => {
  it('tauriConvertFileSrc utilise le protocole asset', () => {
    tauri.tauriConvertFileSrc('/img.png');

    expect(plugin.core.convertFileSrc).toHaveBeenCalledWith('/img.png', 'asset');
  });

  it('processExit sort avec le code 0', async () => {
    await tauri.processExit();

    expect(plugin.process.exit).toHaveBeenCalledWith(0);
  });

  it('windowStateRestore et windowStateSave portent sur tout l’état de la fenêtre', async () => {
    await tauri.windowStateRestore();
    await tauri.windowStateSave();

    expect(plugin.windowState.restoreStateCurrent).toHaveBeenCalledWith(63);
    expect(plugin.windowState.saveWindowState).toHaveBeenCalledWith(63);
  });
});

describe('store', () => {
  const storeCases = [
    { wrapper: 'storeGet', method: 'get', args: ['s.json', 'k'], methodArgs: ['k'], message: 'storeGet: failed for "k" in "s.json"', returns: true },
    { wrapper: 'storeSet', method: 'set', args: ['s.json', 'k', 1], methodArgs: ['k', 1], message: 'storeSet: failed for "k" in "s.json"' },
    { wrapper: 'storeDelete', method: 'delete', args: ['s.json', 'k'], methodArgs: ['k'], message: 'storeDelete: failed for "k" in "s.json"' },
    { wrapper: 'storeClear', method: 'clear', args: ['s.json'], methodArgs: [], message: 'storeClear: failed for "s.json"' },
    { wrapper: 'storeKeys', method: 'keys', args: ['s.json'], methodArgs: [], message: 'storeKeys: failed for "s.json"', returns: true },
  ];

  describe.each(storeCases)('$wrapper', ({ wrapper, method, args, methodArgs, message, returns = false }) => {
    it('ouvre le fichier du Store puis appelle la méthode', async () => {
      const store = { [method]: vi.fn().mockResolvedValue('valeur') };
      plugin.store.Store.load.mockResolvedValue(store);

      const result = await wrappers[wrapper](...args);

      expect(plugin.store.Store.load).toHaveBeenCalledWith('s.json');
      expect(store[method]).toHaveBeenCalledWith(...methodArgs);
      expect(result).toBe(returns ? 'valeur' : undefined);
    });

    it('remplace une erreur du Store par une StoreError', async () => {
      const cause = new Error('fichier illisible');
      plugin.store.Store.load.mockRejectedValue(cause);

      const thrown = await wrappers[wrapper](...args).catch((err) => err);

      expect(thrown).toMatchObject({ name: 'StoreError', message, cause });
    });
  });

  it('storeGet renvoie null pour une clé absente', async () => {
    plugin.store.Store.load.mockResolvedValue({ get: vi.fn().mockResolvedValue(undefined) });

    expect(await tauri.storeGet('s.json', 'absente')).toBeNull();
  });

  it('storeGet hors Tauri délègue au stockage web', async () => {
    plugin.core.isTauri.mockReturnValue(false);
    plugin.web.webStoreGet.mockResolvedValue('fr');

    expect(await tauri.storeGet('s.json', 'sourceLang')).toBe('fr');
    expect(plugin.web.webStoreGet).toHaveBeenCalledWith('sourceLang');
    expect(plugin.store.Store.load).not.toHaveBeenCalled();
  });

  it('storeSet hors Tauri délègue au stockage web', async () => {
    plugin.core.isTauri.mockReturnValue(false);

    await tauri.storeSet('s.json', 'sourceLang', 'en');

    expect(plugin.web.webStoreSet).toHaveBeenCalledWith('sourceLang', 'en');
    expect(plugin.store.Store.load).not.toHaveBeenCalled();
  });
});

describe('tauriInvoke hors Tauri', () => {
  it('tauriInvoke hors Tauri appelle webInvoke et enveloppe l\'échec dans CoreError', async () => {
    plugin.core.isTauri.mockReturnValue(false);
    plugin.web.webStoreGet.mockResolvedValue(null);

    const thrown = await tauri.tauriInvoke('translate_deepl', { text: 'a', target: 'EN' }).catch((err) => err);

    expect(plugin.core.invoke).not.toHaveBeenCalled();
    expect(thrown).toBeInstanceOf(tauri.CoreError);
    expect(thrown.cause).toBe('Clé API DeepL manquante. Ajoutez-la dans les Paramètres.');
  });
});

describe('réexports', () => {
  it('expose StateFlags du plugin', () => {
    expect(tauri.StateFlags).toBe(plugin.windowState.StateFlags);
  });
});
