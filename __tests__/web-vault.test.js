import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetVaultForTests,
  vaultClear,
  vaultDelete,
  vaultGet,
  vaultIsPersistent,
  vaultSet,
} from '../src/js/web/vault.js';

const DB_NAME = 'ponto-vault';

/**
 * Wraps an IndexedDB request in a promise.
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Opens the vault database directly, to inspect or alter raw records.
 * @returns {Promise<IDBDatabase>}
 */
function openRaw() {
  return promisify(indexedDB.open(DB_NAME, 1));
}

/**
 * Runs an operation on the raw `kv` store.
 * @template T
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} op
 * @returns {Promise<T>}
 */
async function rawStore(mode, op) {
  const db = await openRaw();
  try {
    return await promisify(op(db.transaction('kv', mode).objectStore('kv')));
  } finally {
    db.close();
  }
}

/**
 * Lists the keys of the raw `kv` store.
 * @returns {Promise<IDBValidKey[]>}
 */
function rawKeys() {
  return rawStore('readonly', (store) => store.getAllKeys());
}

beforeEach(async () => {
  resetVaultForTests();
  await promisify(indexedDB.deleteDatabase(DB_NAME));
});

describe('coffre de clés', () => {
  it('aller-retour : set puis get renvoie la valeur', async () => {
    await vaultSet('deeplKey', 'abc-123:fx');
    expect(await vaultGet('deeplKey')).toBe('abc-123:fx');
    expect(await vaultIsPersistent()).toBe(true);
  });

  it("get d'une valeur absente → null", async () => {
    expect(await vaultGet('missing')).toBeNull();
    await vaultSet('other', 'x');
    expect(await vaultGet('missing')).toBeNull();
  });

  it('la valeur stockée ne contient pas le texte en clair', async () => {
    const secret = 'super-secret-api-key-0123456789'; // fake test value, vibe-guardian: ignore
    await vaultSet('deeplKey', secret);
    /** @type {{ iv: Uint8Array, data: ArrayBuffer }} */
    const record = await rawStore('readonly', (store) => store.get('deeplKey'));
    expect(record.iv).toHaveLength(12);
    const raw = new Uint8Array(record.data);
    expect(new TextDecoder('latin1').decode(raw)).not.toContain(secret);
    expect(raw.length).toBeGreaterThan(secret.length);
  });

  it('deux écritures de la même valeur donnent des IV et des chiffrés différents', async () => {
    await vaultSet('a', 'same-value');
    await vaultSet('b', 'same-value');
    const a = await rawStore('readonly', (store) => store.get('a'));
    const b = await rawStore('readonly', (store) => store.get('b'));
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
    expect(Array.from(new Uint8Array(a.data))).not.toEqual(Array.from(new Uint8Array(b.data)));
  });

  it('la clé de chiffrement est non extractible', async () => {
    await vaultSet('a', 'x');
    /** @type {CryptoKey} */
    const key = await rawStore('readonly', (store) => store.get('__master'));
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('coffre dont la clé a disparu → get renvoie null sans lever', async () => {
    await vaultSet('a', 'x');
    await rawStore('readwrite', (store) => store.delete('__master'));
    resetVaultForTests();
    expect(await vaultGet('a')).toBeNull();
  });

  it("donnée altérée → null, et l'entrée est supprimée", async () => {
    await vaultSet('a', 'valeur');
    /** @type {{ iv: Uint8Array, data: ArrayBuffer }} */
    const record = await rawStore('readonly', (store) => store.get('a'));
    const bytes = new Uint8Array(record.data);
    bytes[0] ^= 0xff;
    await rawStore('readwrite', (store) => store.put({ iv: record.iv, data: bytes.buffer }, 'a'));
    expect(await vaultGet('a')).toBeNull();
    expect(await rawKeys()).not.toContain('a');
  });

  it('lecture de la clé maîtresse en échec passager → null, la valeur est conservée', async () => {
    await vaultSet('a', 'valeur');
    resetVaultForTests();
    const original = IDBObjectStore.prototype.get;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(/** @this {IDBObjectStore} */ function (...args) {
      if (args[0] === '__master') throw new Error('transaction interrompue');
      return original.apply(this, args);
    });

    expect(await vaultGet('a')).toBeNull();
    expect(await rawKeys()).toContain('a');

    spy.mockRestore();
    // The vault did not switch to memory: the persisted value is readable again.
    expect(await vaultIsPersistent()).toBe(true);
    expect(await vaultGet('a')).toBe('valeur');
  });

  it('vaultDelete retire une valeur ; vaultClear retire tout', async () => {
    await vaultSet('a', '1');
    await vaultSet('b', '2');
    await vaultDelete('a');
    expect(await vaultGet('a')).toBeNull();
    expect(await vaultGet('b')).toBe('2');
    await vaultClear();
    expect(await vaultGet('b')).toBeNull();
    expect(await rawKeys()).toEqual([]);
    await vaultSet('c', '3');
    expect(await vaultGet('c')).toBe('3');
  });

  it('deux écritures simultanées avant toute clé relisent toutes les deux leur valeur', async () => {
    await Promise.all([vaultSet('laraId', 'ID'), vaultSet('laraSecret', 'SECRET')]);
    expect(await vaultGet('laraId')).toBe('ID');
    expect(await vaultGet('laraSecret')).toBe('SECRET');
  });

  it('la clé maîtresse est créée une seule fois et survit à un rechargement', async () => {
    await Promise.all([vaultSet('a', '1'), vaultSet('b', '2'), vaultSet('c', '3')]);
    const keys = await rawKeys();
    expect(keys.filter((k) => k === '__master')).toHaveLength(1);
    resetVaultForTests();
    expect(await vaultGet('a')).toBe('1');
    expect(await vaultGet('b')).toBe('2');
    expect(await vaultGet('c')).toBe('3');
  });

  it('après vaultClear, une nouvelle écriture crée une nouvelle clé', async () => {
    await vaultSet('a', '1');
    await vaultClear();
    await vaultSet('b', '2');
    expect(await vaultGet('b')).toBe('2');
    expect(await rawKeys()).toContain('__master');
  });

  it("vaultClear rejette si l'effacement IndexedDB échoue", async () => {
    await vaultSet('a', '1');
    vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(() => {
      throw new Error('clear failed');
    });
    await expect(vaultClear()).rejects.toThrow('clear failed');
    vi.restoreAllMocks();
    // Nothing was erased: the value is still readable.
    expect(await vaultGet('a')).toBe('1');
  });

  it('vaultClear vide la mémoire quand IndexedDB est indisponible et ne rejette pas', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await vaultSet('a', 'mem');
    await expect(vaultClear()).resolves.toBeUndefined();
    expect(await vaultGet('a')).toBeNull();
  });

  it("le nom réservé '__master' est refusé par get, set et delete", async () => {
    await vaultSet('a', '1'); // creates the database and the master key
    await expect(vaultSet('__master', 'x')).rejects.toThrow('réservé');
    await expect(vaultGet('__master')).rejects.toThrow('réservé');
    await expect(vaultDelete('__master')).rejects.toThrow('réservé');
    // The master key is untouched: the earlier value is still readable.
    resetVaultForTests();
    expect(await vaultGet('a')).toBe('1');
  });

  it("une écriture dont la transaction est annulée avant la validation ne passe pas pour réussie", async () => {
    const original = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(/** @this {IDBObjectStore} */ function (...args) {
      const request = original.apply(this, args);
      if (args[1] === 'a') request.addEventListener('success', () => this.transaction.abort());
      return request;
    });

    await vaultSet('a', 'valeur');

    // The value never reached the disk, so the vault says so and keeps it for the session.
    expect(await vaultIsPersistent()).toBe(false);
    expect(await vaultGet('a')).toBe('valeur');
  });

  it("laisse une autre version de la base s'ouvrir (onversionchange)", async () => {
    await vaultSet('a', '1');
    const outcome = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onsuccess = () => {
        request.result.close();
        resolve('opened');
      };
      request.onblocked = () => resolve('blocked');
      request.onerror = () => reject(request.error);
    });
    expect(outcome).toBe('opened');
  });

  it.each(['onerror', 'onblocked'])("ouverture d'IndexedDB en échec (%s) → mémoire", async (handler) => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      /** @type {Record<string, (() => void) | undefined>} */
      const request = {};
      queueMicrotask(() => request[handler]?.());
      return /** @type {any} */ (request);
    });
    await vaultSet('a', 'mem');
    expect(await vaultGet('a')).toBe('mem');
    expect(await vaultIsPersistent()).toBe(false);
  });

  it('IndexedDB indisponible → fonctionne en mémoire, vaultIsPersistent() est faux', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    await expect(vaultSet('a', 'mem')).resolves.toBeUndefined();
    expect(await vaultGet('a')).toBe('mem');
    expect(await vaultIsPersistent()).toBe(false);
    await vaultDelete('a');
    expect(await vaultGet('a')).toBeNull();
    await vaultSet('b', '2');
    await expect(vaultClear()).resolves.toBeUndefined();
    expect(await vaultGet('b')).toBeNull();
  });
});
