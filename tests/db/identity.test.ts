import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";

import { registerDevice, signIn } from "@/features/identity/service";
import { callRpc, type RpcClient } from "@/platform/rpc";
import { validateUsername } from "@/platform/username";

import { asSuperuser, asUser, createTestDb, createUser } from "./pglite";
import { createRpcClient, createSuperuserRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

async function insertAuthUserWithMeta(input: {
  username: string;
  displayName?: string;
  email?: string;
}): Promise<string> {
  const id = randomUUID();
  const email = input.email ?? `${input.username}@signup.test`;
  const meta = {
    username: input.username,
    display_name: input.displayName ?? null,
  };

  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify(meta)],
  );

  return id;
}

describe("identity username validation", () => {
  it("rejects invalid and reserved usernames in TS and SQL", async () => {
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("admin").ok).toBe(false);

    const anon = createRpcClient(db, null);
    const available = await callRpc<boolean>(anon, "identity_is_username_available", {
      p_username: "admin",
    });
    expect(available.ok && available.value).toBe(false);
  });

  it("rejects duplicate usernames case-insensitively on signup trigger", async () => {
    await createUser(db, { username: "Ibrahim" });

    await expect(
      insertAuthUserWithMeta({ username: "ibrahim" }),
    ).rejects.toThrow(/identity.username_taken/);
  });

  it("defaults display name to username when omitted in trigger", async () => {
    const id = await insertAuthUserWithMeta({ username: "fresh_user" });
    const row = await asSuperuser<{ rows: { display_name: string }[] }>(
      db,
      `select display_name from public.profiles where id = $1`,
      [id],
    );
    expect(row.rows[0]?.display_name).toBe("fresh_user");
  });
});

describe("identity profile writes", () => {
  it("updates profile fields without touching who_can_message", async () => {
    const user = await createUser(db, { username: "prof_edit" });
    const rpc = createRpcClient(db, user.id);

    const before = await asSuperuser<{ rows: { who_can_message: string }[] }>(
      db,
      `select who_can_message from public.profiles where id = $1`,
      [user.id],
    );

    const updated = await callRpc<null>(rpc, "identity_update_profile", {
      p_display_name: "Display",
      p_bio: "Bio",
      p_timezone: "Africa/Casablanca",
    });
    expect(updated.ok).toBe(true);

    const after = await asSuperuser<{
      rows: {
        display_name: string;
        bio: string;
        timezone: string;
        who_can_message: string;
      }[];
    }>(
      db,
      `select display_name, bio, timezone, who_can_message
       from public.profiles where id = $1`,
      [user.id],
    );

    expect(after.rows[0]?.display_name).toBe("Display");
    expect(after.rows[0]?.bio).toBe("Bio");
    expect(after.rows[0]?.timezone).toBe("Africa/Casablanca");
    expect(after.rows[0]?.who_can_message).toBe(
      before.rows[0]?.who_can_message,
    );
  });

  it("blocks a second user from updating another profile", async () => {
    const owner = await createUser(db, { username: "owner_prof" });
    const other = await createUser(db, { username: "other_prof" });
    const rpc = createRpcClient(db, other.id);

    const result = await callRpc<null>(rpc, "identity_update_profile", {
      p_display_name: "Hacked",
    });
    expect(result.ok).toBe(true);

    const row = await asSuperuser<{ rows: { display_name: string }[] }>(
      db,
      `select display_name from public.profiles where id = $1`,
      [owner.id],
    );
    expect(row.rows[0]?.display_name).not.toBe("Hacked");
  });

  it("enforces username cooldown then frees old normalized name", async () => {
    const user = await createUser(db, { username: "cool_name" });
    const rpc = createRpcClient(db, user.id);

    await asSuperuser(
      db,
      `update public.profiles set username_changed_at = now() where id = $1`,
      [user.id],
    );

    const tooSoon = await callRpc<null>(rpc, "identity_change_username", {
      p_username: "cool_renamed",
    });
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) {
      expect(tooSoon.error.code).toBe("identity.username_cooldown");
    }

    await asSuperuser(
      db,
      `update public.profiles
       set username_changed_at = now() - interval '15 days'
       where id = $1`,
      [user.id],
    );

    const okChange = await callRpc<null>(rpc, "identity_change_username", {
      p_username: "cool_renamed",
    });
    expect(okChange.ok).toBe(true);

    const anon = createRpcClient(db, null);
    const reused = await callRpc<boolean>(anon, "identity_is_username_available", {
      p_username: "cool_name",
    });
    expect(reused.ok && reused.value).toBe(true);
  });
});

