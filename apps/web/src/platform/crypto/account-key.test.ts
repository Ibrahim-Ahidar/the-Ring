import { describe, expect, it } from "vitest";
import type { CryptoStateStore } from "@pulse/core";

import { createAccountKeyStore } from "./account-key";

function memoryStates(): CryptoStateStore & { raw: Map<string, Uint8Array> } {
  const raw = new Map<string, Uint8Array>();
  return {
    raw,
    get: async (n) => raw.get(n),
    put: async (n, b) => void raw.set(n, b),
    delete: async (n) => void raw.delete(n),
  };
}

async function aesKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

describe("account key store", () => {
  it("stores the seed sealed and loads it back", async () => {
    const states = memoryStates();
    const store = createAccountKeyStore(states, await aesKey());
    expect(await store.load()).toBeNull();
    const seed = crypto.getRandomValues(new Uint8Array(32));
    await store.save(seed);
    const stored = [...states.raw.values()][0]!;
    expect(Buffer.from(stored).includes(Buffer.from(seed))).toBe(false);
    expect(await store.load()).toEqual(seed);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("rejects a seed of the wrong length", async () => {
    const store = createAccountKeyStore(memoryStates(), await aesKey());
    await expect(store.save(new Uint8Array(5))).rejects.toThrow();
  });
});
