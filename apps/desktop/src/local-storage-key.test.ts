import { describe, expect, it } from "vitest";
import { getOrCreateLocalStorageKey, type KeyFileDeps } from "./local-storage-key";

function fake(available = true) {
  let file: Buffer | null = null;
  let n = 0;
  const deps: KeyFileDeps = {
    safeStorage: {
      isEncryptionAvailable: () => available,
      encryptString: (s) => Buffer.from("ENC:" + Buffer.from(s).toString("hex")),
      decryptString: (b) => {
        const t = b.toString();
        if (!t.startsWith("ENC:")) throw new Error("bad");
        return Buffer.from(t.slice(4), "hex").toString();
      },
    },
    read: () => file,
    write: (d) => {
      file = d;
    },
    randomBytes: (len) => Buffer.alloc(len, ++n),
  };
  return { deps, file: () => file };
}

describe("getOrCreateLocalStorageKey", () => {
  it("creates a 32-byte key once, stores it encrypted, and returns the same key after", () => {
    const f = fake();
    const k1 = getOrCreateLocalStorageKey(f.deps)!;
    expect(Buffer.from(k1, "base64")).toHaveLength(32);
    expect(f.file()!.toString()).not.toContain(k1);
    expect(getOrCreateLocalStorageKey(f.deps)).toBe(k1);
  });

  it("returns null and writes nothing when OS encryption is unavailable", () => {
    const f = fake(false);
    expect(getOrCreateLocalStorageKey(f.deps)).toBeNull();
    expect(f.file()).toBeNull();
  });

  it("mints a new key when the stored file cannot be decrypted", () => {
    const f = fake();
    const k1 = getOrCreateLocalStorageKey(f.deps)!;
    f.deps.write(Buffer.from("garbage"));
    const k2 = getOrCreateLocalStorageKey(f.deps)!;
    expect(k2).not.toBe(k1);
  });
});
