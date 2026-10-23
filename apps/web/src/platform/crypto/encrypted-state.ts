/**
 * Persists the engine's pickled state encrypted with the local storage key. vodozemac
 * pickles are plain JSON, so nothing is ever written without going through `seal` first.
 * Layout of a stored blob: 12-byte random IV || AES-GCM ciphertext; the entry name is
 * bound as additional authenticated data so blobs cannot be swapped between names.
 */
import type { CryptoEngine, CryptoStateStore } from "@pulse/core";

const IV_BYTES = 12;
export const ENGINE_STATE_NAME = "engine";

const enc = new TextEncoder();

export async function seal(key: CryptoKey, name: string, plain: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: enc.encode(name) },
      key,
      plain as BufferSource,
    ),
  );
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return out;
}

export async function openSealed(
  key: CryptoKey,
  name: string,
  sealed: Uint8Array,
): Promise<Uint8Array> {
  if (sealed.length <= IV_BYTES) throw new Error("crypto: corrupt state blob");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: sealed.slice(0, IV_BYTES), additionalData: enc.encode(name) },
    key,
    sealed.slice(IV_BYTES),
  );
  return new Uint8Array(plain);
}

export async function saveEngineState(
  engine: CryptoEngine,
  store: CryptoStateStore,
  key: CryptoKey,
  name = ENGINE_STATE_NAME,
): Promise<void> {
  await store.put(name, await seal(key, name, await engine.pickle()));
}

/** Returns false when nothing was stored yet. Rejects if the blob fails authentication. */
export async function loadEngineState(
  engine: CryptoEngine,
  store: CryptoStateStore,
  key: CryptoKey,
  name = ENGINE_STATE_NAME,
): Promise<boolean> {
  const sealed = await store.get(name);
  if (!sealed) return false;
  await engine.unpickle(await openSealed(key, name, sealed));
  return true;
}
