import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  asAnon,
  asSuperuser,
  asUser,
  createTestDb,
  createUser,
} from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    create or replace function public._test_rpc_scalar(p_value int)
    returns int
    language sql
    immutable
    as $$ select p_value * 2; $$;

    create or replace function public._test_rpc_setof()
    returns table(n int, label text)
    language sql
    stable
    as $$
      select * from (values (1, 'a'), (2, 'b')) as t(n, label);
    $$;

    create or replace function public._test_rpc_raises()
    returns void
    language plpgsql
    as $$
    begin
      raise exception 'platform.invalid_action' using errcode = 'P0001';
    end;
    $$;
  `);
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

async function insertConversationWithMessage(
  memberIds: string[],
  body: string,
): Promise<{ conversationId: string; messageId: string }> {
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const senderId = memberIds[0]!;

  await asSuperuser(
    db,
    `insert into public.conversations (id, type) values ($1, 'direct')`,
    [conversationId],
  );

  for (const userId of memberIds) {
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member')`,
      [conversationId, userId],
    );
  }

  await asSuperuser(
    db,
    `insert into public.messages (id, conversation_id, sender_id, client_id, type, body)
     values ($1, $2, $3, $4, 'text', $5)`,
    [messageId, conversationId, senderId, randomUUID(), body],
  );

  return { conversationId, messageId };
}

describe("conversation message RLS", () => {
  it("denies non-members and allows members", async () => {
    const member = await createUser(db, { username: "mem_rls" });
    const outsider = await createUser(db, { username: "out_rls" });
    const { conversationId } = await insertConversationWithMessage(
      [member.id],
      "secret",
    );

    const denied = await asUser<{ rows: unknown[] }>(
      db,
      outsider.id,
      `select id from public.messages where conversation_id = $1`,
      [conversationId],
    );
    expect(denied.rows).toHaveLength(0);

    const allowed = await asUser<{ rows: { body: string }[] }>(
      db,
      member.id,
      `select body from public.messages where conversation_id = $1`,
      [conversationId],
    );
    expect(allowed.rows).toHaveLength(1);
    expect(allowed.rows[0]?.body).toBe("secret");
  });

  it("enforces RLS under PGlite (disabled RLS exposes rows)", async () => {
    const member = await createUser(db, { username: "rls_chk_m" });
    const outsider = await createUser(db, { username: "rls_chk_o" });
    const { conversationId } = await insertConversationWithMessage(
      [member.id],
      "rls probe",
    );

    const blocked = await asUser<{ rows: unknown[] }>(
      db,
      outsider.id,
      `select id from public.messages where conversation_id = $1`,
      [conversationId],
    );
    expect(blocked.rows).toHaveLength(0);

    await asSuperuser(db, `alter table public.messages disable row level security`);

    const leaked = await asUser<{ rows: unknown[] }>(
      db,
      outsider.id,
      `select id from public.messages where conversation_id = $1`,
      [conversationId],
    );
    expect(leaked.rows.length).toBeGreaterThan(0);

    await asSuperuser(db, `alter table public.messages enable row level security`);

    const blockedAgain = await asUser<{ rows: unknown[] }>(
      db,
      outsider.id,
      `select id from public.messages where conversation_id = $1`,
      [conversationId],
    );
    expect(blockedAgain.rows).toHaveLength(0);
  });
});

describe("blocks RLS", () => {
  it("is visible to blocker only", async () => {
    const blocker = await createUser(db, { username: "blk_a" });
    const blocked = await createUser(db, { username: "blk_b" });

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [blocker.id, blocked.id],
    );

    const blockerRows = await asUser<{ rows: unknown[] }>(
      db,
      blocker.id,
      `select blocked_id from public.blocks where blocker_id = $1`,
      [blocker.id],
    );
    expect(blockerRows.rows).toHaveLength(1);

    const blockedRows = await asUser<{ rows: unknown[] }>(
      db,
      blocked.id,
      `select blocker_id from public.blocks`,
    );
    expect(blockedRows.rows).toHaveLength(0);
  });
});

describe("client write restrictions", () => {
  it("cannot update protected profile columns or insert messages directly", async () => {
    const user = await createUser(db, { username: "no_write" });

    await expect(
      asUser(
        db,
        user.id,
        `update public.profiles set username = $1 where id = $2`,
        ["changed", user.id],
      ),
    ).rejects.toThrow(/permission denied|42501/i);

    await expect(
      asUser(
        db,
        user.id,
        `update public.profiles set normalized_username = $1 where id = $2`,
        ["changed", user.id],
      ),
    ).rejects.toThrow(/permission denied|42501/i);

    await expect(
      asUser(
        db,
        user.id,
        `update public.profiles set username_changed_at = now() where id = $1`,
        [user.id],
      ),
    ).rejects.toThrow(/permission denied|42501/i);

    const conversationId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.conversations (id, type) values ($1, 'direct')`,
      [conversationId],
    );
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member')`,
      [conversationId, user.id],
    );

    await expect(
      asUser(
        db,
        user.id,
        `insert into public.messages (conversation_id, sender_id, client_id, type, body)
         values ($1, $2, $3, 'text', 'nope')`,
        [conversationId, user.id, randomUUID()],
      ),
    ).rejects.toThrow(/permission denied|42501/i);
  });
});

