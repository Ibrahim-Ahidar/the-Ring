/**
 * The key that encrypts crypto state at rest (spec 5.4, D11).
 * Desktop: 32 random bytes protected by Electron safeStorage, fetched over the preload
 * bridge and imported as a non-extractable AES-GCM key. Web: a non-extractable AES-GCM
 * CryptoKey generated once and kept in IndexedDB (the raw bytes never exist in JS).
 */
import { getDesktopBridge } from "../desktop-bridge";
import { idbKv } from "./state-store";

export type KeyVault = {
  get(): Promise<CryptoKey | undefined>;
  put(key: CryptoKey): Promise<void>;
};

const KEY_NAME = "local-storage-key";

export const idbKeyVault: KeyVault = {
  get: () => idbKv.get<CryptoKey>(KEY_NAME),
  put: (key) => idbKv.put(KEY_NAME, key).then(() => undefined),
};

export type LocalKeyDeps = {
  vault?: KeyVault;
  /** Defaults to the Desktop preload bridge when present. */
  desktopKey?: () => Promise<string | null>;
};

function b64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function getLocalStorageKey(deps: LocalKeyDeps = {}): Promise<CryptoKey> {
  const bridge = getDesktopBridge();
  const desktopKey = deps.desktopKey ?? (bridge ? () => bridge.getLocalStorageKey() : undefined);
  if (desktopKey) {
    const raw = await desktopKey();
    if (raw) {
      return crypto.subtle.importKey("raw", b64ToBytes(raw), "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
    }
    // Bridge present but the OS cannot protect a key: fall back to the browser vault.
  }
  const vault = deps.vault ?? idbKeyVault;
  const existing = await vault.get();
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await vault.put(key);
  return key;
}
