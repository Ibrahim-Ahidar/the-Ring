import { describe, expect, it, vi } from "vitest";

import type { CryptoEngine, RpcClient } from "@pulse/core";

import {
  announceDevicesChanged,
  classifyChange,
  devicesTopic,
  parseDevicesChanged,
  startFreshDevice,
  waitForApproval,
  type BroadcastClient,
} from "./devices-changed";

function rpcReturning(...values: unknown[]): RpcClient {
  const queue = [...values];
  return {
    rpc: vi.fn(async () => ({ data: queue.shift() ?? null, error: null })),
  } as unknown as RpcClient;
}

describe("parseDevicesChanged", () => {
  it("accepts a well formed payload", () => {
    expect(
      parseDevicesChanged({ userId: "u1", kind: "device_changed", origin: "o", at: 5 }),
    ).toEqual({ userId: "u1", kind: "device_changed", origin: "o", at: 5 });
  });
  it("rejects junk", () => {
    expect(parseDevicesChanged(null)).toBeNull();
    expect(parseDevicesChanged({ userId: "", kind: "device_changed" })).toBeNull();
    expect(parseDevicesChanged({ userId: "u", kind: "other" })).toBeNull();
  });
});

describe("classifyChange", () => {
  it("flags a bumped version as a security code change", () => {
    expect(classifyChange(1, 2)).toBe("security_code_changed");
  });
  it("otherwise reports a new device", () => {
    expect(classifyChange(2, 2)).toBe("new_device");
    expect(classifyChange(undefined, 2)).toBe("new_device");
  });
});

describe("announceDevicesChanged", () => {
  it("sends on the user topic then leaves the channel", async () => {
    const send = vi.fn(async () => "ok");
    const channel = {
      subscribe: (cb?: (s: string) => void) => {
        cb?.("SUBSCRIBED");
        return channel;
      },
      send,
    };
    const topics: string[] = [];
    const removeChannel = vi.fn();
    const client: BroadcastClient = {
      channel: (topic) => {
        topics.push(topic);
        return channel;
      },
      removeChannel,
    };
    const sent = await announceDevicesChanged(client, {
      userId: "u1",
      kind: "device_changed",
      origin: "o",
      at: 1,
    });
    expect(sent).toBe(true);
    expect(topics).toEqual([devicesTopic("u1")]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: "broadcast", event: "devices_changed" }),
    );
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("reports false when the channel errors", async () => {
    const channel = {
      subscribe: (cb?: (s: string) => void) => {
        cb?.("CHANNEL_ERROR");
        return channel;
      },
      send: vi.fn(),
    };
    const client: BroadcastClient = { channel: () => channel, removeChannel: vi.fn() };
    expect(
      await announceDevicesChanged(client, { userId: "u", kind: "device_changed", origin: "", at: 0 }),
    ).toBe(false);
  });
});

describe("waitForApproval", () => {
  const opts = { intervalMs: 1, maxPolls: 5, sleep: async () => undefined };

  it("returns once the device is approved", async () => {
    const client = rpcReturning("pending", "approved");
    const res = await waitForApproval(client, "d1", opts);
    expect(res).toEqual({ ok: true, value: "approved" });
  });

  it("gives up as pending after maxPolls", async () => {
    const client = rpcReturning("pending", "pending", "pending");
    const res = await waitForApproval(client, "d1", { ...opts, maxPolls: 3 });
    expect(res).toEqual({ ok: true, value: "pending" });
  });

  it("stops when cancelled", async () => {
    const client = rpcReturning("pending");
    const res = await waitForApproval(client, "d1", { ...opts, isCancelled: () => true });
    expect(res).toEqual({ ok: true, value: "pending" });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});


describe("startFreshDevice (issue #251)", () => {
  function setup(outcome: string) {
    const calls: string[] = [];
    const client = {
      rpc: vi.fn(async (fn: string) => {
        calls.push(fn);
        if (fn === "add_fresh_device") return { data: outcome, error: null };
        if (fn === "one_time_key_count") return { data: 0, error: null };
        if (fn === "upload_keys") return { data: 1, error: null };
        return { data: null, error: null };
      }),
    } as unknown as RpcClient;
    const engine = {
      identityKeys: async () => {
        throw new Error("crypto: no account");
      },
      createAccount: async () => ({ curve25519: "C", ed25519: "E" }),
      generateOneTimeKeys: async () => undefined,
      oneTimeKeys: async () => ({ k: "v" }),
      generateFallbackKey: async () => undefined,
      fallbackKey: async () => ({ f: "v" }),
      markKeysAsPublished: async () => undefined,
    } as unknown as CryptoEngine;
    const persist = vi.fn(async () => undefined);
    const accountKeys = { load: async () => null, save: vi.fn(async () => undefined), clear: async () => undefined };
    return { calls, client, engine, persist, accountKeys };
  }

  it("persists the engine state and uploads one-time and fallback keys when pending", async () => {
    const t = setup("pending");
    const res = await startFreshDevice(
      t.client,
      t.engine,
      { deviceId: "d", name: "n", platform: "web" },
      false,
      t.accountKeys,
      t.persist,
    );
    expect(res).toEqual({ ok: true, value: "pending" });
    expect(t.calls).toEqual(["add_fresh_device", "one_time_key_count", "upload_keys"]);
    expect(t.persist).toHaveBeenCalled();
    expect(t.accountKeys.save).not.toHaveBeenCalled();
  });

  it("keeps the new account key when this device ends up holding it", async () => {
    const t = setup("registered");
    await startFreshDevice(t.client, t.engine, { deviceId: "d", name: "n", platform: "web" }, false, t.accountKeys, t.persist);
    expect(t.accountKeys.save).toHaveBeenCalledTimes(1);
    expect(t.calls).toContain("upload_keys");
  });
});
