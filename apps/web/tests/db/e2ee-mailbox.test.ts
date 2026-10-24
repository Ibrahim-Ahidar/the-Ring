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

type Actor = { id: string; rpc: PgliteRpcClient; device: string };

async function actor(name: string): Promise<Actor> {
  const user = await createUser(db, { username: name });
  const rpc = createRpcClient(db, user.id);
  const device = randomUUID();
  const res = await rpc.rpc("register_device", {
    p_device_id: device,
    p_name: "Laptop",
    p_platform: "web",
    p_identity_key: `idk-${device}`,
    p_signing_key: `sgk-${device}`,
    p_account_signing_key: "account-key",
  });
  expect(res.error).toBeNull();
  return { id: user.id, rpc, device };
}

async function addDevice(a: Actor): Promise<string> {
  const device = randomUUID();
  const res = await a.rpc.rpc("register_device", {
    p_device_id: device,
    p_name: "Phone",
    p_platform: "ios",
    p_identity_key: `idk-${device}`,
    p_signing_key: `sgk-${device}`,
  });
  expect(res.error).toBeNull();
  return device;
}

async function share(a: Actor, b: Actor): Promise<string> {
  const conv = randomUUID();
  await asSuperuser(db, `insert into public.conversations (id, type) values ($1, 'direct')`, [conv]);
  for (const u of [a, b]) {
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id) values ($1, $2)`,
      [conv, u.id],
    );
  }
  return conv;
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");

function env(from: Actor, to: string, text: string, extra: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    recipient_device_id: to,
    sender_device_id: from.device,
    kind: 0,
    ciphertext: b64(text),
    ...extra,
  };
}

type SendRow = { id: string; status: string };
type FetchRow = { seq: number; id: string; ciphertext: string; sender_user_id: string };

async function send(from: Actor, batch: unknown[]) {
  const res = await from.rpc.rpc("send_envelopes", { p_batch: batch });
  return { ...res, rows: (res.data ?? []) as SendRow[] };
}

async function fetchBox(who: Actor, device: string, after = 0, limit = 500) {
  const res = await who.rpc.rpc("fetch_mailbox", {
    p_device_id: device,
    p_after: after,
    p_limit: limit,
  });
  return { ...res, rows: (res.data ?? []) as FetchRow[] };
}

describe("mailbox transport (issue #225)", () => {
  it("delivers to a peer device and the payload round-trips", async () => {
    const a = await actor("mb_a1");
    const b = await actor("mb_b1");
    const conv = await share(a, b);
    const e = env(a, b.device, '{"body":"hi"}', { conversation_id: conv });
    const sent = await send(a, [e]);
    expect(sent.error).toBeNull();
    expect(sent.rows).toEqual([{ id: e.id, status: "sent" }]);
    const got = await fetchBox(b, b.device);
    expect(got.rows).toHaveLength(1);
    expect(Buffer.from(got.rows[0]!.ciphertext, "base64").toString()).toBe('{"body":"hi"}');
    expect(got.rows[0]!.sender_user_id).toBe(a.id);
  });

  it("lets a user send to their own other device without a conversation", async () => {
    const a = await actor("mb_self");
    const phone = await addDevice(a);
    expect((await send(a, [env(a, phone, "x")])).rows[0]!.status).toBe("sent");
    expect((await fetchBox(a, phone)).rows).toHaveLength(1);
    expect((await fetchBox(a, a.device)).rows).toHaveLength(0);
  });

  it("forbids sending to a user with no shared conversation or request", async () => {
    const a = await actor("mb_a2");
    const stranger = await actor("mb_stranger");
    const res = await send(a, [env(a, stranger.device, "x")]);
    expect(res.rows[0]!.status).toBe("forbidden");
    expect((await fetchBox(stranger, stranger.device)).rows).toHaveLength(0);
  });

  it("allows a pending message request but not a declined one", async () => {
    const a = await actor("mb_a3");
    const b = await actor("mb_b3");
    await asSuperuser(
      db,
      `insert into public.message_requests (from_user_id, to_user_id, status) values ($1, $2, 'pending')`,
      [a.id, b.id],
    );
    expect((await send(a, [env(a, b.device, "x")])).rows[0]!.status).toBe("sent");
    await asSuperuser(db, `update public.message_requests set status = 'declined' where from_user_id = $1`, [a.id]);
    expect((await send(a, [env(a, b.device, "y")])).rows[0]!.status).toBe("forbidden");
  });

  it("rejects a conversation id the pair does not share", async () => {
    const a = await actor("mb_a4");
    const b = await actor("mb_b4");
    const c = await actor("mb_c4");
    await share(a, b);
    const other = await share(a, c);
    const res = await send(a, [env(a, b.device, "x", { conversation_id: other })]);
    expect(res.rows[0]!.status).toBe("forbidden");
  });

  it("enforces blocks in both directions and keeps the rest of the batch", async () => {
    const a = await actor("mb_a5");
    const b = await actor("mb_b5");
    const c = await actor("mb_c5");
    await share(a, b);
    await share(a, c);
    await asSuperuser(db, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [b.id, a.id]);
    const res = await send(a, [env(a, b.device, "x"), env(a, c.device, "y")]);
    expect(res.rows.map((r) => r.status)).toEqual(["blocked", "sent"]);
    // The blocker cannot send to the blocked user either.
    const back = await send(b, [env(b, a.device, "z")]);
    expect(back.rows[0]!.status).toBe("blocked");
    expect((await fetchBox(b, b.device)).rows).toHaveLength(0);
  });

  it("refuses a sender device that is not the caller's", async () => {
    const a = await actor("mb_a6");
    const b = await actor("mb_b6");
    await share(a, b);
    const res = await send(a, [env(a, b.device, "x", { sender_device_id: b.device })]);
    expect(res.error?.message).toContain("e2ee.device_not_found");
  });

  it("deduplicates a resend by mailbox id", async () => {
    const a = await actor("mb_a7");
    const b = await actor("mb_b7");
    await share(a, b);
    const e = env(a, b.device, "once");
    expect((await send(a, [e])).rows[0]!.status).toBe("sent");
    expect((await send(a, [e])).rows[0]!.status).toBe("duplicate");
    expect((await fetchBox(b, b.device)).rows).toHaveLength(1);
    // Another user cannot overwrite or probe somebody else's mailbox id.
    const c = await actor("mb_c7");
    await share(c, b);
    expect((await send(c, [{ ...env(c, b.device, "evil"), id: e.id }])).rows[0]!.status).toBe(
      "forbidden",
    );
  });

  it("a device reads only its own rows, via RPC and via the table", async () => {
    const a = await actor("mb_a8");
    const b = await actor("mb_b8");
    await share(a, b);
    await send(a, [env(a, b.device, "secret")]);
    const peek = await fetchBox(a, b.device);
    expect(peek.error?.message).toContain("e2ee.device_not_found");
    const direct = await asUser<{ rows: unknown[] }>(db, a.id, "select * from public.mailbox");
    expect(direct.rows).toHaveLength(0);
    const own = await asUser<{ rows: unknown[] }>(db, b.id, "select * from public.mailbox");
    expect(own.rows).toHaveLength(1);
    const ack = await a.rpc.rpc("ack_envelopes", { p_device_id: b.device, p_ids: [randomUUID()] });
    expect(ack.error?.message).toContain("e2ee.device_not_found");
  });

  it("clients cannot insert, update or delete mailbox rows directly", async () => {
    const a = await actor("mb_a9");
    const b = await actor("mb_b9");
    await share(a, b);
    await expect(
      asUser(
        db,
        a.id,
        `insert into public.mailbox (id, recipient_device_id, sender_user_id, ciphertext)
         values (gen_random_uuid(), $1, $2, 'x'::bytea)`,
        [b.device, a.id],
      ),
    ).rejects.toThrow();
    await expect(asUser(db, b.id, "delete from public.mailbox")).rejects.toThrow();
  });

  it("pages 1200 rows in creation order, 500 at a time", async () => {
    const a = await actor("mb_a10");
    const b = await actor("mb_b10");
    await share(a, b);
    const ids: string[] = [];
    for (let start = 0; start < 1200; start += 100) {
      const batch = Array.from({ length: 100 }, (_, i) => {
        const e = env(a, b.device, `m${start + i}`);
        ids.push(e.id);
        return e;
      });
      const res = await send(a, batch);
      expect(res.error).toBeNull();
    }
    const seen: string[] = [];
    let after = 0;
    const sizes: number[] = [];
    for (;;) {
      const page = await fetchBox(b, b.device, after);
      expect(page.error).toBeNull();
      if (page.rows.length === 0) break;
      sizes.push(page.rows.length);
      seen.push(...page.rows.map((r) => r.id));
      after = page.rows[page.rows.length - 1]!.seq;
    }
    expect(sizes).toEqual([500, 500, 200]);
    expect(seen).toEqual(ids);
    // Asking for more than 500 is capped.
    expect((await fetchBox(b, b.device, 0, 5000)).rows).toHaveLength(500);
  }, 120_000);

  it("ack empties the mailbox once every device has acked", async () => {
    const a = await actor("mb_a11");
    const b = await actor("mb_b11");
    const b2 = await addDevice(b);
    await share(a, b);
    const e1 = env(a, b.device, "m");
    const e2 = { ...env(a, b2, "m") };
    await send(a, [e1, e2]);
    expect((await b.rpc.rpc("ack_envelopes", { p_device_id: b.device, p_ids: [e1.id, e2.id] })).data).toBe(1);
    const left = await asSuperuser<{ rows: { n: number }[] }>(db, "select count(*)::int as n from public.mailbox where sender_user_id = $1", [a.id]);
    expect(left.rows[0]!.n).toBe(1);
    expect((await b.rpc.rpc("ack_envelopes", { p_device_id: b2, p_ids: [e2.id] })).data).toBe(1);
    const none = await asSuperuser<{ rows: { n: number }[] }>(db, "select count(*)::int as n from public.mailbox where sender_user_id = $1", [a.id]);
    expect(none.rows[0]!.n).toBe(0);
    expect((await fetchBox(b, b.device)).rows).toHaveLength(0);
  });

  it("removing a device drops its rows; expiry cleanup deletes old rows", async () => {
    const a = await actor("mb_a12");
    const b = await actor("mb_b12");
    const b2 = await addDevice(b);
    await share(a, b);
    const old = env(a, b.device, "old");
    await send(a, [old, env(a, b2, "gone")]);
    await asSuperuser(db, `update public.mailbox set expires_at = now() - interval '1 day' where id = $1`, [old.id]);
    expect((await fetchBox(b, b.device)).rows).toHaveLength(0); // expired rows are not served
    const cleaned = await asSuperuser<{ rows: { n: number }[] }>(db, "select public.cleanup_expired_mailbox() as n");
    expect(cleaned.rows[0]!.n).toBeGreaterThanOrEqual(1);
    expect((await b.rpc.rpc("remove_device", { p_device_id: b2 })).error).toBeNull();
    const rest = await asSuperuser<{ rows: { n: number }[] }>(db, "select count(*)::int as n from public.mailbox where recipient_device_id = $1", [b2]);
    expect(rest.rows[0]!.n).toBe(0);
  });

  it("realtime topic rules: join own devices only, send to reachable users only", async () => {
    const a = await actor("mb_a13");
    const b = await actor("mb_b13");
    const c = await actor("mb_c13");
    await share(a, b);
    const q = async (u: Actor, fn: string, device: string) =>
      (await asUser<{ rows: { ok: boolean }[] }>(db, u.id, `select public.${fn}($1) as ok`, [`device:${device}`])).rows[0]!.ok;
    expect(await q(a, "mailbox_can_join_topic", a.device)).toBe(true);
    expect(await q(a, "mailbox_can_join_topic", b.device)).toBe(false);
    expect(await q(a, "mailbox_can_send_topic", b.device)).toBe(true);
    expect(await q(a, "mailbox_can_send_topic", c.device)).toBe(false);
    await asSuperuser(db, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [b.id, a.id]);
    expect(await q(a, "mailbox_can_send_topic", b.device)).toBe(false);
    const bad = (await asUser<{ rows: { ok: boolean }[] }>(db, a.id, `select public.mailbox_can_join_topic('device:nope') as ok`)).rows[0]!.ok;
    expect(bad).toBe(false);
  });
});
