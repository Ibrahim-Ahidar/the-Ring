import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, asUser, createTestDb, createUser } from "./pglite";
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

async function register(rpc: PgliteRpcClient, id: string = randomUUID(), name = "Laptop") {
  const res = await rpc.rpc("register_device", {
    p_device_id: id,
    p_name: name,
    p_platform: "web",
    p_identity_key: `idk-${id}`,
    p_signing_key: `sgk-${id}`,
    p_account_signature: "sig",
    p_account_signing_key: "account-key",
  });
  return { id, res };
}

function keys(prefix: string, n: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    out[`${prefix}${String(i).padStart(3, "0")}`] = `pub-${prefix}-${i}`;
  }
  return out;
}

describe("e2ee device registry (issue #223)", () => {
  it("registers a device idempotently and lists it", async () => {
    const u = await newUser("dev_list");
    const { id, res } = await register(u.rpc);
    expect(res.error).toBeNull();
    expect((await register(u.rpc, id, "Renamed")).res.error).toBeNull();
    const list = await u.rpc.rpc("list_devices", {});
    const rows = list.data as { id: string; name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id, name: "Renamed" });
  });

  it("refuses a sixth device with a clear message", async () => {
    const u = await newUser("dev_limit");
    for (let i = 0; i < 5; i++) {
      expect((await register(u.rpc)).res.error).toBeNull();
    }
    const sixth = await register(u.rpc);
    expect(sixth.res.error?.message).toContain("e2ee.device_limit");
    const count = await asSuperuser<{ rows: { n: number }[] }>(
      db,
      "select count(*)::int as n from public.e2ee_devices where user_id = $1",
      [u.id],
    );
    expect(count.rows[0]!.n).toBe(5);
    // Re-registering an existing device is still fine at the limit.
    const existing = await u.rpc.rpc("list_devices", {});
    const first = (existing.data as { id: string }[])[0]!.id;
    expect((await register(u.rpc, first)).res.error).toBeNull();
  });

  it("does not let another user take a device id", async () => {
    const a = await newUser("dev_owner");
    const b = await newUser("dev_thief");
    const { id } = await register(a.rpc);
    const stolen = await register(b.rpc, id);
    expect(stolen.res.error?.message).toContain("e2ee.device_taken");
  });

  it("remove_device deletes the keys and ends the device session", async () => {
    const u = await newUser("dev_remove");
    const sessionId = randomUUID();
    await asSuperuser(db, "insert into auth.sessions (id, user_id) values ($1, $2)", [
      sessionId,
      u.id,
    ]);
    const rpc = createRpcClient(db, u.id, { session_id: sessionId });
    const { id } = await register(rpc);
    expect((await rpc.rpc("upload_keys", { p_device_id: id, p_one_time_keys: keys("a", 5) })).error).toBeNull();

    const current = await rpc.rpc("list_devices", {});
    expect((current.data as { is_current_session: boolean }[])[0]!.is_current_session).toBe(true);

    const removed = await rpc.rpc("remove_device", { p_device_id: id });
    expect(removed.error).toBeNull();

    const devices = await asSuperuser<{ rows: unknown[] }>(
      db,
      "select 1 from public.e2ee_devices where id = $1",
      [id],
    );
    const otks = await asSuperuser<{ rows: unknown[] }>(
      db,
      "select 1 from public.one_time_keys where device_id = $1",
      [id],
    );
    const sessions = await asSuperuser<{ rows: unknown[] }>(
      db,
      "select 1 from auth.sessions where id = $1",
      [sessionId],
    );
    expect(devices.rows).toHaveLength(0);
    expect(otks.rows).toHaveLength(0);
    expect(sessions.rows).toHaveLength(0);

    const again = await rpc.rpc("remove_device", { p_device_id: id });
    expect(again.error?.message).toContain("e2ee.device_not_found");
  });

  it("remove_device refuses other users' devices", async () => {
    const a = await newUser("dev_rm_a");
    const b = await newUser("dev_rm_b");
    const { id } = await register(a.rpc);
    const res = await b.rpc.rpc("remove_device", { p_device_id: id });
    expect(res.error?.message).toContain("e2ee.device_not_found");
  });

  it("caps stored one-time keys at 50 and reports the count", async () => {
    const u = await newUser("dev_cap");
    const { id } = await register(u.rpc);
    const first = await u.rpc.rpc("upload_keys", { p_device_id: id, p_one_time_keys: keys("a", 40) });
    expect(first.data).toBe(40);
    const second = await u.rpc.rpc("upload_keys", { p_device_id: id, p_one_time_keys: keys("b", 40) });
    expect(second.data).toBe(50);
    const count = await u.rpc.rpc("one_time_key_count", { p_device_id: id });
    expect(count.data).toBe(50);
  });

  it("claim_keys never returns the same one-time key twice", async () => {
    const owner = await newUser("dev_claim_owner");
    const c1 = await newUser("dev_claimer1");
    const c2 = await newUser("dev_claimer2");
    const { id } = await register(owner.rpc);
    await owner.rpc.rpc("upload_keys", {
      p_device_id: id,
      p_one_time_keys: keys("k", 6),
      p_fallback_key: { fb1: "fallback-pub" },
    });

    const seen: string[] = [];
    // Sequential claims from different users.
    for (const rpc of [c1.rpc, c2.rpc, c1.rpc]) {
      const res = await rpc.rpc("claim_keys", { p_device_ids: [id] });
      const rows = res.data as { key_id: string; is_fallback: boolean }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.is_fallback).toBe(false);
      seen.push(rows[0]!.key_id);
    }
    // One call that asks for the same device three times (a single statement,
    // the closest PGlite gets to concurrent claims on one connection).
    const batch = await c2.rpc.rpc("claim_keys", { p_device_ids: [id, id, id] });
    for (const row of batch.data as { key_id: string; is_fallback: boolean }[]) {
      expect(row.is_fallback).toBe(false);
      seen.push(row.key_id);
    }
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);

    // Out of one-time keys: falls back to the fallback key, which is reusable.
    for (let i = 0; i < 2; i++) {
      const res = await c1.rpc.rpc("claim_keys", { p_device_ids: [id] });
      const rows = res.data as { key_id: string; public_key: string; is_fallback: boolean }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key_id: "fb1", public_key: "fallback-pub", is_fallback: true });
    }
  });

  it("claim_keys returns nothing for a device with no keys at all", async () => {
    const owner = await newUser("dev_nokeys");
    const { id } = await register(owner.rpc);
    const res = await owner.rpc.rpc("claim_keys", { p_device_ids: [id] });
    expect(res.error).toBeNull();
    expect(res.data).toEqual([]);
  });

  it("cleanup_inactive_devices removes devices inactive for more than 30 days", async () => {
    const u = await newUser("dev_cleanup");
    const stale = (await register(u.rpc, randomUUID(), "Stale")).id;
    const fresh = (await register(u.rpc, randomUUID(), "Fresh")).id;
    await u.rpc.rpc("upload_keys", { p_device_id: stale, p_one_time_keys: keys("s", 3) });
    await asSuperuser(
      db,
      "update public.e2ee_devices set last_seen_at = now() - interval '31 days' where id = $1",
      [stale],
    );
    await asSuperuser(
      db,
      "update public.e2ee_devices set last_seen_at = now() - interval '29 days' where id = $1",
      [fresh],
    );

    const res = await asSuperuser<{ rows: { n: number }[] }>(
      db,
      "select public.cleanup_inactive_devices(30) as n",
    );
    expect(res.rows[0]!.n).toBe(1);

    const left = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      "select id from public.e2ee_devices where user_id = $1",
      [u.id],
    );
    expect(left.rows.map((r) => r.id)).toEqual([fresh]);
    const otks = await asSuperuser<{ rows: unknown[] }>(
      db,
      "select 1 from public.one_time_keys where device_id = $1",
      [stale],
    );
    expect(otks.rows).toHaveLength(0);
  });

  it("cleanup_inactive_devices is not callable by users", async () => {
    const u = await newUser("dev_cleanup_deny");
    const res = await u.rpc.rpc("cleanup_inactive_devices", {});
    expect(res.error?.message).toMatch(/permission denied/);
  });

  it("only exposes own devices through the table; keys are never readable", async () => {
    const a = await newUser("dev_rls_a");
    const b = await newUser("dev_rls_b");
    const { id } = await register(a.rpc);
    await a.rpc.rpc("upload_keys", { p_device_id: id, p_one_time_keys: keys("r", 2) });
    const seenByB = await asUser<{ rows: unknown[] }>(db, b.id, "select * from public.e2ee_devices");
    expect(seenByB.rows).toHaveLength(0);
    const keysSeen = await asUser<{ rows: unknown[] }>(db, a.id, "select * from public.one_time_keys");
    expect(keysSeen.rows).toHaveLength(0);
    await expect(
      asUser(db, a.id, "delete from public.e2ee_devices where id = $1", [id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("list_devices shows other users' devices only when a conversation is shared", async () => {
    const a = await newUser("dev_share_a");
    const b = await newUser("dev_share_b");
    const { id } = await register(b.rpc);
    const before = await a.rpc.rpc("list_devices", { p_user_ids: [b.id] });
    expect(before.data).toEqual([]);

    const convId = randomUUID();
    await asSuperuser(db, "insert into public.conversations (id, type) values ($1, 'group')", [convId]);
    await asSuperuser(
      db,
      "insert into public.conversation_members (conversation_id, user_id) values ($1, $2), ($1, $3)",
      [convId, a.id, b.id],
    );
    const after = await a.rpc.rpc("list_devices", { p_user_ids: [b.id] });
    const rows = after.data as { id: string; name: string | null; last_seen_at: string | null }[];
    expect(rows.map((r) => r.id)).toEqual([id]);
    expect(rows[0]!.name).toBeNull();
    expect(rows[0]!.last_seen_at).toBeNull();
  });
});
