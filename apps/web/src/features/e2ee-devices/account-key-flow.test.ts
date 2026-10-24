import { describe, expect, it } from "vitest";
import type { CryptoEngine, RpcClient } from "@pulse/core";
import { accountPublicKey, signAsAccount } from "@pulse/core/linking";

import type { AccountKeyStore } from "@/platform/crypto/account-key";

import { allowPendingDevice, startFreshDevice } from "./devices-changed";

function memoryKeys(initial: Uint8Array | null = null): AccountKeyStore {
  let seed = initial;
  return { load: async () => seed, save: async (s) => void (seed = s), clear: async () => void (seed = null) };
}

const engine = {
  createAccount: async () => ({ curve25519: "CURVE", ed25519: "ED" }),
  generateOneTimeKeys: async () => undefined,
  generateFallbackKey: async () => undefined,
  oneTimeKeys: async () => ({}),
  fallbackKey: async () => ({}),
  markKeysAsPublished: async () => undefined,
} as unknown as CryptoEngine;

function rpcReturning(outcome: string) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    async rpc(fn, args = {}) {
      calls.push({ fn, args });
      return { data: outcome, error: null };
    },
  };
  return { client, calls };
}

const info = { deviceId: "d", name: "n", platform: "web" };

describe("account signing key in the fresh-device flow", () => {
  it("keeps a new seed when the device registers or replaces the key", async () => {
    for (const [lost, fn, outcome] of [
      [false, "add_fresh_device", "registered"],
      [true, "replace_account_key", "replaced"],
    ] as const) {
      const { client, calls } = rpcReturning(outcome);
      const keys = memoryKeys();
      await startFreshDevice(client, engine, info, lost, keys);
      const seed = (await keys.load())!;
      expect(calls[0]!.fn).toBe(fn);
      expect(calls[0]!.args.p_account_signing_key).toBe(accountPublicKey(seed));
      expect(calls[0]!.args.p_account_signature).toBe(signAsAccount(seed, "CURVE"));
    }
  });

  it("stores no seed while approval is pending", async () => {
    const keys = memoryKeys();
    await startFreshDevice(rpcReturning("pending").client, engine, info, false, keys);
    expect(await keys.load()).toBeNull();
  });

  it("signs an approval with the account seed, and refuses without one", async () => {
    const seed = new Uint8Array(32).fill(7);
    const { client, calls } = rpcReturning("ok");
    const pending = { id: "p", identity_key: "PENDING-ID" } as never;
    const res = await allowPendingDevice(client, memoryKeys(seed), pending);
    expect(res.ok).toBe(true);
    expect(calls[0]!.args.p_account_signature).toBe(signAsAccount(seed, "PENDING-ID"));
    const none = await allowPendingDevice(client, memoryKeys(), pending);
    expect(none.ok).toBe(false);
  });
});
