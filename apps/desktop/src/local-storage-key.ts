/**
 * Local storage key for the E2EE crypto state (spec 5.4). A random 32-byte key is created
 * once and kept on disk only in `safeStorage`-encrypted form (OS keychain / DPAPI). The web
 * code gets the raw bytes over the preload bridge and uses them as an AES-GCM key.
 */
export type SafeStorageLike = {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(cipher: Buffer): string;
};

export type KeyFileDeps = {
  safeStorage: SafeStorageLike;
  read(): Buffer | null;
  write(data: Buffer): void;
  randomBytes(n: number): Buffer;
};

export const LOCAL_KEY_BYTES = 32;

/** Returns the key as base64, or null when the OS cannot protect it (never stored plain). */
export function getOrCreateLocalStorageKey(deps: KeyFileDeps): string | null {
  if (!deps.safeStorage.isEncryptionAvailable()) return null;
  const existing = deps.read();
  if (existing) {
    try {
      const key = deps.safeStorage.decryptString(existing);
      if (Buffer.from(key, "base64").length === LOCAL_KEY_BYTES) return key;
    } catch {
      // Unreadable (profile moved or keychain reset): fall through and mint a new key.
    }
  }
  const key = deps.randomBytes(LOCAL_KEY_BYTES).toString("base64");
  deps.write(deps.safeStorage.encryptString(key));
  return key;
}
