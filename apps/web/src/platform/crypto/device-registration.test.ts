import { describe, expect, it } from "vitest";
import type { CryptoEngine, RpcClient } from "@pulse/core";
import { ONE_TIME_KEY_TARGET, ONE_TIME_KEY_LOW_WATER, registerThisDevice, topUpKeys } from "./device-registration";

import { accountPublicKey, signAsAccount } from "@pulse/core/linking";
import type { AccountKeyStore } from "./account-key";

function memoryKeys(): AccountKeyStore {
  let seed: Uint8Array | null = null;
  return {
    load: async () => seed,
    save: async (s) => {
      seed = s;
    },
    clear: async () => {
      seed = null;
    },
  };
}

type Call = { fn: string; args: Record<string, unknown> };

function fakeRpc(count: number, failOn?: string) {
  const calls: Call[] = [];
  const client: RpcClient = {
    async rpc(fn, args = {}) {
      calls.push({ fn, args });
      if (fn === failOn) return { data: null, error: { message: "e2ee.device_limit" } };
      if (fn === "one_time_key_count") return { data: count, error: null };
      if (fn === "upload_keys") {
        const n = Object.keys((args.p_one_time_keys as object) ?? {}).length;
        return { data: count + n, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { client, calls };
}

function fakeEngine() {
  const log: string[] = [];
  let generated = 0;
  const engine = {
    async createAccount() {
      log.push("createAccount");
      return { curve25519: "CURVE", ed25519: "ED" };
    },
    async sign(m: string) {
      log.push(`sign:${m}`);
      return "SIG";
    },
    async generateOneTimeKeys(n: number) {
      log.push(`genOtk:${n}`);
      generated = n;
    },
    async oneTimeKeys() {
      return Object.fromEntries(Array.from({ length: generated }, (_, i) => [`k${i}`, `p${i}`]));
    },
    async generateFallbackKey() {
      log.push("genFallback");
    },
    async fallbackKey() {
      return { fb: "fbpub" };
    },
    async markKeysAsPublished() {
      log.push("published");
    },
  } as unknown as CryptoEngine;
  return { engine, log };
}

describe("topUpKeys", () => {
  it("does nothing when enough keys remain", async () => {
    const { client, calls } = fakeRpc(ONE_TIME_KEY_LOW_WATER);
    const { engine, log } = fakeEngine();
    const res = await topUpKeys(client, engine, "dev");
    expect(res).toEqual({ ok: true, value: ONE_TIME_KEY_LOW_WATER });
    expect(calls.map((c) => c.fn)).toEqual(["one_time_key_count"]);
    expect(log).toEqual([]);
  });

  it("generates up to the target, uploads, then marks published", async () => {
    const { client, calls } = fakeRpc(4);
    const { engine, log } = fakeEngine();
    const res = await topUpKeys(client, engine, "dev");
    expect(log).toEqual([`genOtk:${ONE_TIME_KEY_TARGET - 4}`, "published"]);
    expect(calls[1]!.fn).toBe("upload_keys");
    expect(Object.keys(calls[1]!.args.p_one_time_keys as object)).toHaveLength(ONE_TIME_KEY_TARGET - 4);
    expect(res).toEqual({ ok: true, value: ONE_TIME_KEY_TARGET });
  });

  it("does not mark keys published when the upload fails", async () => {
    const { client } = fakeRpc(0, "upload_keys");
    const { engine, log } = fakeEngine();
    const res = await topUpKeys(client, engine, "dev");
    expect(res.ok).toBe(false);
    expect(log).not.toContain("published");
  });
});

describe("registerThisDevice", () => {
  it("creates the account, registers, then uploads keys and a fallback key", async () => {
    const { client, calls } = fakeRpc(0);
    const { engine, log } = fakeEngine();
    const keys = memoryKeys();
    const res = await registerThisDevice(client, engine, { deviceId: "dev", name: "Laptop", platform: "web" }, keys);
    expect(res.ok).toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(["register_device", "one_time_key_count", "upload_keys"]);
    expect(calls[0]!.args).toMatchObject({
      p_device_id: "dev",
      p_identity_key: "CURVE",
      p_signing_key: "ED",
    });
    expect(calls[2]!.args.p_fallback_key).toEqual({ fb: "fbpub" });
    expect(log[0]).toBe("createAccount");
    expect(log).toContain("genFallback");
    expect(log.at(-1)).toBe("published");
  });

  it("surfaces the device limit error and uploads nothing", async () => {
    const { client, calls } = fakeRpc(0, "register_device");
    const { engine } = fakeEngine();
    const keys = memoryKeys();
    const res = await registerThisDevice(client, engine, { deviceId: "dev", name: "x", platform: "web" }, keys);
    expect(res).toEqual({ ok: false, error: { code: "e2ee.device_limit" } });
    expect(calls).toHaveLength(1);
  });
});
