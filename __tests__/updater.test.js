import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdaterError, updaterCheck, updaterClose, updaterDownloadAndInstall } from '@tauri/updater.js';

const plugin = vi.hoisted(() => ({ check: vi.fn() }));

vi.mock('@tauri-apps/plugin-updater', () => plugin);

beforeEach(() => {
  vi.resetAllMocks();
});

/**
 * @param {Partial<Record<'downloadAndInstall' | 'close', import('vitest').Mock>>} [methods]
 * @returns {any} An update as returned by the plugin: only the members the wrapper uses.
 */
const fakeUpdate = (methods = {}) => ({
  version: '1.2.0',
  downloadAndInstall: vi.fn(),
  close: vi.fn(),
  ...methods,
});

describe('updaterCheck', () => {
  it('renvoie la mise à jour trouvée et transmet les options', async () => {
    const update = fakeUpdate();
    plugin.check.mockResolvedValue(update);

    expect(await updaterCheck({ timeout: 5000 })).toBe(update);
    expect(plugin.check).toHaveBeenCalledWith({ timeout: 5000 });
  });

  it('renvoie null quand l’application est à jour', async () => {
    plugin.check.mockResolvedValue(null);

    expect(await updaterCheck()).toBeNull();
  });

  it('remplace l’erreur du plugin par une UpdaterError', async () => {
    const cause = new Error('réseau coupé');
    plugin.check.mockRejectedValue(cause);

    const thrown = await updaterCheck().catch((err) => err);

    expect(thrown).toBeInstanceOf(UpdaterError);
    expect(thrown).toMatchObject({ name: 'UpdaterError', message: 'updaterCheck: failed', cause });
  });
});

describe('updaterDownloadAndInstall', () => {
  it('télécharge et installe en transmettant le rappel de progression', async () => {
    const update = fakeUpdate();
    const onEvent = vi.fn();

    await updaterDownloadAndInstall(update, onEvent);

    expect(update.downloadAndInstall).toHaveBeenCalledWith(onEvent);
  });

  it('nomme la version dans l’erreur quand l’installation échoue', async () => {
    const cause = new Error('signature invalide');
    const update = fakeUpdate({ downloadAndInstall: vi.fn().mockRejectedValue(cause) });

    const thrown = await updaterDownloadAndInstall(update).catch((err) => err);

    expect(thrown).toBeInstanceOf(UpdaterError);
    expect(thrown).toMatchObject({
      name: 'UpdaterError',
      message: 'updaterDownloadAndInstall: failed for version "1.2.0"',
      cause,
    });
  });
});

describe('updaterClose', () => {
  it('libère la ressource de la mise à jour', async () => {
    const update = fakeUpdate();

    await updaterClose(update);

    expect(update.close).toHaveBeenCalledOnce();
  });

  it('remplace l’erreur du plugin par une UpdaterError', async () => {
    const cause = new Error('déjà libérée');
    const update = fakeUpdate({ close: vi.fn().mockRejectedValue(cause) });

    const thrown = await updaterClose(update).catch((err) => err);

    expect(thrown).toMatchObject({ name: 'UpdaterError', message: 'updaterClose: failed', cause });
  });
});
