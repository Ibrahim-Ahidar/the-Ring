import { err, ok } from "@pulse/core";

import { createDeviceLifecycle, startDeviceSync, withDeviceLifecycle, type DeviceDeps } from "./devices-core";

function makeDeps(over: Partial<DeviceDeps> = {}) {
  const calls: string[] = [];
  let saved: string | null = null;
  const deps: DeviceDeps = {
    getPushToken: async () => "ExponentPushToken[abc]",
    callRpc: (async (fn: string, args: Record<string, unknown>) => {
      calls.push(`${fn}:${JSON.stringify(args)}`);
      return ok(fn === "register_device" ? "dev-1" : null);
    }) as DeviceDeps["callRpc"],
    idStore: {
      get: async () => saved,
      set: async (id) => void (saved = id),
      clear: async () => void (saved = null),
    },
    platform: "android",
    appVersion: "0.1.0",
    log: jest.fn(),
    ...over,
  };
  return { deps, calls, saved: () => saved };
}

describe("device lifecycle", () => {
  it("registers with the token and stores the id", async () => {
    const t = makeDeps();
    await createDeviceLifecycle(t.deps).register();
    expect(t.calls[0]).toContain("register_device");
    expect(t.calls[0]).toContain("ExponentPushToken[abc]");
    expect(t.saved()).toBe("dev-1");
  });

  it("skips registration when no token (permission denied / emulator)", async () => {
    const t = makeDeps({ getPushToken: async () => null });
    await createDeviceLifecycle(t.deps).register();
    expect(t.calls).toEqual([]);
  });

  it("does not throw when token retrieval or the rpc fails", async () => {
    const t1 = makeDeps({ getPushToken: async () => Promise.reject(new Error("boom")) });
    await expect(createDeviceLifecycle(t1.deps).register()).resolves.toBeUndefined();
    expect(t1.deps.log).toHaveBeenCalled();
    const t2 = makeDeps({ callRpc: (async () => err("platform.unexpected")) as DeviceDeps["callRpc"] });
    await expect(createDeviceLifecycle(t2.deps).register()).resolves.toBeUndefined();
    expect(t2.saved()).toBeNull();
  });

  it("unregisters the stored id and clears it; no-op without one", async () => {
    const t = makeDeps();
    const dl = createDeviceLifecycle(t.deps);
    await dl.unregister();
    expect(t.calls).toEqual([]);
    await dl.register();
    await dl.unregister();
    expect(t.calls[1]).toContain('unregister_device:{"p_device_id":"dev-1"}');
    expect(t.saved()).toBeNull();
  });

  it("re-registering sends the same token each time (server upserts on it)", async () => {
    const t = makeDeps();
    const dl = createDeviceLifecycle(t.deps);
    await dl.register();
    await dl.register();
    expect(t.calls[0]).toBe(t.calls[1]);
  });
});

describe("withDeviceLifecycle", () => {
  it("registers after successful login, not after failed login", async () => {
    const register = jest.fn(async () => {});
    const devices = { register, unregister: jest.fn(async () => {}) };
    const good = withDeviceLifecycle({ signIn: async () => ok("s"), signOut: async () => ok(null), devices });
    await good.signIn("a", "b");
    expect(register).toHaveBeenCalledTimes(1);
    const bad = withDeviceLifecycle({ signIn: async () => err("x"), signOut: async () => ok(null), devices });
    await bad.signIn("a", "b");
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("login is not blocked by a hanging registration", async () => {
    const devices = { register: () => new Promise<void>(() => {}), unregister: async () => {} };
    const a = withDeviceLifecycle({ signIn: async () => ok("s"), signOut: async () => ok(null), devices });
    await expect(a.signIn("a", "b")).resolves.toEqual(ok("s"));
  });

  it("unregisters before signing out", async () => {
    const order: string[] = [];
    const a = withDeviceLifecycle({
      signIn: async () => ok("s"),
      signOut: async () => (order.push("signOut"), ok(null)),
      devices: { register: async () => {}, unregister: async () => void order.push("unregister") },
    });
    await a.signOut();
    expect(order).toEqual(["unregister", "signOut"]);
  });

  it("still signs out when unregister hangs (timeout)", async () => {
    const signOut = jest.fn(async () => ok(null));
    const a = withDeviceLifecycle({
      signIn: async () => ok("s"),
      signOut,
      devices: { register: async () => {}, unregister: () => new Promise<void>(() => {}) },
      unregisterTimeoutMs: 10,
    });
    await a.signOut();
    expect(signOut).toHaveBeenCalled();
  });
});

describe("startDeviceSync", () => {
  it("registers on start for a restored session and again when the push token changes", async () => {
    const t = makeDeps();
    let fire: () => void = () => {};
    const unsubscribe = jest.fn();
    const stop = startDeviceSync({ userId: "u1" }, createDeviceLifecycle(t.deps), (onChange) => {
      fire = onChange;
      return unsubscribe;
    });
    await new Promise((r) => setImmediate(r));
    expect(t.calls).toHaveLength(1);
    fire();
    await new Promise((r) => setImmediate(r));
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1]).toContain("register_device");
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does nothing without a session", async () => {
    const t = makeDeps();
    const subscribe = jest.fn(() => () => {});
    startDeviceSync(null, createDeviceLifecycle(t.deps), subscribe)();
    await new Promise((r) => setImmediate(r));
    expect(t.calls).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
  });
});
