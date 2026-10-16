import type { PGliteInterface } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, createUser, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

/** The PGlite harness returns the row; the jsonb sits under the function name. */
function body(data: unknown): unknown {
  const row = data as { identity_assert_access?: unknown } | null;
  return row && "identity_assert_access" in row ? row.identity_assert_access : data;
}
let member: TestUser;
let enrolled: TestUser;

async function session(userId: string): Promise<string> {
  const id = randomUUID();
  await db.query(`insert into auth.sessions (id, user_id) values ($1, $2)`, [id, userId]);
  return id;
}

async function device(userId: string, sessionId: string): Promise<string> {
  const deviceId = randomUUID();
  const rpc = createRpcClient(db, userId, { session_id: sessionId, aal: "aal2" });
  const r = await rpc.rpc("identity_upsert_device", { p_device_id: deviceId });
  expect(r.error).toBeNull();
  return deviceId;
}

beforeAll(async () => {
  db = await createTestDb();
  member = await createUser(db, { username: "access_member" });
  enrolled = await createUser(db, { username: "access_mfa" });
  await db.query(
    `insert into auth.mfa_factors (user_id, friendly_name, status) values ($1, 'Phone', 'verified')`,
    [enrolled.id],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("identity_assert_access", () => {
  it("reports an active session and device", async () => {
    const sid = await session(member.id);
    const did = await device(member.id, sid);
    const rpc = createRpcClient(db, member.id, { session_id: sid, aal: "aal1" });
    const r = await rpc.rpc("identity_assert_access", { p_device_id: did });
    expect(r.error).toBeNull();
    expect(body(r.data)).toEqual({ email_confirmed: true, mfa_required: false, device_active: true });
  });

  it("reports device_active false without a device id or for an unknown one", async () => {
    const sid = await session(member.id);
    const rpc = createRpcClient(db, member.id, { session_id: sid });
    const none = await rpc.rpc("identity_assert_access", {});
    expect(body(none.data)).toMatchObject({ device_active: false });
    const unknown = await rpc.rpc("identity_assert_access", { p_device_id: randomUUID() });
    expect(body(unknown.data)).toMatchObject({ device_active: false });
  });

  it("reports email_confirmed false for an unconfirmed address", async () => {
    const u = await createUser(db, { username: "access_unconfirmed" });
    await db.query(`update auth.users set email_confirmed_at = null where id = $1`, [u.id]);
    const sid = await session(u.id);
    const r = await createRpcClient(db, u.id, { session_id: sid }).rpc("identity_assert_access", {});
    expect(body(r.data)).toMatchObject({ email_confirmed: false });
  });

  it("refuses a deleted auth session", async () => {
    const sid = await session(member.id);
    await db.query(`delete from auth.sessions where id = $1`, [sid]);
    const r = await createRpcClient(db, member.id, { session_id: sid }).rpc(
      "identity_assert_access",
      {},
    );
    expect(r.error?.message).toContain("identity.session_revoked");
  });

  it("refuses a session whose device was revoked", async () => {
    const sid = await session(member.id);
    const did = await device(member.id, sid);
    await db.query(`update public.devices set revoked_at = now() where id = $1`, [did]);
    const r = await createRpcClient(db, member.id, { session_id: sid }).rpc(
      "identity_assert_access",
      { p_device_id: did },
    );
    expect(r.error?.message).toContain("identity.session_revoked");
  });

  it("reports device_active false for a revoked device on a different session", async () => {
    const sid = await session(member.id);
    const did = await device(member.id, sid);
    await db.query(`update public.devices set revoked_at = now(), session_id = null where id = $1`, [did]);
    const other = await session(member.id);
    const r = await createRpcClient(db, member.id, { session_id: other }).rpc(
      "identity_assert_access",
      { p_device_id: did },
    );
    expect(r.error).toBeNull();
    expect(body(r.data)).toMatchObject({ device_active: false });
  });

  it("does not report another member's device as active", async () => {
    const sid = await session(enrolled.id);
    const did = await device(enrolled.id, sid);
    const mine = await session(member.id);
    const r = await createRpcClient(db, member.id, { session_id: mine }).rpc(
      "identity_assert_access",
      { p_device_id: did },
    );
    expect(body(r.data)).toMatchObject({ device_active: false });
  });

  it("requires MFA step-up at aal1 and not at aal2", async () => {
    const sid = await session(enrolled.id);
    const aal1 = await createRpcClient(db, enrolled.id, { session_id: sid, aal: "aal1" }).rpc(
      "identity_assert_access",
      {},
    );
    expect(body(aal1.data)).toMatchObject({ mfa_required: true });
    const missing = await createRpcClient(db, enrolled.id, { session_id: sid }).rpc(
      "identity_assert_access",
      {},
    );
    expect(body(missing.data)).toMatchObject({ mfa_required: true });
    const aal2 = await createRpcClient(db, enrolled.id, { session_id: sid, aal: "aal2" }).rpc(
      "identity_assert_access",
      {},
    );
    expect(body(aal2.data)).toMatchObject({ mfa_required: false });
  });

  it("refuses an anonymous caller", async () => {
    const r = await createRpcClient(db, null).rpc("identity_assert_access", {});
    expect(r.error).not.toBeNull();
  });

  it("is executable by authenticated only", async () => {
    const q = (role: string) =>
      db.query<{ ok: boolean }>(
        `select has_function_privilege($1, 'public.identity_assert_access(uuid)', 'execute') as ok`,
        [role],
      );
    expect((await q("authenticated")).rows[0]?.ok).toBe(true);
    expect((await q("anon")).rows[0]?.ok).toBe(false);
  });
});
