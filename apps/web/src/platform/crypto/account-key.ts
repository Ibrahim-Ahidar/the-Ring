/**
 * The Account Signing Key (spec section 4): its own Ed25519 key, held by every Linked Device
 * and moved between them during QR linking. It is separate from each device's vodozemac
 * identity. Only the 32-byte seed is stored, sealed with the same local storage key and
 * store as the engine pickle.
 */
import type { CryptoStateStore } from "@pulse/core";

import { openSealed, seal } from "./encrypted-state";

export const ACCOUNT_SEED_NAME = "account-seed";
const SEED_BYTES = 32;

export interface AccountKeyStore {
  load(): Promise<Uint8Array | null>;
  save(seed: Uint8Array): Promise<void>;
  clear(): Promise<void>;
}

export function createAccountKeyStore(states: CryptoStateStore, key: CryptoKey): AccountKeyStore {
  return {
    async load() {
      const sealed = await states.get(ACCOUNT_SEED_NAME);
      if (!sealed) return null;
      const seed = await openSealed(key, ACCOUNT_SEED_NAME, sealed);
      return seed.length === SEED_BYTES ? seed : null;
    },
    async save(seed) {
      if (seed.length !== SEED_BYTES) throw new Error("crypto: account seed must be 32 bytes");
      await states.put(ACCOUNT_SEED_NAME, await seal(key, ACCOUNT_SEED_NAME, seed));
    },
    async clear() {
      await states.delete(ACCOUNT_SEED_NAME);
    },
  };
}

/** The browser/Desktop store for this install: IndexedDB blobs sealed with the local key. */
export async function openAccountKeyStore(): Promise<AccountKeyStore> {
  const [{ getLocalStorageKey }, { IdbCryptoStateStore }] = await Promise.all([
    import("./local-key"),
    import("./state-store"),
  ]);
  return createAccountKeyStore(new IdbCryptoStateStore(), await getLocalStorageKey());
}

/** The browser's engine restored from its sealed state, with the matching saver and key store. */
export async function openPersistentEngine() {
  const [{ getLocalStorageKey }, { IdbCryptoStateStore }, { loadEngineState, saveEngineState }, { createCryptoEngine }] =
    await Promise.all([
      import("./local-key"),
      import("./state-store"),
      import("./encrypted-state"),
      import("./create-engine"),
    ]);
  const key = await getLocalStorageKey();
  const states = new IdbCryptoStateStore();
  const engine = createCryptoEngine();
  await loadEngineState(engine, states, key);
  return {
    engine,
    accountKeys: createAccountKeyStore(states, key),
    persist: () => saveEngineState(engine, states, key),
  };
}
