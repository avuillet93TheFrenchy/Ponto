/**
 * Encrypted key vault for the web build.
 *
 * Values are encrypted with AES-GCM 256. The CryptoKey is non-extractable and
 * persisted in IndexedDB (the only way to keep a non-extractable key), next to
 * the encrypted records. When IndexedDB is unavailable (private mode, blocked
 * storage), the vault falls back to an in-memory Map for the session.
 */

const DB_NAME = 'ponto-vault';
const STORE = 'kv';
const MASTER_ID = '__master';
const IV_LENGTH = 12;

/**
 * @typedef {{ iv: Uint8Array<ArrayBuffer>, data: ArrayBuffer }} VaultRecord
 */

/** @type {Map<string, string>} */
const memory = new Map();
/** @type {Promise<IDBDatabase | null> | null} */
let dbPromise = null;
/** @type {Promise<CryptoKey> | null} */
let keyPromise = null;
let persistent = true;

/**
 * Opens the database once; resolves to null (memory fallback) when it cannot be opened.
 * @returns {Promise<IDBDatabase | null>}
 */
function getDb() {
  dbPromise ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => {
        const db = request.result;
        // Let another tab (or a later app version) upgrade the database instead of blocking it.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    if (db === null) {
      persistent = false;
    }
    return db;
  });
  return dbPromise;
}

/**
 * The failure of a transaction; `error` is null when the browser gives no reason.
 * @param {IDBTransaction} tx
 * @param {IDBRequest} [request]
 * @returns {DOMException}
 */
function transactionError(tx, request) {
  return tx.error ?? request?.error ?? new DOMException('Transaction failed', 'AbortError');
}

/**
 * Runs one operation on the `kv` store. Settles when the transaction ends, not when the request
 * succeeds: a commit that fails afterwards (quota, abort) must not look like a successful write.
 * @template T
 * @param {IDBDatabase} db
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest<T>} op
 * @returns {Promise<T>}
 */
function run(db, mode, op) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = op(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(transactionError(tx, request));
    tx.onabort = () => reject(transactionError(tx, request));
  });
}

/**
 * The master key lives in the same store; user values must never overwrite or read it.
 * @param {string} name
 * @returns {void}
 */
function assertUserName(name) {
  if (name === MASTER_ID) {
    throw new Error(`Nom réservé du coffre : ${MASTER_ID}`);
  }
}

/**
 * Returns the master key, creating and persisting it when `create` is true.
 * @param {IDBDatabase} db
 * @param {boolean} create
 * @returns {Promise<CryptoKey | null>}
 */
function getMasterKey(db, create) {
  if (keyPromise) {
    return keyPromise;
  }
  if (!create) {
    return readMasterKey(db);
  }
  // Memoized synchronously so concurrent first writes share one creation.
  /** @type {Promise<CryptoKey>} */
  const pending = createMasterKey(db).catch((error) => {
    if (keyPromise === pending) {
      keyPromise = null;
    }
    throw error;
  });
  keyPromise = pending;
  return pending;
}

/**
 * Reads the stored master key without creating one.
 * @param {IDBDatabase} db
 * @returns {Promise<CryptoKey | null>}
 */
async function readMasterKey(db) {
  /** @type {CryptoKey | undefined} */
  const key = await run(db, 'readonly', (store) => store.get(MASTER_ID));
  if (!key) {
    return null;
  }
  keyPromise ??= Promise.resolve(key);
  return key;
}

/**
 * Generates a key, then in one readwrite transaction keeps the stored one if
 * present or stores the new one. Same-store readwrite transactions are
 * serialized, so concurrent creators (even across tabs) end with one key.
 * @param {IDBDatabase} db
 * @returns {Promise<CryptoKey>}
 */
async function createMasterKey(db) {
  const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    /** @type {CryptoKey} */
    let winner = fresh;
    const read = store.get(MASTER_ID);
    read.onsuccess = () => {
      if (read.result) {
        winner = read.result;
      } else {
        store.put(fresh, MASTER_ID);
      }
    };
    tx.oncomplete = () => resolve(winner);
    tx.onerror = () => reject(transactionError(tx));
    tx.onabort = () => reject(transactionError(tx));
  });
}

/**
 * Switches the vault to memory after an unexpected IndexedDB failure.
 * @returns {void}
 */
function fallBackToMemory() {
  persistent = false;
  void dbPromise?.then((db) => db?.close());
  dbPromise = Promise.resolve(null);
  keyPromise = null;
}

/**
 * @param {string} name
 * @returns {Promise<string | null>}
 */
export async function vaultGet(name) {
  assertUserName(name);
  const db = await getDb();
  if (!db) {
    return memory.get(name) ?? null;
  }
  try {
    /** @type {VaultRecord | undefined} */
    const record = await run(db, 'readonly', (store) => store.get(name));
    if (!record) {
      return null;
    }
    const key = await getMasterKey(db, false);
    if (!key) {
      // The key is really gone (site data partly cleared): the entry can never be read again.
      await run(db, 'readwrite', (store) => store.delete(name));
      return null;
    }
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, key, record.data);
      return new TextDecoder().decode(plain);
    } catch (error) {
      // Name check only: the DOMException class differs between realms (jsdom, workers).
      if (/** @type {{ name?: string }} */ (error)?.name !== 'OperationError') {
        throw error;
      }
      // Wrong key or record tampered with: the entry is unreadable, drop it.
      await run(db, 'readwrite', (store) => store.delete(name));
      return null;
    }
  } catch {
    // A transient IndexedDB failure must neither erase the stored value nor hide
    // every persisted key for the rest of the session: report "absent" for this read only.
    return memory.get(name) ?? null;
  }
}

/**
 * @param {string} name
 * @param {string} value
 * @returns {Promise<void>}
 */
export async function vaultSet(name, value) {
  assertUserName(name);
  const db = await getDb();
  if (db) {
    try {
      const key = await getMasterKey(db, true);
      if (key) {
        const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
        const data = await crypto.subtle.encrypt(
          { name: 'AES-GCM', iv },
          key,
          new TextEncoder().encode(value),
        );
        await run(db, 'readwrite', (store) => store.put({ iv, data }, name));
        return;
      }
    } catch {
      fallBackToMemory();
    }
  }
  memory.set(name, value);
}

/**
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function vaultDelete(name) {
  assertUserName(name);
  memory.delete(name);
  const db = await getDb();
  if (!db) {
    return;
  }
  try {
    await run(db, 'readwrite', (store) => store.delete(name));
  } catch {
    fallBackToMemory();
  }
}

/**
 * Removes every value and the encryption key. Rejects when the persistent
 * store could not be cleared (the keys may still be on disk); the memory
 * fallback is always emptied and has nothing persistent to fail.
 * @returns {Promise<void>}
 */
export async function vaultClear() {
  memory.clear();
  keyPromise = null;
  const db = await getDb();
  if (!db) {
    return;
  }
  try {
    await run(db, 'readwrite', (store) => store.clear());
  } finally {
    keyPromise = null;
  }
}

/**
 * False when the vault fell back to memory.
 * @returns {Promise<boolean>}
 */
export async function vaultIsPersistent() {
  await getDb();
  return persistent;
}

/**
 * Resets the module state (memory, db handle, key cache, persistence flag).
 * @returns {void}
 */
export function resetVaultForTests() {
  memory.clear();
  void dbPromise?.then((db) => db?.close());
  dbPromise = null;
  keyPromise = null;
  persistent = true;
}
