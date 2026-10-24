import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asSuperuser, asUser, createTestDb, createUser } from "./pglite";
import { createRpcClient, type PgliteRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
  // PGlite has no realtime schema: stub realtime.send so we can see what the triggers send.
  await db.exec(`
    create schema if not exists realtime;
    create table realtime.sent (id bigserial primary key, payload jsonb, event text, topic text, is_private boolean);
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
    returns void language sql as $$ insert into realtime.sent (payload, event, topic, is_private) values (payload, event, topic, private) $$;
  `);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

type Actor = { id: string; rpc: PgliteRpcClient; device: string; sid: string };

async function actor(name: string): Promise<Actor> {
  const user = await createUser(db, { username: name });
  const sid = randomUUID();
  await asSuperuser(db, "insert into auth.sessions (id, user_id) values ($1, $2)", [sid, user.id]);
  const rpc = createRpcClient(db, user.id, { session_id: sid });
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
  return { id: user.id, rpc, device, sid };
}

async function share(a: Actor, b: Actor): Promise<void> {
  const conv = randomUUID();
  await asSuperuser(db, `insert into public.conversations (id, type) values ($1, 'direct')`, [conv]);
  for (const u of [a, b]) {
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id) values ($1, $2)`,
      [conv, u.id],
    );
  }
}

async function askFresh(a: Actor): Promise<string> {
  const device = randomUUID();
  const sid2 = randomUUID();
  await asSuperuser(db, "insert into auth.sessions (id, user_id) values ($1, $2)", [sid2, a.id]);
  const rpc2 = createRpcClient(db, a.id, { session_id: sid2 });
  const asked = await rpc2.rpc("add_fresh_device", {
    p_device_id: device,
    p_name: "Phone",
    p_platform: "ios",
    p_identity_key: `idk-${device}`,
    p_signing_key: `sgk-${device}`,
  });
  expect(asked.error).toBeNull();
  expect(asked.data).toBe("pending");
  return device;
}

type Sent = { topic: string; event: string; is_private: boolean; payload: Record<string, unknown> };

async function sentFor(userId: string): Promise<Sent[]> {
  const r = await asSuperuser<{ rows: Sent[] }>(
    db,
    `select topic, event, is_private, payload from realtime.sent
     where payload ->> 'userId' = $1 order by id`,
    [userId],
  );
  return r.rows;
}

const clear = () => asSuperuser(db, "delete from realtime.sent");

describe("devices_changed is sent by the server (issue #254)", () => {
  it("approving a device notifies each contact and the user, not strangers", async () => {
    const a = await actor("dc_a1");
    const b = await actor("dc_b1");
    const c = await actor("dc_c1");
    const stranger = await actor("dc_s1");
    await share(a, b);
    await share(a, c);
    await clear();
    const pending = await askFresh(a);
    expect(await sentFor(a.id)).toHaveLength(0); // asking is not a change yet

    const ok = await a.rpc.rpc("approve_device", { p_device_id: pending, p_account_signature: "sig" });
    expect(ok.error).toBeNull();

    const sent = await sentFor(a.id);
    expect(sent.map((m) => m.topic).sort()).toEqual(
      [`devices:${a.id}`, `devices:${b.id}`, `devices:${c.id}`].sort(),
    );
    for (const m of sent) {
      expect(m.event).toBe("devices_changed");
      expect(m.is_private).toBe(true);
      expect(m.payload.kind).toBe("device_changed");
    }
    expect(sent.map((m) => m.topic)).not.toContain(`devices:${stranger.id}`);
  });

  it("removing a device notifies contacts; a blocked contact is skipped", async () => {
    const a = await actor("dc_a2");
    const b = await actor("dc_b2");
    const blocked = await actor("dc_x2");
    await share(a, b);
    await share(a, blocked);
    await asSuperuser(db, `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`, [
      blocked.id,
      a.id,
    ]);
    const extra = await askFresh(a);
    await a.rpc.rpc("approve_device", { p_device_id: extra, p_account_signature: "sig" });
    await clear();

    const removed = await a.rpc.rpc("remove_device", { p_device_id: extra });
    expect(removed.error).toBeNull();
    const topics = (await sentFor(a.id)).map((m) => m.topic);
    expect(topics).toContain(`devices:${b.id}`);
    expect(topics).toContain(`devices:${a.id}`);
    expect(topics).not.toContain(`devices:${blocked.id}`);
  });

  it("replacing the account key sends security_code_changed to contacts", async () => {
    const a = await actor("dc_a3");
    const b = await actor("dc_b3");
    await share(a, b);
    const dev = randomUUID();
    const sid2 = randomUUID();
    await asSuperuser(db, "insert into auth.sessions (id, user_id) values ($1, $2)", [sid2, a.id]);
    // Needs an account row first: a lone fresh device creates it, so mark a's account.
    await asSuperuser(
      db,
      "insert into public.account_keys (user_id, signing_key) values ($1, 'old') on conflict do nothing",
      [a.id],
    );
    await clear();
    const replaced = await createRpcClient(db, a.id, { session_id: sid2 }).rpc("replace_account_key", {
      p_device_id: dev,
      p_name: "New",
      p_platform: "web",
      p_identity_key: `idk-${dev}`,
      p_signing_key: `sgk-${dev}`,
      p_account_signature: "sig",
      p_account_signing_key: "brand-new-account-key",
    });
    expect(replaced.error).toBeNull();
    const forB = (await sentFor(a.id)).filter((m) => m.topic === `devices:${b.id}`);
    expect(forB.map((m) => m.payload.kind)).toContain("security_code_changed");
  });

  it("a plain re-register with no change sends nothing", async () => {
    const a = await actor("dc_a4");
    const b = await actor("dc_b4");
    await share(a, b);
    await clear();
    const again = await a.rpc.rpc("register_device", {
      p_device_id: a.device,
      p_name: "Renamed",
      p_platform: "web",
      p_identity_key: `idk-${a.device}`,
      p_signing_key: `sgk-${a.device}`,
      p_account_signing_key: "account-key",
    });
    expect(again.error).toBeNull();
    expect(await sentFor(a.id)).toHaveLength(0);
  });

  it("topic helper: a user reads only the devices topic of their own id", async () => {
    const a = await actor("dc_a5");
    const b = await actor("dc_b5");
    const q = async (topic: string) =>
      (
        await asUser<{ rows: { ok: boolean }[] }>(
          db,
          a.id,
          `select public.devices_topic_readable($1) as ok`,
          [topic],
        )
      ).rows[0]!.ok;
    expect(await q(`devices:${a.id}`)).toBe(true);
    expect(await q(`devices:${b.id}`)).toBe(false);
    expect(await q("devices:nope")).toBe(false);
  });

  it("realtime policies: clients cannot send on devices topics, read only their own", async () => {
    const a = await actor("dc_a6");
    const b = await actor("dc_b6");
    // Stub the Supabase realtime.messages table, then re-apply the migration (idempotent).
    await db.exec(`
      create table realtime.messages (id bigserial primary key, topic text, extension text);
      create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
      alter table realtime.messages enable row level security;
      grant usage on schema realtime to authenticated;
      grant execute on function realtime.topic() to authenticated;
      grant select, insert on realtime.messages to authenticated;
      grant usage on sequence realtime.messages_id_seq to authenticated;
    `);
    const file = join(
      process.cwd(),
      "..",
      "..",
      "supabase",
      "migrations",
      "20261025000000_e2ee_devices_changed_server.sql",
    );
    await db.exec(readFileSync(file, "utf8"));
    await asSuperuser(
      db,
      `insert into realtime.messages (topic, extension) values ($1, 'broadcast'), ($2, 'broadcast')`,
      [`devices:${a.id}`, `devices:${b.id}`],
    );

    async function asClient<T>(topic: string, sql: string, params: unknown[]): Promise<T> {
      await db.query("begin");
      try {
        await db.query("set local role authenticated");
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [
          JSON.stringify({ sub: a.id, role: "authenticated" }),
        ]);
        await db.query(`select set_config('realtime.topic', $1, true)`, [topic]);
        return (await db.query(sql, params)) as T;
      } finally {
        await db.query("rollback");
      }
    }
    const insert = `insert into realtime.messages (topic, extension) values ($1, 'broadcast')`;
    await expect(asClient(`devices:${b.id}`, insert, [`devices:${b.id}`])).rejects.toThrow();
    await expect(asClient(`devices:${a.id}`, insert, [`devices:${a.id}`])).rejects.toThrow();

    const read = `select topic from realtime.messages where topic = $1`;
    const own = await asClient<{ rows: unknown[] }>(`devices:${a.id}`, read, [`devices:${a.id}`]);
    expect(own.rows).toHaveLength(1);
    const other = await asClient<{ rows: unknown[] }>(`devices:${b.id}`, read, [`devices:${b.id}`]);
    expect(other.rows).toHaveLength(0);
  });
});
