import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { notify } from "@/platform/notify";
import {
  getPreferences,
  listNotifications,
  markAllRead,
  markRead,
  unreadCount,
  updatePreferences,
} from "@/features/notifications/service";

import { asSuperuser, asUser, createTestDb } from "./pglite";
import { createRpcClient, createSuperuserRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createMember(
  dbInstance: PGliteInterface,
  username: string,
): Promise<{ id: string; username: string }> {
  const id = randomUUID();
  await asSuperuser(
    dbInstance,
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, `${username}@pulse.test`, JSON.stringify({ username })],
  );
  return { id, username };
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

async function insertNotificationFor(
  recipientId: string,
  actorId: string,
  entityId: string = randomUUID(),
) {
  const admin = createSuperuserRpcClient(db);
  await notify(admin, {
    recipientId,
    type: "message.created",
    actorId,
    entityId,
  });
}

describe("notifications inbox", () => {
  it("lists only the caller's rows", async () => {
    const a = await createMember(db, "inbox_a");
    const b = await createMember(db, "inbox_b");
    const actor = await createMember(db, "inbox_act");

    await insertNotificationFor(a.id, actor.id);
    await insertNotificationFor(b.id, actor.id);

    const clientA = createRpcClient(db, a.id);
    const listA = await listNotifications(clientA);
    expect(listA.ok).toBe(true);
    if (listA.ok) {
      expect(listA.value.items).toHaveLength(1);
      expect(listA.value.items[0]?.type).toBe("message.created");
    }

    const clientB = createRpcClient(db, b.id);
    const listB = await listNotifications(clientB);
    expect(listB.ok).toBe(true);
    if (listB.ok) {
      expect(listB.value.items).toHaveLength(1);
    }
  });

  it("returns notifications.not_found when marking another member's row", async () => {
    const owner = await createMember(db, "mark_owner");
    const other = await createMember(db, "mark_other");
    const actor = await createMember(db, "mark_act");
    await insertNotificationFor(owner.id, actor.id);

    const ownerList = await listNotifications(createRpcClient(db, owner.id));
    expect(ownerList.ok).toBe(true);
    const id = ownerList.ok ? ownerList.value.items[0]?.id : null;
    expect(id).toBeTruthy();

    const result = await markRead(createRpcClient(db, other.id), id!);
    expect(result).toEqual({
      ok: false,
      error: { code: "notifications.not_found" },
    });
  });

  it("mark-all clears only the caller unread rows", async () => {
    const a = await createMember(db, "all_a");
    const b = await createMember(db, "all_b");
    const actor = await createMember(db, "all_act");
    await insertNotificationFor(a.id, actor.id);
    await insertNotificationFor(a.id, actor.id);
    await insertNotificationFor(b.id, actor.id);

    const mark = await markAllRead(createRpcClient(db, a.id));
    expect(mark.ok).toBe(true);

    const countA = await unreadCount(createRpcClient(db, a.id));
    const countB = await unreadCount(createRpcClient(db, b.id));
    expect(countA).toEqual({ ok: true, value: 0 });
    expect(countB).toEqual({ ok: true, value: 1 });
  });

  it("unread count matches unread rows", async () => {
    const user = await createMember(db, "count_user");
    const actor = await createMember(db, "count_act");
    await insertNotificationFor(user.id, actor.id);
    await insertNotificationFor(user.id, actor.id);

    const client = createRpcClient(db, user.id);
    const count = await unreadCount(client);
    expect(count).toEqual({ ok: true, value: 2 });

    const list = await listNotifications(client);
    expect(list.ok).toBe(true);
    if (list.ok) {
      await markRead(client, list.value.items[0]!.id);
    }

    const after = await unreadCount(client);
    expect(after).toEqual({ ok: true, value: 1 });
  });

  it("two list calls do not duplicate rows", async () => {
    const user = await createMember(db, "dup_list");
    const actor = await createMember(db, "dup_act");
    await insertNotificationFor(user.id, actor.id);

    const client = createRpcClient(db, user.id);
    const first = await listNotifications(client);
    const second = await listNotifications(client);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.items).toEqual(second.value.items);
    }
  });
});

describe("notification preferences and notify", () => {
  it("disables in-app inserts until re-enabled without backfill", async () => {
    const recipient = await createMember(db, "pref_off");
    const actor = await createMember(db, "pref_act");
    const client = createRpcClient(db, recipient.id);
    const admin = createSuperuserRpcClient(db);

    const off = await updatePreferences(client, {
      inAppEnabled: false,
      pushEnabled: false,
      mentionsOnly: false,
    });
    expect(off.ok).toBe(true);

    const skipped = await notify(admin, {
      recipientId: recipient.id,
      type: "message",
      actorId: actor.id,
      entityId: randomUUID(),
    });
    expect(skipped).toEqual({
      ok: true,
      value: "notifications.skipped_disabled",
    });

    const on = await updatePreferences(client, {
      inAppEnabled: true,
      pushEnabled: false,
      mentionsOnly: false,
    });
    expect(on.ok).toBe(true);

    const created = await notify(admin, {
      recipientId: recipient.id,
      type: "message",
      actorId: actor.id,
      entityId: randomUUID(),
    });
    expect(created).toEqual({ ok: true, value: "notifications.created" });

    const count = await unreadCount(client);
    expect(count).toEqual({ ok: true, value: 1 });
  });

  it("stores push_enabled without sending push", async () => {
    const user = await createMember(db, "push_store");
    const client = createRpcClient(db, user.id);
    const saved = await updatePreferences(client, {
      inAppEnabled: true,
      pushEnabled: true,
      mentionsOnly: false,
    });
    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.value.pushEnabled).toBe(true);
    }
    const read = await getPreferences(client);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.value.pushEnabled).toBe(true);
    }
  });

  it("enforces mentions-only in notify", async () => {
    const recipient = await createMember(db, "mention_rec");
    const actor = await createMember(db, "mention_act");
    const client = createRpcClient(db, recipient.id);
    const admin = createSuperuserRpcClient(db);

    await updatePreferences(client, {
      inAppEnabled: true,
      pushEnabled: false,
      mentionsOnly: true,
    });

    const direct = await asSuperuser<{ rows: { value: string }[] }>(
      db,
      `select public.notify($1, $2, $3, $4, null, false) as value`,
      [recipient.id, "message", actor.id, randomUUID()],
    );
    expect(direct.rows[0]?.value).toBe("notifications.skipped_mentions_only");

    const created = await notify(admin, {
      recipientId: recipient.id,
      type: "message",
      actorId: actor.id,
      entityId: randomUUID(),
      mention: true,
    });
    expect(created).toEqual({ ok: true, value: "notifications.created" });
  });

  it("hides preferences from a second user", async () => {
    const owner = await createMember(db, "pref_own");
    const other = await createMember(db, "pref_peek");
    await updatePreferences(createRpcClient(db, owner.id), {
      inAppEnabled: false,
      pushEnabled: true,
      mentionsOnly: true,
    });

    const peek = await getPreferences(createRpcClient(db, other.id));
    expect(peek.ok).toBe(true);
    if (peek.ok) {
      expect(peek.value.inAppEnabled).toBe(true);
      expect(peek.value.pushEnabled).toBe(false);
      expect(peek.value.mentionsOnly).toBe(false);
    }

    const rows = await asUser<{ rows: unknown[] }>(
      db,
      other.id,
      `select * from public.notification_preferences where user_id = $1`,
      [owner.id],
    );
    expect(rows.rows).toHaveLength(0);
  });
});
