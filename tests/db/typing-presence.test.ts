import { randomUUID } from "node:crypto";

import { describe, expect, it, beforeAll } from "vitest";
import type { PGliteInterface } from "@electric-sql/pglite";

import {
  createTestDb,
  asSuperuser,
  type TestUser,
} from "./pglite";
import { createRpcClient } from "./rpc-client";

async function provisionUser(
  db: PGliteInterface,
  username: string,
  profileOverrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const id = randomUUID();
  const email = `${username}@pulse.test`;
  const meta = {
    username,
    display_name:
      (profileOverrides.display_name as string | undefined) ?? username,
  };

  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify(meta)],
  );

  const keys = Object.keys(profileOverrides).filter((k) => k !== "display_name");
  if (keys.length > 0) {
    const sets = keys.map((key, index) => `${key} = $${index + 2}`).join(", ");
    const values = keys.map((key) => profileOverrides[key]);
    await asSuperuser(
      db,
      `update public.profiles set ${sets} where id = $1`,
      [id, ...values],
    );
  }

  return { id, username };
}

describe("typing_presence_touch_last_seen", () => {
  let db: PGliteInterface;
  let user: TestUser;

  beforeAll(async () => {
    db = await createTestDb();
    user = await provisionUser(db, "tptouch");
  });

  async function readLastSeen(): Promise<string | null> {
    const row = await asSuperuser<{ rows: { last_seen_at: Date | null }[] }>(
      db,
      `select last_seen_at from public.profiles where id = $1`,
      [user.id],
    );
    const value = row.rows[0]?.last_seen_at;
    return value ? value.toISOString() : null;
  }

  it("sets last_seen_at on first call", async () => {
    const client = createRpcClient(db, user.id);
    const first = await client.rpc("typing_presence_touch_last_seen", {
      p_now: new Date("2026-01-01T12:00:00Z").toISOString(),
    });
    expect(first.error).toBeNull();
    expect(first.data).toBe(true);
    expect(await readLastSeen()).toBe("2026-01-01T12:00:00.000Z");
  });

  it("does not update within five minutes", async () => {
    const client = createRpcClient(db, user.id);
    const second = await client.rpc("typing_presence_touch_last_seen", {
      p_now: new Date("2026-01-01T12:01:00Z").toISOString(),
    });
    expect(second.error).toBeNull();
    expect(second.data).toBe(false);
    expect(await readLastSeen()).toBe("2026-01-01T12:00:00.000Z");
  });

  it("updates again after six minutes", async () => {
    const client = createRpcClient(db, user.id);
    const third = await client.rpc("typing_presence_touch_last_seen", {
      p_now: new Date("2026-01-01T12:06:00Z").toISOString(),
    });
    expect(third.error).toBeNull();
    expect(third.data).toBe(true);
    expect(await readLastSeen()).toBe("2026-01-01T12:06:00.000Z");
  });
});

describe("typing_presence_read_subject", () => {
  let db: PGliteInterface;
  let viewer: TestUser;
  let subject: TestUser;
  let conversationId: string;

  beforeAll(async () => {
    db = await createTestDb();
    viewer = await provisionUser(db, "tpviewer");
    subject = await provisionUser(db, "tpsubject", {
      show_online: true,
      show_last_seen: true,
      display_name: "Subject User",
    });

    conversationId = randomUUID();
    const pairKey = await asSuperuser<{ rows: { key: string }[] }>(
      db,
      `select public.direct_pair_key($1::uuid, $2::uuid) as key`,
      [viewer.id, subject.id],
    );

    await asSuperuser(
      db,
      `insert into public.conversations (id, type, direct_pair_key) values ($1, 'direct', $2)`,
      [conversationId, pairKey.rows[0]!.key],
    );
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role)
       values ($1, $2, 'member'), ($1, $3, 'member')`,
      [conversationId, viewer.id, subject.id],
    );

    await asSuperuser(
      db,
      `update public.profiles set last_seen_at = '2026-02-01T08:00:00Z' where id = $1`,
      [subject.id],
    );
  });

  it("returns last seen when privacy allows", async () => {
    const client = createRpcClient(db, viewer.id);
    const result = await client.rpc("typing_presence_read_subject", {
      p_conversation_id: conversationId,
      p_subject_id: subject.id,
    });
    expect(result.error).toBeNull();
    const row = (result.data as Record<string, unknown>[])[0]!;
    expect(row.display_name).toBe("Subject User");
    expect(row.presence_allowed).toBe(true);
    expect(new Date(row.last_seen_at as string).toISOString()).toBe(
      "2026-02-01T08:00:00.000Z",
    );
  });

  it("hides last seen when show_last_seen is false", async () => {
    await asSuperuser(
      db,
      `update public.profiles set show_last_seen = false where id = $1`,
      [subject.id],
    );
    const client = createRpcClient(db, viewer.id);
    const result = await client.rpc("typing_presence_read_subject", {
      p_conversation_id: conversationId,
      p_subject_id: subject.id,
    });
    const row = (result.data as Record<string, unknown>[])[0]!;
    expect(row.last_seen_at).toBeNull();
    expect(row.last_seen_visible).toBe(false);
    await asSuperuser(
      db,
      `update public.profiles set show_last_seen = true where id = $1`,
      [subject.id],
    );
  });

  it("denies presence when show_online is false", async () => {
    await asSuperuser(
      db,
      `update public.profiles set show_online = false where id = $1`,
      [subject.id],
    );
    const client = createRpcClient(db, viewer.id);
    const result = await client.rpc("typing_presence_read_subject", {
      p_conversation_id: conversationId,
      p_subject_id: subject.id,
    });
    const row = (result.data as Record<string, unknown>[])[0]!;
    expect(row.presence_allowed).toBe(false);
    expect(row.last_seen_at).toBeNull();
    await asSuperuser(
      db,
      `update public.profiles set show_online = true where id = $1`,
      [subject.id],
    );
  });
});