describe("identity devices", () => {
  it("revokes a session and refuses assert on next check", async () => {
    const user = await createUser(db, { username: "dev_user" });
    const rpc = createRpcClient(db, user.id);
    const deviceId = randomUUID();

    await callRpc(rpc, "identity_upsert_device", {
      p_device_id: deviceId,
      p_device_label: "Test device",
    });

    const revoke = await callRpc<null>(rpc, "identity_revoke_device", {
      p_device_id: deviceId,
    });
    expect(revoke.ok).toBe(true);

    const assert = await callRpc<null>(rpc, "identity_assert_device_active", {
      p_device_id: deviceId,
    });
    expect(assert.ok).toBe(false);
    if (!assert.ok) {
      expect(assert.error.code).toBe("identity.session_revoked");
    }
  });

  it("returns not_found when revoking another member device id", async () => {
    const owner = await createUser(db, { username: "sess_owner" });
    const other = await createUser(db, { username: "sess_other" });
    const ownerRpc = createRpcClient(db, owner.id);
    const otherRpc = createRpcClient(db, other.id);
    const deviceId = randomUUID();

    await callRpc(ownerRpc, "identity_upsert_device", {
      p_device_id: deviceId,
    });

    const result = await callRpc<null>(otherRpc, "identity_revoke_device", {
      p_device_id: deviceId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("identity.not_found");
    }
  });

  it("gives a second account a new device when the cookie holds another account's id", async () => {
    const a = await createUser(db, { username: "stale_a" });
    const b = await createUser(db, { username: "stale_b" });
    const staleId = randomUUID();

    const first = await registerDevice(createRpcClient(db, a.id), staleId);
    expect(first).toEqual({ ok: true, value: staleId });

    // Without the retry the RPC alone rejects B with identity.not_found.
    const raw = await callRpc<string>(createRpcClient(db, b.id), "identity_upsert_device", {
      p_device_id: staleId,
    });
    expect(raw.ok).toBe(false);

    const second = await registerDevice(createRpcClient(db, b.id), staleId);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).not.toBe(staleId);

    const rows = await asSuperuser<{ rows: { id: string; user_id: string }[] }>(
      db,
      `select id, user_id from public.devices where user_id in ($1, $2) order by user_id = $1 desc`,
      [a.id, b.id],
    );
    expect(rows.rows).toEqual([
      { id: staleId, user_id: a.id },
      { id: second.value, user_id: b.id },
    ]);
  });

  it("does not retry for errors other than not_found", async () => {
    const calls: string[] = [];
    const rpc = {
      rpc: async (_fn: string, args: { p_device_id: string }) => {
        calls.push(args.p_device_id);
        return { data: null, error: { message: "platform.unauthenticated" } };
      },
    } as unknown as RpcClient;

    const result = await registerDevice(rpc, randomUUID());
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("password sign-in succeeds for B with A's stale device cookie", async () => {
    const a = await createUser(db, { username: "signin_a" });
    const b = await createUser(db, { username: "signin_b" });
    const staleId = randomUUID();
    await registerDevice(createRpcClient(db, a.id), staleId);

    let signedOut = false;
    const supabase = {
      auth: {
        signInWithPassword: async () => ({ error: null }),
        signOut: async () => {
          signedOut = true;
          return { error: null };
        },
      },
    } as unknown as SupabaseClient;

    const freshId = randomUUID();
    const result = await signIn(
      supabase,
      createRpcClient(db, b.id),
      { email: "b@example.com", password: "pw" },
      staleId,
      () => freshId,
    );
    expect(result).toEqual({ ok: true, value: freshId });
    expect(signedOut).toBe(false);
  });

  it("does not let a second user list the first user devices via RLS", async () => {
    const owner = await createUser(db, { username: "list_owner" });
    const other = await createUser(db, { username: "list_other" });
    const deviceId = randomUUID();

    await asSuperuser(
      db,
      `insert into public.devices (id, user_id, device_label, last_seen_at)
       values ($1, $2, 'Owner device', now())`,
      [deviceId, owner.id],
    );

    const rows = await asUser<{ rows: unknown[] }>(
      db,
      other.id,
      `select id from public.devices where user_id = $1`,
      [owner.id],
    );
    expect(rows.rows).toHaveLength(0);
  });
});

describe("identity device revocation ends the auth session (#59)", () => {
  async function signInSession(userId: string) {
    const sessionId = randomUUID();
    await asSuperuser(db, `insert into auth.sessions (id, user_id) values ($1, $2)`, [
      sessionId,
      userId,
    ]);
    await asSuperuser(
      db,
      `insert into auth.refresh_tokens (token, user_id, session_id) values ($1, $2, $3)`,
      [randomUUID(), userId, sessionId],
    );
    return { sessionId, rpc: createRpcClient(db, userId, { session_id: sessionId }) };
  }

  async function setup(username: string) {
    const user = await createUser(db, { username });
    const a = await signInSession(user.id);
    const b = await signInSession(user.id);
    const deviceA = randomUUID();
    const deviceB = randomUUID();
    expect((await callRpc(a.rpc, "identity_upsert_device", { p_device_id: deviceA })).ok).toBe(true);
    expect((await callRpc(b.rpc, "identity_upsert_device", { p_device_id: deviceB })).ok).toBe(true);
    return { user, a, b, deviceA, deviceB };
  }

  it("stores the session id on the device row at sign-in", async () => {
    const { b, deviceB } = await setup("rev_bind");
    const row = await asSuperuser<{ rows: { session_id: string }[] }>(
      db,
      `select session_id from public.devices where id = $1`,
      [deviceB],
    );
    expect(row.rows[0]?.session_id).toBe(b.sessionId);
  });

  it("refuses B's next request after A revokes B, and leaves A signed in", async () => {
    const { a, b, deviceA, deviceB } = await setup("rev_next");
    expect((await callRpc(b.rpc, "identity_assert_session_active")).ok).toBe(true);

    expect((await callRpc(a.rpc, "identity_revoke_device", { p_device_id: deviceB })).ok).toBe(true);

    const session = await callRpc(b.rpc, "identity_assert_session_active");
    expect(session).toEqual({ ok: false, error: { code: "identity.session_revoked" } });
    const device = await callRpc(b.rpc, "identity_assert_device_active", { p_device_id: deviceB });
    expect(device).toEqual({ ok: false, error: { code: "identity.session_revoked" } });

    expect((await callRpc(a.rpc, "identity_assert_session_active")).ok).toBe(true);
    expect(
      (await callRpc(a.rpc, "identity_assert_device_active", { p_device_id: deviceA })).ok,
    ).toBe(true);
  });

  it("deletes B's auth session so its refresh token can no longer be used", async () => {
    const { a, b, deviceB } = await setup("rev_refresh");
    await callRpc(a.rpc, "identity_revoke_device", { p_device_id: deviceB });

    const sessions = await asSuperuser<{ rows: unknown[] }>(
      db,
      `select 1 from auth.sessions where id = $1`,
      [b.sessionId],
    );
    expect(sessions.rows).toHaveLength(0);
    const tokens = await asSuperuser<{ rows: unknown[] }>(
      db,
      `select 1 from auth.refresh_tokens where session_id = $1`,
      [b.sessionId],
    );
    expect(tokens.rows).toHaveLength(0);

    const aTokens = await asSuperuser<{ rows: unknown[] }>(
      db,
      `select 1 from auth.refresh_tokens where session_id = $1`,
      [a.sessionId],
    );
    expect(aTokens.rows).toHaveLength(1);
  });

  it("does not let the revoked session re-register itself", async () => {
    const { a, b, deviceB } = await setup("rev_reupsert");
    await callRpc(a.rpc, "identity_revoke_device", { p_device_id: deviceB });

    const same = await callRpc(b.rpc, "identity_upsert_device", { p_device_id: deviceB });
    expect(same).toEqual({ ok: false, error: { code: "identity.session_revoked" } });
    const fresh = await callRpc(b.rpc, "identity_upsert_device", { p_device_id: randomUUID() });
    expect(fresh).toEqual({ ok: false, error: { code: "identity.session_revoked" } });
  });

  it("lets the device back in after a fresh sign-in", async () => {
    const { user, a, deviceB } = await setup("rev_fresh");
    await callRpc(a.rpc, "identity_revoke_device", { p_device_id: deviceB });

    const again = await signInSession(user.id);
    expect((await callRpc(again.rpc, "identity_upsert_device", { p_device_id: deviceB })).ok).toBe(
      true,
    );
    expect(
      (await callRpc(again.rpc, "identity_assert_device_active", { p_device_id: deviceB })).ok,
    ).toBe(true);
  });

  it("refuses an access token whose auth session no longer exists", async () => {
    const { b } = await setup("rev_gone");
    await asSuperuser(db, `delete from auth.sessions where id = $1`, [b.sessionId]);
    const result = await callRpc(b.rpc, "identity_assert_session_active");
    expect(result).toEqual({ ok: false, error: { code: "identity.session_revoked" } });
  });
});

describe("identity sign out other devices (#60)", () => {
  async function signInSession(userId: string) {
    const sessionId = randomUUID();
    await asSuperuser(db, `insert into auth.sessions (id, user_id) values ($1, $2)`, [
      sessionId,
      userId,
    ]);
    const rpc = createRpcClient(db, userId, { session_id: sessionId });
    const deviceId = randomUUID();
    expect((await callRpc(rpc, "identity_upsert_device", { p_device_id: deviceId })).ok).toBe(true);
    return { sessionId, rpc, deviceId };
  }

  it("revokes every other device and ends their sessions, keeping the caller signed in", async () => {
    const user = await createUser(db, { username: "rev_all" });
    const other = await createUser(db, { username: "rev_all_other" });
    const a = await signInSession(user.id);
    const b = await signInSession(user.id);
    const c = await signInSession(user.id);
    const stranger = await signInSession(other.id);
    // A session that never registered a device is signed out too.
    const bare = randomUUID();
    await asSuperuser(db, `insert into auth.sessions (id, user_id) values ($1, $2)`, [
      bare,
      user.id,
    ]);

    const result = await callRpc<number>(a.rpc, "identity_revoke_other_devices", {
      p_current_device_id: a.deviceId,
    });
    expect(result).toEqual({ ok: true, value: 2 });

    for (const s of [b, c]) {
      expect(await callRpc(s.rpc, "identity_assert_session_active")).toEqual({
        ok: false,
        error: { code: "identity.session_revoked" },
      });
    }
    const sessions = await asSuperuser<{ rows: { id: string }[] }>(
      db,
      `select id from auth.sessions where user_id = $1`,
      [user.id],
    );
    expect(sessions.rows.map((r) => r.id)).toEqual([a.sessionId]);

    expect(
      (await callRpc(a.rpc, "identity_assert_device_active", { p_device_id: a.deviceId })).ok,
    ).toBe(true);
    expect(
      (await callRpc(stranger.rpc, "identity_assert_device_active", {
        p_device_id: stranger.deviceId,
      })).ok,
    ).toBe(true);
  });
});

describe("identity touch device (#60)", () => {
  it("updates last_seen_at at most every 5 minutes and refuses revoked devices", async () => {
    const user = await createUser(db, { username: "touch_dev" });
    const rpc = createRpcClient(db, user.id);
    const deviceId = randomUUID();
    await callRpc(rpc, "identity_upsert_device", { p_device_id: deviceId });

    const seen = async () =>
      (
        await asSuperuser<{ rows: { last_seen_at: Date }[] }>(
          db,
          `select last_seen_at from public.devices where id = $1`,
          [deviceId],
        )
      ).rows[0]!.last_seen_at.getTime();

    await asSuperuser(
      db,
      `update public.devices set last_seen_at = now() - interval '2 minutes' where id = $1`,
      [deviceId],
    );
    const recent = await seen();
    expect((await callRpc(rpc, "identity_touch_device", { p_device_id: deviceId })).ok).toBe(true);
    expect(await seen()).toBe(recent);

    await asSuperuser(
      db,
      `update public.devices set last_seen_at = now() - interval '10 minutes' where id = $1`,
      [deviceId],
    );
    const stale = await seen();
    expect((await callRpc(rpc, "identity_touch_device", { p_device_id: deviceId })).ok).toBe(true);
    expect(await seen()).toBeGreaterThan(stale);

    await callRpc(rpc, "identity_revoke_device", { p_device_id: deviceId });
    expect(await callRpc(rpc, "identity_touch_device", { p_device_id: deviceId })).toEqual({
      ok: false,
      error: { code: "identity.session_revoked" },
    });
  });
});

describe("identity account deletion", () => {
  it("anonymizes profile, frees username, leaves messages, rejects wrong confirm", async () => {
    const user = await createUser(db, { username: "del_user" });
    const rpc = createRpcClient(db, user.id);
    const messageId = randomUUID();
    const conversationId = randomUUID();

    await asSuperuser(
      db,
      `insert into public.conversations (id, type) values ($1, 'direct')`,
      [conversationId],
    );
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id)
       values ($1, $2)`,
      [conversationId, user.id],
    );
    await asSuperuser(
      db,
      `insert into public.messages (id, conversation_id, sender_id, client_id, type, body)
       values ($1, $2, $3, $4, 'text', 'stay')`,
      [messageId, conversationId, user.id, randomUUID()],
    );

    const mismatch = await callRpc<null>(rpc, "identity_delete_account", {
      p_username_confirm: "wrong",
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.code).toBe("identity.username_mismatch");
    }

    const deleted = await callRpc<null>(rpc, "identity_delete_account", {
      p_username_confirm: "del_user",
    });
    expect(deleted.ok).toBe(true);

    const profile = await asSuperuser<{
      rows: {
        display_name: string;
        discoverable: boolean;
        username: string;
        bio: string | null;
      }[];
    }>(
      db,
      `select display_name, discoverable, username, bio
       from public.profiles where id = $1`,
      [user.id],
    );
    expect(profile.rows[0]?.display_name).toBe("__deleted_member__");
    expect(profile.rows[0]?.discoverable).toBe(false);
    expect(profile.rows[0]?.bio).toBeNull();

    const anon = createRpcClient(db, null);
    const available = await callRpc<boolean>(anon, "identity_is_username_available", {
      p_username: "del_user",
    });
    expect(available.ok && available.value).toBe(true);

    const message = await asSuperuser<{ rows: { body: string }[] }>(
      db,
      `select body from public.messages where id = $1`,
      [messageId],
    );
    expect(message.rows[0]?.body).toBe("stay");

    const membership = await asSuperuser<{ rows: { left_at: string | null }[] }>(
      db,
      `select left_at from public.conversation_members
       where conversation_id = $1 and user_id = $2`,
      [conversationId, user.id],
    );
    expect(membership.rows[0]?.left_at).not.toBeNull();
  });
});

describe("identity signup rate limit", () => {
  it("is not callable from the browser", async () => {
    const anon = createRpcClient(db, null);
    const denied = await callRpc<null>(anon, "identity_enforce_signup_rate_limit", {
      p_email: "victim@signup.test",
    });
    expect(denied.ok).toBe(false);
  });

  it("rate limits repeated signup attempts by email", async () => {
    const anon = createSuperuserRpcClient(db);
    const email = "rate@signup.test";

    for (let i = 0; i < 5; i += 1) {
      const ok = await callRpc<null>(anon, "identity_enforce_signup_rate_limit", {
        p_email: email,
      });
      expect(ok.ok).toBe(true);
    }

    const limited = await callRpc<null>(anon, "identity_enforce_signup_rate_limit", {
      p_email: email,
    });
    expect(limited.ok).toBe(false);
    if (!limited.ok) {
      expect(limited.error.code).toBe("platform.rate_limited");
    }
  });
});
