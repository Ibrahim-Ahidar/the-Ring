import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listConversations } from "@/features/direct-messaging/service";

import { asSuperuser, createTestDb } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) {
    await db.close();
  }
});

async function createUser(username: string): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, `${username}@pulse.test`, JSON.stringify({ username })],
  );
  return id;
}

async function addConversation(
  userId: string,
  type: "direct" | "group",
  ageMinutes: number,
): Promise<string> {
  const id = randomUUID();
  await asSuperuser(
    db,
    `insert into public.conversations (id, type, title, created_by, last_message_at, direct_pair_key)
     values ($1, $2::public.conversation_type, $3, $4, now() - ($5 || ' minutes')::interval, $6)`,
    [
      id,
      type,
      type === "group" ? `group ${ageMinutes}` : null,
      userId,
      String(ageMinutes),
      type === "direct" ? randomUUID() : null,
    ],
  );
  await asSuperuser(
    db,
    `insert into public.conversation_members (conversation_id, user_id) values ($1, $2)`,
    [id, userId],
  );
  return id;
}

describe("list_conversations type filter", () => {
  it("returns every group even when they are older than the 30 newest conversations", async () => {
    const userId = await createUser("typefilter_a");
    const groupIds: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      groupIds.push(await addConversation(userId, "group", 1000 + i));
    }
    for (let i = 0; i < 30; i += 1) {
      await addConversation(userId, "direct", i + 1);
    }
    const rpc = createRpcClient(db, userId);

    const all = await listConversations(rpc, {});
    expect(all.ok).toBe(true);
    if (!all.ok) return;
    expect(all.value.items).toHaveLength(30);
    expect(all.value.items.some((item) => item.type === "group")).toBe(false);
    expect(all.value.hasMore).toBe(true);

    const groups = await listConversations(rpc, { type: "group" });
    expect(groups.ok).toBe(true);
    if (!groups.ok) return;
    expect(groups.value.hasMore).toBe(false);
    expect(groups.value.items.map((item) => item.id).sort()).toEqual([...groupIds].sort());

    const directs = await listConversations(rpc, { type: "direct" });
    expect(directs.ok).toBe(true);
    if (!directs.ok) return;
    expect(directs.value.items.every((item) => item.type === "direct")).toBe(true);
  });

  it("rejects an unknown type", async () => {
    const userId = await createUser("typefilter_b");
    const rpc = createRpcClient(db, userId);
    const result = await listConversations(rpc, { type: "channel" as never });
    expect(result.ok).toBe(false);
  });
});
