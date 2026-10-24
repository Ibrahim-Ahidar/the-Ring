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

async function newUser(name: string) {
  const user = await createUser(db, { username: name });
  return { ...user, rpc: createRpcClient(db, user.id) };
}

/** An rpc client whose JWT carries a session id, like a real device session. */
function onSession(userId: string, sessionId: string): PgliteRpcClient {
  return createRpcClient(db, userId, { session_id: sessionId });
}

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
  const u = await newUser(name);
  const sid = await seedSession(u.id);
  const rpc = onSession(u.id, sid);
  const id = randomUUID();
  const res = await fresh(rpc, id);
  expect(res.data).toBe("registered");
  return { ...u, rpc, sid, deviceId: id };
}

describe("e2ee device approval (issue #224)", () => {
  it("registers the first device straight away", async () => {
    const a = await firstDevice("appr_first");
    const keys = await asSuperuser<{ rows: { version: number }[] }>(
      db,
      "select version from public.account_keys where user_id = $1",
      [a.id],
    );
    expect(keys.rows[0]!.version).toBe(1);
  });

  it("puts a second device in pending and hides it from lists and key claims", async () => {
    const a = await firstDevice("appr_pending");
    const sid2 = await seedSession(a.id);
    const rpc2 = onSession(a.id, sid2);
    const id2 = randomUUID();
    expect((await fresh(rpc2, id2)).data).toBe("pending");

    const list = await a.rpc.rpc("list_devices", {});
    expect((list.data as { id: string }[]).map((d) => d.id)).toEqual([a.deviceId]);
    const claim = await a.rpc.rpc("claim_keys", { p_device_ids: [id2] });
    expect(claim.data).toEqual([]);
    expect((await rpc2.rpc("device_approval_status", { p_device_id: id2 })).data).toBe("pending");
  });

  it("lets only an approved device list pending requests, then approve", async () => {
    const a = await firstDevice("appr_allow");
    const sid2 = await seedSession(a.id);
    const rpc2 = onSession(a.id, sid2);
    const id2 = randomUUID();
    await fresh(rpc2, id2);

    // The pending device itself cannot see or approve requests.
    expect(((await rpc2.rpc("list_pending_devices", {})).data as unknown[]) ?? []).toHaveLength(0);
    const self = await rpc2.rpc("approve_device", { p_device_id: id2, p_account_signature: "x" });
    expect(self.error?.message).toContain("e2ee.not_approved_device");

    const pending = await a.rpc.rpc("list_pending_devices", {});
    expect((pending.data as { id: string }[]).map((d) => d.id)).toEqual([id2]);

    const ok = await a.rpc.rpc("approve_device", { p_device_id: id2, p_account_signature: "sig2" });
    expect(ok.error).toBeNull();
    expect((await rpc2.rpc("device_approval_status", { p_device_id: id2 })).data).toBe("approved");
    const list = await a.rpc.rpc("list_devices", {});
    expect(list.data as unknown[]).toHaveLength(2);
    // Approving twice finds nothing pending.
    const again = await a.rpc.rpc("approve_device", { p_device_id: id2, p_account_signature: "s" });
    expect(again.error?.message).toContain("e2ee.device_not_found");
  });

  it("deny removes the pending device and its session", async () => {
    const a = await firstDevice("appr_deny");
    const sid2 = await seedSession(a.id);
    const rpc2 = onSession(a.id, sid2);
    const id2 = randomUUID();
    await fresh(rpc2, id2);
    expect((await a.rpc.rpc("deny_device", { p_device_id: id2 })).error).toBeNull();
    expect((await rpc2.rpc("device_approval_status", { p_device_id: id2 })).data).toBe("gone");
    const s = await asSuperuser<{ rows: unknown[] }>(db, "select 1 from auth.sessions where id = $1", [sid2]);
    expect(s.rows).toHaveLength(0);
  });

  it("does not let another user approve or see requests", async () => {
    const a = await firstDevice("appr_owner");
    const b = await firstDevice("appr_other");
    const sid2 = await seedSession(a.id);
    const id2 = randomUUID();
    await fresh(onSession(a.id, sid2), id2);
    const res = await b.rpc.rpc("approve_device", { p_device_id: id2, p_account_signature: "x" });
    expect(res.error?.message).toContain("e2ee.device_not_found");
    expect((await b.rpc.rpc("list_pending_devices", {})).data).toEqual([]);
  });

  it("refuses plain register_device for a new device once the account has devices", async () => {
    const a = await firstDevice("appr_bypass");
    const res = await a.rpc.rpc("register_device", {
      p_device_id: randomUUID(),
      p_name: "Sneaky",
      p_platform: "web",
      p_identity_key: "i",
      p_signing_key: "s",
    });
    expect(res.error?.message).toContain("e2ee.approval_required");
  });

  it("replaces the account key and signs out older devices when approval is off", async () => {
    const a = await firstDevice("appr_off");
    expect((await a.rpc.rpc("set_device_approval", { p_required: false })).error).toBeNull();
    const sid2 = await seedSession(a.id);
    const rpc2 = onSession(a.id, sid2);
    const id2 = randomUUID();
    expect((await fresh(rpc2, id2)).data).toBe("replaced");

    const keys = await asSuperuser<{ rows: { version: number; signing_key: string }[] }>(
      db,
      "select version, signing_key from public.account_keys where user_id = $1",
      [a.id],
    );
    expect(keys.rows[0]).toMatchObject({ version: 2, signing_key: `account-${id2}` });
    const devs = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      "select id from public.e2ee_devices where user_id = $1",
      [a.id],
    );
    expect(devs.rows.map((r) => r.id)).toEqual([id2]);
    const sessions = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      "select id from auth.sessions where user_id = $1",
      [a.id],
    );
    expect(sessions.rows.map((r) => r.id)).toContain(sid2);
    expect(sessions.rows.map((r) => r.id)).not.toContain(a.sid);
    const versions = await rpc2.rpc("account_key_versions", {});
    expect(versions.data).toEqual([{ user_id: a.id, version: 2 }]);
  });

  it("replaces on the I lost my devices path even with approval on", async () => {
    const a = await firstDevice("appr_lost");
    const sid2 = await seedSession(a.id);
    const id2 = randomUUID();
    const res = await fresh(onSession(a.id, sid2), id2, { p_lost_devices: true });
    expect(res.data).toBe("replaced");
    const keys = await asSuperuser<{ rows: { version: number }[] }>(
      db,
      "select version from public.account_keys where user_id = $1",
      [a.id],
    );
    expect(keys.rows[0]!.version).toBe(2);
  });

  it("replace_account_key bumps the version and removes older devices", async () => {
    const a = await firstDevice("appr_rak");
    const sid2 = await seedSession(a.id);
    const id2 = randomUUID();
    const res = await onSession(a.id, sid2).rpc("replace_account_key", {
      p_device_id: id2,
      p_name: "Phone",
      p_platform: "web",
      p_identity_key: `idk-${id2}`,
      p_signing_key: `sgk-${id2}`,
      p_account_signature: "sig",
      p_account_signing_key: `account-${id2}`,
    });
    expect(res.data).toBe("replaced");
    const keys = await asSuperuser<{ rows: { version: number }[] }>(
      db,
      "select version from public.account_keys where user_id = $1",
      [a.id],
    );
    expect(keys.rows[0]!.version).toBe(2);
    const devs = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      "select id from public.e2ee_devices where user_id = $1",
      [a.id],
    );
    expect(devs.rows.map((r) => r.id)).toEqual([id2]);
  });

  it("shares account key versions only with conversation contacts", async () => {
    const a = await firstDevice("appr_ver_a");
    const b = await firstDevice("appr_ver_b");
    const none = await a.rpc.rpc("account_key_versions", { p_user_ids: [b.id] });
    expect(none.data).toEqual([]);
    const conv = randomUUID();
    await asSuperuser(db, "insert into public.conversations (id, type, title) values ($1, 'group', 'x')", [conv]);
    await asSuperuser(
      db,
      "insert into public.conversation_members (conversation_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')",
      [conv, a.id, b.id],
    );
    const some = await a.rpc.rpc("account_key_versions", { p_user_ids: [b.id] });
    expect(some.data).toEqual([{ user_id: b.id, version: 1 }]);
  });

  it("keeps the five device cap on the approval path", async () => {
    const a = await firstDevice("appr_cap");
    for (let i = 0; i < 4; i++) {
      const sid = await seedSession(a.id);
      expect((await fresh(onSession(a.id, sid), randomUUID())).data).toBe("pending");
    }
    const sid = await seedSession(a.id);
    const sixth = await fresh(onSession(a.id, sid), randomUUID());
    expect(sixth.error?.message).toContain("e2ee.device_limit");
  });
});
