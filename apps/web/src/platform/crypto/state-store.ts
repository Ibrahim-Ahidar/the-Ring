import type { CryptoStateStore } from "@pulse/core";

export class MemoryCryptoStateStore implements CryptoStateStore {
  readonly blobs = new Map<string, Uint8Array>();
  async get(name: string) {
    return this.blobs.get(name);
  }
  async put(name: string, blob: Uint8Array) {
    this.blobs.set(name, blob);
  }
  async delete(name: string) {
    this.blobs.delete(name);
  }
}

const DB_NAME = "pulse-crypto";
const STORE = "kv";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Raw IndexedDB key-value access, shared by the state store and the key vault. */
export const idbKv = {
  get: <T>(key: string) => run<T | undefined>("readonly", (s) => s.get(key)),
  put: (key: string, value: unknown) => run("readwrite", (s) => s.put(value, key)),
  delete: (key: string) => run("readwrite", (s) => s.delete(key)),
};

/**
 * IndexedDB-backed store for the sealed (encrypted) crypto state. Stand-in until the
 * LocalStore `crypto_state` table (#216) exists; the interface matches it.
 */
export class IdbCryptoStateStore implements CryptoStateStore {
  async get(name: string) {
    return idbKv.get<Uint8Array>(`state:${name}`);
  }
  async put(name: string, blob: Uint8Array) {
    await idbKv.put(`state:${name}`, blob);
  }
  async delete(name: string) {
    await idbKv.delete(`state:${name}`);
  }
}
