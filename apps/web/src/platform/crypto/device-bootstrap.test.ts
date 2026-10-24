import { describe, expect, it } from "vitest";
import type { CryptoEngine, RpcClient } from "@pulse/core";

import type { AccountKeyStore } from "./account-key";
import { establishDevice, type BootDeps } from "./device-bootstrap";
import { DEVICE_ID_KV } from "./device-id";

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

function setup(opts: { registerError?: string; addFresh?: string; status?: string; restored?: boolean; kvId?: string }) {
  const calls: string[] = [];
  const kv = new Map<string, string>(opts.kvId ? [[DEVICE_ID_KV, opts.kvId]] : []);
  let persisted = 0;
  let created = 0;
  const client: RpcClient = {
    async rpc(fn) {
      calls.push(fn);
      if (fn === "register_device" && opts.registerError)
        return { data: null, error: { message: opts.registerError } };
      if (fn === "add_fresh_device") return { data: opts.addFresh ?? "pending", error: null };
      if (fn === "device_approval_status") return { data: opts.status ?? "approved", error: null };
      if (fn === "one_time_key_count") return { data: 0, error: null };
      if (fn === "upload_keys") return { data: 5, error: null };
      return { data: null, error: null };
    },
  };
  const engine = {
    async identityKeys() {
      if (created === 0 && !opts.restored) throw new Error("crypto: no account");
      return { curve25519: "C", ed25519: "E" };
    },
    async createAccount() {
      created += 1;
      return { curve25519: "C", ed25519: "E" };
    },
    async generateOneTimeKeys() {},
    async oneTimeKeys() {
      return { k: "v" };
    },
    async generateFallbackKey() {},
    async fallbackKey() {
      return { f: "v" };
    },
    async markKeysAsPublished() {},
  } as unknown as CryptoEngine;
  const deps: BootDeps = {
    client,
    engine,
    store: {
      getKv: async (k) => kv.get(k) ?? null,
      setKv: async (k, v) => void kv.set(k, v),
    },
    accountKeys: memoryKeys(),
    persist: async () => void (persisted += 1),
    load: async () => opts.restored ?? false,
    info: (deviceId) => ({ deviceId, name: "n", platform: "web" }),
    newId: () => "new-id",
  };
  return { deps, calls, kv, persisted: () => persisted, created: () => created };
}

describe("establishDevice (issue #251)", () => {
  it("enters a pending state on approval_required instead of returning nothing", async () => {
    const t = setup({ registerError: "e2ee.approval_required" });
    const res = await establishDevice(t.deps);
    expect(res).toEqual({ kind: "pending", deviceId: "new-id" });
    expect(t.calls).toContain("add_fresh_device");
    // identity and id are persisted, and keys are uploaded for the pending device
    expect(t.kv.get(DEVICE_ID_KV)).toBe("new-id");
    expect(t.persisted()).toBeGreaterThan(0);
    expect(t.calls).toContain("upload_keys");
  });

  it("stays pending on a later start while the server still says pending", async () => {
    const t = setup({ kvId: "dev", restored: true, status: "pending" });
    expect(await establishDevice(t.deps)).toEqual({ kind: "pending", deviceId: "dev" });
    expect(t.calls).not.toContain("register_device");
  });

  it("registers normally and stores the device id", async () => {
    const t = setup({});
    expect(await establishDevice(t.deps)).toEqual({ kind: "ready", deviceId: "new-id" });
    expect(t.kv.get(DEVICE_ID_KV)).toBe("new-id");
  });

  it("fails for other register errors", async () => {
    const t = setup({ registerError: "e2ee.device_limit" });
    expect(await establishDevice(t.deps)).toEqual({ kind: "failed" });
  });

  it("does not recreate an existing identity when only the device id is missing", async () => {
    const t = setup({ restored: true });
    await establishDevice(t.deps);
    expect(t.created()).toBe(0);
  });
});
