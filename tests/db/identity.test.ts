import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { callRpc } from "@/platform/rpc";
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
