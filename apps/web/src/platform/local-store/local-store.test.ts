import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNodeSqliteExecutor } from "@pulse/core/local-store/node-sqlite-executor";
import type { MessageRow } from "@pulse/core/local-store";

import type { WorkerLike, WorkerRequest, WorkerResponse } from "./protocol";

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

/** Stands in for the OPFS worker: one SQLite database that "destroy" deletes. */
function installFakeWorker() {
  let db: ReturnType<typeof createNodeSqliteExecutor> | null = null;
  const requests: WorkerRequest[] = [];
  let spawned = 0;

  class FakeWorker implements WorkerLike {
    private listener: ((e: { data: WorkerResponse }) => void) | null = null;
    constructor() {
      spawned++;
    }
    postMessage(req: WorkerRequest) {
      requests.push(req);
      void (async () => {
        let res: WorkerResponse;
        try {
          if (req.op === "destroy") {
            db?.close();
            db = null;
            res = { id: req.id, ok: true };
          } else {
            db ??= createNodeSqliteExecutor();
            if (req.op === "exec") {
              await db.exec(req.sql, req.params);
              res = { id: req.id, ok: true };
            } else {
              const rows = await db.query<Record<string, never>>(req.sql, req.params);
              res = { id: req.id, ok: true, rows };
            }
          }
        } catch (e) {
          res = { id: req.id, ok: false, error: String(e) };
        }
        this.listener?.({ data: res });
      })();
    }
    addEventListener(type: string, listener: (e: never) => void) {
      if (type === "message") this.listener = listener as never;
    }
    terminate() {}
  }

  vi.stubGlobal("Worker", FakeWorker);
  return { requests, spawned: () => spawned, hasDb: () => db !== null };
}

describe("web local store adapter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_PULSE_E2EE", "1");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("stores and reads data through the worker protocol", async () => {
    installFakeWorker();
    const { getLocalStore } = await import("./index");
    const store = await getLocalStore();
    expect(store).not.toBeNull();
    await store!.upsertMessages([msg]);
    expect((await store!.listMessages("c1")).map((m) => m.body)).toEqual(["secret"]);
  });

  it("logout deletes the local database", async () => {
    const fake = installFakeWorker();
    const { getLocalStore, deleteLocalDatabase } = await import("./index");
    const store = await getLocalStore();
    await store!.upsertMessages([msg]);
    expect(await store!.countMessages("c1")).toBe(1);

    await deleteLocalDatabase();

    expect(fake.requests.some((r) => r.op === "destroy")).toBe(true);
    expect(fake.hasDb()).toBe(false);
    const fresh = await getLocalStore();
    expect(fake.spawned()).toBe(2);
    expect(await fresh!.countMessages("c1")).toBe(0);
  });

  it("does nothing and opens no worker when the flag is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_PULSE_E2EE", "");
    const fake = installFakeWorker();
    const { getLocalStore, deleteLocalDatabase } = await import("./index");
    expect(await getLocalStore()).toBeNull();
    await deleteLocalDatabase();
    expect(fake.spawned()).toBe(0);
  });
});