describe("schema constraints and storage", () => {
  it("rejects duplicate sender_id + client_id", async () => {
    const user = await createUser(db, { username: "dup_msg" });
    const conversationId = randomUUID();
    const clientId = randomUUID();

    await asSuperuser(
      db,
      `insert into public.conversations (id, type) values ($1, 'direct')`,
      [conversationId],
    );
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member')`,
      [conversationId, user.id],
    );

    await asSuperuser(
      db,
      `insert into public.messages (conversation_id, sender_id, client_id, type, body)
       values ($1, $2, $3, 'text', 'one')`,
      [conversationId, user.id, clientId],
    );

    await expect(
      asSuperuser(
        db,
        `insert into public.messages (conversation_id, sender_id, client_id, type, body)
         values ($1, $2, $3, 'text', 'two')`,
        [conversationId, user.id, clientId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("includes realtime tables and private attachments bucket", async () => {
    const tables = await asSuperuser<{ rows: { tablename: string }[] }>(
      db,
      `select tablename from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
       order by tablename`,
    );
    expect(tables.rows.map((r) => r.tablename)).toEqual([
      "conversation_members",
      "conversations",
      "message_reactions",
      "messages",
      "notifications",
    ]);

    const bucket = await asSuperuser<{ rows: { public: boolean }[] }>(
      db,
      `select public from storage.buckets where id = 'attachments'`,
    );
    expect(bucket.rows[0]?.public).toBe(false);
  });
});

describe("username_is_valid", () => {
  it("accepts valid usernames and rejects invalid ones", async () => {
    const cases: Array<[string, boolean]> = [
      ["Valid_user1", true],
      ["ab", false],
      ["a".repeat(21), false],
      ["1bad", false],
      ["admin", false],
      ["ok-user", false],
    ];

    for (const [username, expected] of cases) {
      const result = await asSuperuser<{ rows: { ok: boolean }[] }>(
        db,
        `select public.username_is_valid($1) as ok`,
        [username],
      );
      expect(result.rows[0]?.ok).toBe(expected);
    }
  });

  it("enforces normalized uniqueness", async () => {
    await createUser(db, { username: "Ibrahim" });
    await expect(
      createUser(db, { username: "ibrahim" }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});

describe("decide_interaction", () => {
  async function decision(
    actorId: string,
    targetId: string,
    action: string,
  ): Promise<string> {
    const client = createRpcClient(db, actorId);
    const { data, error } = await client.rpc("decide_interaction", {
      p_actor: actorId,
      p_target: targetId,
      p_action: action,
    });
    if (error) {
      throw new Error(error.message);
    }
    return data as string;
  }

  it("covers discover, message, invite, and presence rules", async () => {
    const actor = await createUser(db, { username: "actor_di" });
    const target = await createUser(db, {
      username: "target_di",
      profileOverrides: {
        profile_visibility: "public",
        discoverable: true,
        who_can_message: "requests",
        who_can_add_to_groups: "contacts",
        show_online: true,
      },
    });

    expect(await decision(actor.id, actor.id, "discover")).toBe("allow");
    expect(await decision(actor.id, target.id, "discover")).toBe("allow");
    expect(await decision(actor.id, target.id, "message")).toBe("request");
    expect(await decision(actor.id, target.id, "invite")).toBe("deny");
    expect(await decision(actor.id, target.id, "presence")).toBe("allow");

    await asSuperuser(
      db,
      `update public.profiles set profile_visibility = 'private' where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "discover")).toBe("deny");

    await asSuperuser(
      db,
      `update public.profiles
       set profile_visibility = 'contacts', discoverable = true
       where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "discover")).toBe("deny");
    await asSuperuser(
      db,
      `insert into public.favorites (user_id, favorite_user_id) values ($1, $2)`,
      [actor.id, target.id],
    );
    expect(await decision(actor.id, target.id, "discover")).toBe("allow");

    await asSuperuser(
      db,
      `update public.profiles set discoverable = false where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "discover")).toBe("deny");

    await asSuperuser(
      db,
      `update public.profiles
       set discoverable = true,
           profile_visibility = 'public',
           who_can_message = 'everyone',
           who_can_add_to_groups = 'everyone'
       where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "message")).toBe("allow");
    expect(await decision(actor.id, target.id, "invite")).toBe("allow");

    await asSuperuser(
      db,
      `update public.profiles set who_can_message = 'nobody' where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "message")).toBe("deny");

    const pairKey = await asSuperuser<{ rows: { key: string }[] }>(
      db,
      `select public.direct_pair_key($1::uuid, $2::uuid) as key`,
      [actor.id, target.id],
    );
    const convId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.conversations (id, type, direct_pair_key) values ($1, 'direct', $2)`,
      [convId, pairKey.rows[0]!.key],
    );
    expect(await decision(actor.id, target.id, "message")).toBe("allow");

    await asSuperuser(
      db,
      `insert into public.message_requests (from_user_id, to_user_id, status)
       values ($1, $2, 'pending')`,
      [actor.id, target.id],
    );
    expect(await decision(actor.id, target.id, "message")).toBe("deny");

    await asSuperuser(
      db,
      `update public.profiles set who_can_add_to_groups = 'contacts' where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "invite")).toBe("allow");

    await asSuperuser(
      db,
      `delete from public.favorites where user_id = $1 and favorite_user_id = $2`,
      [actor.id, target.id],
    );
    expect(await decision(actor.id, target.id, "invite")).toBe("deny");

    await asSuperuser(
      db,
      `update public.profiles set show_online = false where id = $1`,
      [target.id],
    );
    expect(await decision(actor.id, target.id, "presence")).toBe("deny");

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [actor.id, target.id],
    );
    expect(await decision(actor.id, target.id, "presence")).toBe("deny");
    expect(await decision(actor.id, target.id, "discover")).toBe("deny");

    const missing = randomUUID();
    expect(await decision(actor.id, missing, "discover")).toBe("deny");

    const invalidClient = createRpcClient(db, actor.id);
    const invalid = await invalidClient.rpc("decide_interaction", {
      p_actor: actor.id,
      p_target: target.id,
      p_action: "unknown",
    });
    expect(invalid.error?.message).toBe("platform.invalid_action");
  });
});

describe("profile RLS", () => {
  it("hides private profiles from others while keeping owner and public access", async () => {
    const owner = await createUser(db, {
      username: "priv_own",
      profileOverrides: { profile_visibility: "private" },
    });
    const viewer = await createUser(db, { username: "priv_view" });
    const publicUser = await createUser(db, {
      username: "pub_user",
      profileOverrides: { profile_visibility: "public" },
    });

    const hidden = await asUser<{ rows: unknown[] }>(
      db,
      viewer.id,
      `select id from public.profiles where id = $1`,
      [owner.id],
    );
    expect(hidden.rows).toHaveLength(0);

    const own = await asUser<{ rows: unknown[] }>(
      db,
      owner.id,
      `select id from public.profiles where id = $1`,
      [owner.id],
    );
    expect(own.rows).toHaveLength(1);

    const visible = await asUser<{ rows: unknown[] }>(
      db,
      viewer.id,
      `select id from public.profiles where id = $1`,
      [publicUser.id],
    );
    expect(visible.rows).toHaveLength(1);
  });
});

describe("privilege hardening", () => {
  it("authenticated cannot truncate a table", async () => {
    const user = await createUser(db, { username: "truncater" });
    await expect(
      asUser(db, user.id, `truncate public.messages`),
    ).rejects.toThrow(/permission denied/i);
  });

  it("tables and functions created by later migrations are not writable or callable by anon", async () => {
    await db.exec(`
      create table public._later_table (id int);
      create function public._later_fn() returns int language sql as $$ select 1 $$;
    `);
    const user = await createUser(db, { username: "later_user" });
    await expect(
      asUser(db, user.id, `insert into public._later_table values (1)`),
    ).rejects.toThrow(/permission denied/i);
    await expect(asAnon(db, `select public._later_fn()`)).rejects.toThrow(
      /permission denied/i,
    );
    const allowed = await asUser<{ rows: { v: number }[] }>(
      db,
      user.id,
      `select public._later_fn() as v`,
    );
    expect(allowed.rows[0]?.v).toBe(1);
  });

  it("a member cannot probe interactions or blocks between two other people", async () => {
    const a = await createUser(db, { username: "probe_a" });
    const b = await createUser(db, { username: "probe_b" });
    const prober = await createUser(db, { username: "prober" });
    await expect(
      asUser(db, prober.id, `select public.decide_interaction($1, $2, 'message')`, [
        a.id,
        b.id,
      ]),
    ).rejects.toThrow(/platform\.forbidden/);
    await expect(
      asUser(db, prober.id, `select public.is_blocked_either($1, $2)`, [a.id, b.id]),
    ).rejects.toThrow(/permission denied/i);
    const own = await asUser<{ rows: { d: string }[] }>(
      db,
      prober.id,
      `select public.decide_interaction($1, $2, 'message') as d`,
      [prober.id, a.id],
    );
    expect(own.rows[0]?.d).toBe("allow");
  });
});

describe("rpc-client", () => {
  it("returns scalar and set-returning shapes and propagates errors", async () => {
    const user = await createUser(db, { username: "rpc_user" });
    const client = createRpcClient(db, user.id);

    const scalar = await client.rpc("_test_rpc_scalar", { p_value: 21 });
    expect(scalar.error).toBeNull();
    expect(scalar.data).toBe(42);

    const setof = await client.rpc("_test_rpc_setof", {});
    expect(setof.error).toBeNull();
    expect(setof.data).toEqual([
      { n: 1, label: "a" },
      { n: 2, label: "b" },
    ]);

    const failure = await client.rpc("_test_rpc_raises", {});
    expect(failure.data).toBeNull();
    expect(failure.error?.message).toBe("platform.invalid_action");
  });
});
