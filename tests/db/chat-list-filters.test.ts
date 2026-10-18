import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getArchivedSummary,
  listConversations,
  markRead,
  openDirect,
  sendText,
} from "@/features/direct-messaging/service";

import { asSuperuser, createTestDb, createUser, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

/** Opens a direct chat between `owner` and a fresh peer, who sends `unread` messages. */
async function chatWithUnread(
  owner: TestUser,
  peerName: string,
  unread: number,
): Promise<string> {
  const peer = await createUser(db, { username: peerName });
  const ownerRpc = createRpcClient(db, owner.id);
  const opened = await openDirect(ownerRpc, { username: peerName });
  if (!opened.ok) throw new Error("open failed");
  const conversationId = opened.value.conversationId;
  // The peer replies only after the owner wrote first, so the chat is not a request.
  const first = await sendText(ownerRpc, {
    conversationId,
    clientId: randomUUID(),
    body: "hello",
  });
  if (!first.ok) throw new Error("first send failed");
  const peerRpc = createRpcClient(db, peer.id);
  for (let i = 0; i < unread; i += 1) {
    const sent = await sendText(peerRpc, {
      conversationId,
      clientId: randomUUID(),
      body: `msg ${i}`,
    });
    if (!sent.ok) throw new Error("peer send failed");
  }
  return conversationId;
}

async function archive(userId: string, conversationId: string): Promise<void> {
  await asSuperuser(
    db,
    `update public.conversation_members set archived_at = now()
     where conversation_id = $1 and user_id = $2`,
    [conversationId, userId],
  );
}

async function ids(
  userId: string,
  args: Parameters<typeof listConversations>[1],
): Promise<string[]> {
  const result = await listConversations(createRpcClient(db, userId), args);
  if (!result.ok) throw new Error(`list failed: ${result.error.code}`);
  return result.value.items.map((item) => item.id);
}

describe("chat list filters", () => {
  it("shows only archived chats in the archived view and none of them elsewhere", async () => {
    const owner = await createUser(db, { username: "clf_arch" });
    const live = await chatWithUnread(owner, "clf_arch_p1", 0);
    const archived = await chatWithUnread(owner, "clf_arch_p2", 1);
    await archive(owner.id, archived);

    expect(await ids(owner.id, {})).toEqual([live]);
    expect(await ids(owner.id, { archivedOnly: false })).toEqual([live]);
    expect(await ids(owner.id, { archivedOnly: true })).toEqual([archived]);
  });

  it("returns only unread, non-archived chats for the unread filter", async () => {
    const owner = await createUser(db, { username: "clf_unread" });
    const read = await chatWithUnread(owner, "clf_unread_p1", 0);
    const unread = await chatWithUnread(owner, "clf_unread_p2", 2);
    const archivedUnread = await chatWithUnread(owner, "clf_unread_p3", 1);
    await archive(owner.id, archivedUnread);

    expect((await ids(owner.id, {})).sort()).toEqual([read, unread].sort());
    expect(await ids(owner.id, { unreadOnly: true })).toEqual([unread]);
  });

  it("applies the unread filter before the page limit", async () => {
    const owner = await createUser(db, { username: "clf_page" });
    const oldUnread = await chatWithUnread(owner, "clf_page_old", 1);
    await asSuperuser(
      db,
      `update public.conversations set last_message_at = now() - interval '30 days'
       where id = $1`,
      [oldUnread],
    );
    for (let i = 0; i < 31; i += 1) {
      const id = randomUUID();
      await asSuperuser(
        db,
        `insert into public.conversations (id, type, title, created_by, last_message_at)
         values ($1, 'group', $2, $3, now() - ($4 || ' minutes')::interval)`,
        [id, `read ${i}`, owner.id, String(i + 1)],
      );
      await asSuperuser(
        db,
        `insert into public.conversation_members (conversation_id, user_id) values ($1, $2)`,
        [id, owner.id],
      );
    }
    expect(await ids(owner.id, {})).toHaveLength(30);
    expect(await ids(owner.id, { unreadOnly: true })).toEqual([oldUnread]);
  }, 60_000);

  it("hides archived chats from folder views but keeps the folder membership", async () => {
    const owner = await createUser(db, { username: "clf_folder" });
    const kept = await chatWithUnread(owner, "clf_folder_p1", 0);
    const archived = await chatWithUnread(owner, "clf_folder_p2", 0);
    const folderId = randomUUID();
    await asSuperuser(
      db,
      `insert into public.chat_folders (id, user_id, name) values ($1, $2, 'Work')`,
      [folderId, owner.id],
    );
    for (const conversationId of [kept, archived]) {
      await asSuperuser(
        db,
        `insert into public.conversation_folder_items (folder_id, conversation_id)
         values ($1, $2)`,
        [folderId, conversationId],
      );
    }
    await archive(owner.id, archived);

    expect(await ids(owner.id, { folderId })).toEqual([kept]);

    await asSuperuser(
      db,
      `update public.conversation_members set archived_at = null
       where conversation_id = $1 and user_id = $2`,
      [archived, owner.id],
    );
    expect((await ids(owner.id, { folderId })).sort()).toEqual([kept, archived].sort());
  });

  it("keeps a chat archived when a new message arrives", async () => {
    const owner = await createUser(db, { username: "clf_newmsg" });
    const conversationId = await chatWithUnread(owner, "clf_newmsg_p1", 0);
    await archive(owner.id, conversationId);

    const peerRpc = createRpcClient(
      db,
      (
        await db.query<{ id: string }>(
          `select id from public.profiles where username = 'clf_newmsg_p1'`,
        )
      ).rows[0]!.id,
    );
    const sent = await sendText(peerRpc, {
      conversationId,
      clientId: randomUUID(),
      body: "still there?",
    });
    expect(sent.ok).toBe(true);

    expect(await ids(owner.id, {})).toEqual([]);
    expect(await ids(owner.id, { archivedOnly: true })).toEqual([conversationId]);
  });

  it("counts archived chats and their unread messages", async () => {
    const owner = await createUser(db, { username: "clf_sum" });
    const rpc = createRpcClient(db, owner.id);

    const empty = await getArchivedSummary(rpc);
    expect(empty).toEqual({ ok: true, value: { count: 0, unread: 0 } });

    const a = await chatWithUnread(owner, "clf_sum_p1", 2);
    const b = await chatWithUnread(owner, "clf_sum_p2", 1);
    await chatWithUnread(owner, "clf_sum_p3", 5);
    await archive(owner.id, a);
    await archive(owner.id, b);

    const summary = await getArchivedSummary(rpc);
    expect(summary).toEqual({ ok: true, value: { count: 2, unread: 3 } });

    const list = await listConversations(rpc, { archivedOnly: true });
    if (!list.ok) throw new Error("list failed");
    const latest = list.value.items.find((item) => item.id === a);
    expect(latest?.unread_count).toBe(2);
    const lastMessageId = latest?.last_message_id;
    if (!lastMessageId) throw new Error("no last message");
    await markRead(rpc, { conversationId: a, messageId: lastMessageId });

    const after = await getArchivedSummary(rpc);
    expect(after).toEqual({ ok: true, value: { count: 2, unread: 1 } });
  });

  it("reports an empty archived summary for a user without chats", async () => {
    const result = await getArchivedSummary(createRpcClient(db, randomUUID()));
    // A uid without memberships gets an empty summary, never someone else's.
    expect(result).toEqual({ ok: true, value: { count: 0, unread: 0 } });
  });
});
