import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import type { MessageRow } from "@pulse/core/local-store";

const msg: MessageRow = {
  id: "m1",
  conversation_id: "c1",
  sender_user_id: "u1",
  sender_device_id: null,
  sent_at: "2026-01-01T00:00:01Z",
  received_at: "2026-01-01T00:00:01Z",
  kind: "text",
  body: "secret",
  reply_to_id: null,
  edited_at: null,
  deleted: 0,
  status: null,
  media_json: null,
};

type Req = { op: string; sql?: string; params?: never[] };

/** A bridge whose localDb behaves like the Electron main process: one SQLite database. */
function installBridge() {
  let db: ReturnType<typeof createNodeSqliteExecutor> | null = null;
  const requests: Req[] = [];
  const bridge = {
    version: "test",
    notify() {},
    setUnreadCount() {},
    getLocalStorageKey: async () => null,
    onOpenChat: () => () => {},
    localDb: {
      async request(raw: unknown) {
        const req = raw as Req;
        requests.push(req);
        try {
          if (req.op === "destroy") {
            db?.close();
            db = null;
            return { ok: true };
          }
          db ??= createNodeSqliteExecutor();
          if (req.op === "exec") {
            await db.exec(req.sql!, req.params);
            return { ok: true };
          }
          return { ok: true, rows: await db.query(req.sql!, req.params) };
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      },
    },
  };
  vi.stubGlobal("window", { pulseDesktop: bridge });
  return { requests, hasDb: () => db !== null };
}

describe("getLocalStore backend choice", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PULSE_E2EE", "1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the desktop bridge when present, without spawning an OPFS worker", async () => {
    const worker = vi.fn();
    vi.stubGlobal("Worker", worker);
    const fake = installBridge();
    const { getLocalStore } = await import("./index");
    const store = await getLocalStore();
    expect(store).not.toBeNull();
    await store!.upsertMessages([msg]);
    expect((await store!.listMessages("c1")).map((m) => m.body)).toEqual(["secret"]);
    expect(fake.requests.length).toBeGreaterThan(0);
    expect(worker).not.toHaveBeenCalled();
  });

  it("works on desktop even where Worker is undefined", async () => {
    installBridge();
    const { getLocalStore } = await import("./index");
    expect(await getLocalStore()).not.toBeNull();
  });

  it("logout destroys the desktop database", async () => {
    const fake = installBridge();
    const { getLocalStore, deleteLocalDatabase } = await import("./index");
    const store = await getLocalStore();
    await store!.upsertMessages([msg]);
    await deleteLocalDatabase();
    expect(fake.requests.some((r) => r.op === "destroy")).toBe(true);
    expect(fake.hasDb()).toBe(false);
  });

  it("falls back to OPFS (a Worker) when there is no bridge", async () => {
    vi.stubGlobal("window", {});
    const spawned: unknown[] = [];
    class FakeWorker {
      constructor(...args: unknown[]) {
        spawned.push(args);
      }
      postMessage() {}
      addEventListener() {}
      terminate() {}
    }
    vi.stubGlobal("Worker", FakeWorker);
    const { getLocalStore } = await import("./index");
    void getLocalStore();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(spawned.length).toBe(1);
  });

  it("returns null with the flag off, even on desktop", async () => {
    vi.stubEnv("NEXT_PUBLIC_PULSE_E2EE", "0");
    const fake = installBridge();
    const { getLocalStore } = await import("./index");
    expect(await getLocalStore()).toBeNull();
    expect(fake.requests).toEqual([]);
  });
});
