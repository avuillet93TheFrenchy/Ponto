import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetVaultForTests } from '../src/js/web/vault.js';

/**
 * Loads a fresh copy of the storage module, as after a page reload.
 * @returns {Promise<typeof import('../src/js/web/storage.js')>}
 */
async function loadStorage() {
  vi.resetModules();
  // The storage module gets a fresh vault instance after the reset: reset that one too.
  (await import('../src/js/web/vault.js')).resetVaultForTests();
  return import('../src/js/web/storage.js');
}

/**
 * Every value currently held by localStorage, concatenated.
 * @returns {string}
 */
function allLocalStorageValues() {
  return Object.keys(localStorage)
    .map((key) => `${key}=${localStorage.getItem(key)}`)
    .join('\n');
}

beforeEach(async () => {
  localStorage.clear();
  resetVaultForTests();
  // Each test starts with an empty vault database.
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('ponto-vault');
    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('web storage', () => {
  it('un réglage non secret survit à un rechargement du module', async () => {
    const first = await loadStorage();
    await first.webStoreSet('sourceLang', 'fr');

    const second = await loadStorage();

    expect(await second.webStoreGet('sourceLang')).toBe('fr');
  });

  it('une clé secrète n\'est jamais écrite dans localStorage', async () => {
    const { webStoreSet, SECRET_KEYS } = await loadStorage();
    await webStoreSet('sourceLang', 'fr');
    await webStoreSet('deeplKey', 'secret-deepl-123');
    await webStoreSet('laraId', 'secret-lara-id');
    await webStoreSet('laraSecret', 'secret-lara-secret');

    const dump = allLocalStorageValues();

    expect(SECRET_KEYS).toEqual(['deeplKey', 'laraId', 'laraSecret']);
    expect(dump).not.toContain('secret-deepl-123');
    expect(dump).not.toContain('secret-lara-id');
    expect(dump).not.toContain('secret-lara-secret');
    expect(dump).toContain('sourceLang');
  });

  it('une clé secrète revient déchiffrée via get', async () => {
    const first = await loadStorage();
    await first.webStoreSet('deeplKey', 'secret-deepl-123');

    const second = await loadStorage();

    expect(await second.webStoreGet('deeplKey')).toBe('secret-deepl-123');
  });

  it('valeur vide sur une clé secrète = absente (null)', async () => {
    const { webStoreGet, webStoreSet } = await loadStorage();
    await webStoreSet('deeplKey', 'secret-deepl-123');

    await webStoreSet('deeplKey', '');

    expect(await webStoreGet('deeplKey')).toBeNull();
  });

  it('une clé absente renvoie null', async () => {
    const { webStoreGet } = await loadStorage();

    expect(await webStoreGet('uiLang')).toBeNull();
    expect(await webStoreGet('deeplKey')).toBeNull();
  });

  it('localStorage qui lève → pas d\'exception', async () => {
    const { webStoreGet, webStoreSet } = await loadStorage();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage bloqué');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage bloqué');
    });

    await expect(webStoreSet('sourceLang', 'fr')).resolves.toBeUndefined();
    await expect(webStoreGet('sourceLang')).resolves.toBe('fr');
  });
  it("une valeur gardée en mémoire (localStorage plein) l'emporte sur l'ancienne valeur persistée", async () => {
    const { webStoreGet, webStoreSet } = await loadStorage();
    await webStoreSet('provider', 'deepl');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota dépassé');
    });

    await webStoreSet('provider', 'lara');

    await expect(webStoreGet('provider')).resolves.toBe('lara');
  });

  it('une valeur bien persistée ne masque pas une modification faite par un autre onglet', async () => {
    const { webStoreGet, webStoreSet } = await loadStorage();
    await webStoreSet('provider', 'deepl');
    localStorage.setItem('ponto-settings', JSON.stringify({ provider: 'both' }));

    await expect(webStoreGet('provider')).resolves.toBe('both');
  });
  it('JSON corrompu sous ponto-settings → valeurs absentes, et une écriture répare le stockage', async () => {
    localStorage.setItem('ponto-settings', '{pas du json');
    const { webStoreGet, webStoreSet } = await loadStorage();

    await expect(webStoreGet('provider')).resolves.toBeNull();
    await webStoreSet('provider', 'lara');

    await expect(webStoreGet('provider')).resolves.toBe('lara');
    expect(JSON.parse(localStorage.getItem('ponto-settings') ?? '')).toEqual({ provider: 'lara' });
  });

  it('deux écritures simultanées de réglages différents sont toutes les deux conservées', async () => {
    const { webStoreGet, webStoreSet } = await loadStorage();

    await Promise.all([webStoreSet('provider', 'lara'), webStoreSet('sourceLang', 'fr')]);

    await expect(webStoreGet('provider')).resolves.toBe('lara');
    await expect(webStoreGet('sourceLang')).resolves.toBe('fr');
  });

  it('une valeur non textuelle sur une clé secrète est refusée, pas stockée en "[object Object]"', async () => {
    const { webStoreGet, webStoreSet } = await loadStorage();

    await expect(webStoreSet('deeplKey', { a: 1 })).rejects.toThrow(TypeError);
    await expect(webStoreGet('deeplKey')).resolves.toBeNull();
  });
});
