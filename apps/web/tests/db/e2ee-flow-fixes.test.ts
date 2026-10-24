import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, createTestDb, createUser } from "./pglite";
import { createRpcClient, type PgliteRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

async function seedSession(userId: string): Promise<string> {
  const id = randomUUID();
  await asSuperuser(db, "insert into auth.sessions (id, user_id) values ($1, $2)", [id, userId]);
  return id;
}

function fresh(rpc: PgliteRpcClient, id: string, extra: Record<string, unknown> = {}) {
  return rpc.rpc("add_fresh_device", {
    p_device_id: id,
    p_name: `Device ${id.slice(0, 4)}`,
    p_platform: "web",
    p_identity_key: `idk-${id}`,
    p_signing_key: `sgk-${id}`,
    p_account_signature: "sig",
    p_account_signing_key: `account-${id}`,
    p_lost_devices: false,
    ...extra,
  });
}

async function firstDevice(name: string) {
  const u = await createUser(db, { username: name });
  const sid = await seedSession(u.id);
  const rpc = createRpcClient(db, u.id, { session_id: sid });
  const deviceId = randomUUID();
  expect((await fresh(rpc, deviceId)).data).toBe("registered");
  return { ...u, rpc, sid, deviceId };
}

async function keyRow(userId: string) {
  const r = await asSuperuser<{ rows: { version: number; signing_key: string }[] }>(
    db,
    "select version, signing_key from public.account_keys where user_id = $1",
    [userId],
  );
  return r.rows[0]!;
}

describe("e2ee flow fixes (issue #251)", () => {
  it("a pending device can read its own row, and nobody else's", async () => {
    const a = await firstDevice("fix_own");
    const sid2 = await seedSession(a.id);
    const rpc2 = createRpcClient(db, a.id, { session_id: sid2 });
    const pendingId = randomUUID();
    expect((await fresh(rpc2, pendingId)).data).toBe("pending");

    // list_devices still hides it (approved only) ...
    const list = await rpc2.rpc("list_devices", {});
    expect((list.data as { id: string }[]).map((d) => d.id)).not.toContain(pendingId);
    // ... but the device finds itself for linking.
    const mine = await rpc2.rpc("get_own_device", { p_device_id: pendingId });
    expect(mine.error).toBeNull();
    expect(mine.data).toEqual([
      expect.objectContaining({
        id: pendingId,
        platform: "web",
        identity_key: `idk-${pendingId}`,
        signing_key: `sgk-${pendingId}`,
        approval_status: "pending",
      }),
    ]);

    const other = await firstDevice("fix_own_other");
    const peek = await other.rpc.rpc("get_own_device", { p_device_id: pendingId });
    expect(peek.data).toEqual([]);
  });

  it("approve_device rejects a JWT without a session id", async () => {
    const a = await firstDevice("fix_nosid");
    const sid2 = await seedSession(a.id);
    const pendingId = randomUUID();
    expect((await fresh(createRpcClient(db, a.id, { session_id: sid2 }), pendingId)).data).toBe(
      "pending",
    );
    const noSession = createRpcClient(db, a.id);
    const res = await noSession.rpc("approve_device", {
      p_device_id: pendingId,
      p_account_signature: "sig",
    });
    expect(res.error?.message).toContain("e2ee.not_approved_device");
    const denied = await noSession.rpc("deny_device", { p_device_id: pendingId });
    expect(denied.error?.message).toContain("e2ee.not_approved_device");
    // With the approved device's session it still works.
    const ok = await a.rpc.rpc("approve_device", {
      p_device_id: pendingId,
      p_account_signature: "sig",
    });
    expect(ok.error).toBeNull();
  });

  it("a fresh device with no approved device left replaces the key and bumps the version", async () => {
    const a = await firstDevice("fix_bump");
    expect((await keyRow(a.id)).version).toBe(1);
    await asSuperuser(db, "delete from public.e2ee_devices where user_id = $1", [a.id]);
    const sid2 = await seedSession(a.id);
    const id2 = randomUUID();
    expect((await fresh(createRpcClient(db, a.id, { session_id: sid2 }), id2)).data).toBe(
      "registered",
    );
    expect(await keyRow(a.id)).toMatchObject({ version: 2, signing_key: `account-${id2}` });
  });

  it("re-registering with the same account key does not bump the version", async () => {
    const a = await firstDevice("fix_same");
    await asSuperuser(db, "delete from public.e2ee_devices where user_id = $1", [a.id]);
    const sid2 = await seedSession(a.id);
    const id2 = randomUUID();
    await fresh(createRpcClient(db, a.id, { session_id: sid2 }), id2, {
      p_account_signing_key: `account-${a.deviceId}`,
    });
    expect((await keyRow(a.id)).version).toBe(1);
  });

  it("replace_account_key raises platform.unauthenticated with errcode P0001", async () => {
    // Superuser bypasses the execute grant, so the in-function auth check is what rejects the call.
    await asSuperuser(db, "select set_config('request.jwt.claims', '{}', false)");
    const res = await db
      .query("select public.replace_account_key($1::uuid, 'x', 'web', 'i', 's')", [randomUUID()])
      .then(
        () => ({ message: "", code: "" }),
        (e: { message?: string; code?: string }) => ({ message: e.message ?? "", code: e.code ?? "" }),
      );
    expect(res.message).toContain("platform.unauthenticated");
    expect(res.code).toBe("P0001");
  });
});
