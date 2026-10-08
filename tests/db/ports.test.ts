import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { decideInteraction } from "@/platform/interaction";
import { limit, RATE_LIMITS } from "@/platform/limit";
import { notify } from "@/platform/notify";
import { validateUsername } from "@/platform/username";

import {
  asSuperuser,
  asUser,
  createTestDb,
  createUser,
} from "./pglite";
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

describe("username TS/SQL parity", () => {
  const cases: Array<[string, boolean]> = [
    ["Valid_user1", true],
    ["ab", false],
    ["a".repeat(21), false],
    ["1bad", false],
    ["admin", false],
    ["ok-user", false],
    ["support", false],
    ["  MixedCase  ", true],
    ["user_name", true],
    ["undefined", false],
  ];

  it("matches public.username_is_valid for each case", async () => {
    for (const [input, expectedValid] of cases) {
      const ts = validateUsername(input);
      const sql = await asSuperuser<{ rows: { ok: boolean }[] }>(
        db,
        `select public.username_is_valid($1) as ok`,
        [input],
      );
      expect(ts.ok).toBe(expectedValid);
      expect(sql.rows[0]?.ok).toBe(expectedValid);
    }
  });
});

describe("decideInteraction port", () => {
  it("delegates to decide_interaction RPC", async () => {
    const actor = await createUser(db, { username: "port_actor" });
    const target = await createUser(db, {
      username: "port_target",
      profileOverrides: { who_can_message: "requests" },
    });
    const client = createRpcClient(db, actor.id);
    const result = await decideInteraction(
      client,
      actor.id,
      target.id,
      "message",
    );
    expect(result).toEqual({ ok: true, value: "request" });
  });
});

describe("notify port", () => {
  it("inserts a notification row", async () => {
    const recipient = await createUser(db, { username: "notify_rec" });
    const actor = await createUser(db, { username: "notify_act" });
    const entityId = randomUUID();
    const admin = createSuperuserRpcClient(db);

    const result = await notify(admin, {
      recipientId: recipient.id,
      type: "message",
      actorId: actor.id,
      entityId,
    });

    expect(result).toEqual({ ok: true, value: "notifications.created" });

    const rows = await asUser<{ rows: unknown[] }>(
      db,
      recipient.id,
      `select id from public.notifications where recipient_id = $1 and entity_id = $2`,
      [recipient.id, entityId],
    );
    expect(rows.rows).toHaveLength(1);
  });

  it("skips muted conversation", async () => {
    const recipient = await createUser(db, { username: "mute_rec" });
    const actor = await createUser(db, { username: "mute_act" });
    const conversationId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.conversations (id, type) values ($1, 'direct')`,
      [conversationId],
    );
    await asSuperuser(
      db,
      `insert into public.conversation_members (conversation_id, user_id, role, muted_until)
       values ($1, $2, 'member', now() + interval '1 day')`,
      [conversationId, recipient.id],
    );

    const admin = createSuperuserRpcClient(db);
    const result = await notify(admin, {
      recipientId: recipient.id,
      type: "message",
      actorId: actor.id,
      entityId: randomUUID(),
      conversationId,
    });

    expect(result).toEqual({ ok: true, value: "notifications.skipped_muted" });
  });

  it("skips when in-app notifications disabled", async () => {
    const recipient = await createUser(db, { username: "off_rec" });
    const actor = await createUser(db, { username: "off_act" });
    await asSuperuser(
      db,
      `insert into public.notification_preferences (user_id, in_app_enabled)
       values ($1, false)`,
      [recipient.id],
    );

    const admin = createSuperuserRpcClient(db);
    const result = await notify(admin, {
      recipientId: recipient.id,
      type: "message",
      actorId: actor.id,
      entityId: randomUUID(),
    });

    expect(result).toEqual({
      ok: true,
      value: "notifications.skipped_disabled",
    });
  });

  it("returns recipient_missing for unknown recipient", async () => {
    const actor = await createUser(db, { username: "miss_act" });
    const admin = createSuperuserRpcClient(db);
    const result = await notify(admin, {
      recipientId: randomUUID(),
      type: "message",
      actorId: actor.id,
      entityId: randomUUID(),
    });
    expect(result).toEqual({
      ok: false,
      error: { code: "notifications.recipient_missing" },
    });
  });
});

describe("limit port", () => {
  it("allows traffic within the window", async () => {
    const user = await createUser(db, { username: "lim_ok" });
    const admin = createSuperuserRpcClient(db);

    for (let i = 0; i < RATE_LIMITS.send_message.max; i++) {
      const result = await limit(admin, {
        userId: user.id,
        action: "send_message",
      });
      expect(result.ok).toBe(true);
    }
  });

  it("returns platform.rate_limited above the cap", async () => {
    const user = await createUser(db, { username: "lim_over" });
    const admin = createSuperuserRpcClient(db);

    for (let i = 0; i < RATE_LIMITS.send_message.max; i++) {
      await limit(admin, { userId: user.id, action: "send_message" });
    }

    const blocked = await limit(admin, {
      userId: user.id,
      action: "send_message",
    });
    expect(blocked).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });

  it("tracks users and actions independently", async () => {
    const a = await createUser(db, { username: "lim_a" });
    const b = await createUser(db, { username: "lim_b" });
    const admin = createSuperuserRpcClient(db);

    for (let i = 0; i < RATE_LIMITS.send_message.max; i++) {
      await limit(admin, { userId: a.id, action: "send_message" });
    }
    const blockedA = await limit(admin, {
      userId: a.id,
      action: "send_message",
    });
    expect(blockedA.ok).toBe(false);

    const allowedB = await limit(admin, {
      userId: b.id,
      action: "send_message",
    });
    expect(allowedB.ok).toBe(true);

    const search = await limit(admin, {
      userId: a.id,
      action: "search_users",
    });
    expect(search.ok).toBe(true);
  });

  it("resets when window_start moves to a new window", async () => {
    const user = await createUser(db, { username: "lim_win" });
    const admin = createSuperuserRpcClient(db);
    const pastWindow = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await asSuperuser(
      db,
      `insert into public.rate_limit_counters (user_id, action, window_start, count)
       values ($1, 'send_message', $2, $3)`,
      [user.id, pastWindow, RATE_LIMITS.send_message.max],
    );

    const result = await limit(admin, {
      userId: user.id,
      action: "send_message",
    });
    expect(result.ok).toBe(true);
  });

  it("enforce_rate_limit raises platform.rate_limited when over cap", async () => {
    const user = await createUser(db, { username: "lim_enf" });
    const admin = createSuperuserRpcClient(db);

    for (let i = 0; i < RATE_LIMITS.send_message.max; i++) {
      await limit(admin, { userId: user.id, action: "send_message" });
    }

    await db.query("begin");
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: user.id, role: "authenticated" }),
      ]);
      await expect(
        db.query(`select public.enforce_rate_limit($1)`, ["send_message"]),
      ).rejects.toMatchObject({
        message: expect.stringContaining("platform.rate_limited"),
      });
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  });
});
