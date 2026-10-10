import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listMessages, openDirect } from "@/features/direct-messaging/service";
import {
  acceptRequest,
  createRequest,
  declineRequest,
  listIncoming,
  listOutgoing,
} from "@/features/message-requests/service";

import { asSuperuser, createTestDb, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createMember(
  username: string,
  profileOverrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const id = randomUUID();
  const email = `${username}@pulse.test`;
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, email, JSON.stringify({ username })],
  );
  if (Object.keys(profileOverrides).length > 0) {
    const sets = Object.keys(profileOverrides).map((k, i) => `${k} = $${i + 2}`);
    await asSuperuser(
      db,
      `update public.profiles set ${sets.join(", ")} where id = $1`,
      [id, ...Object.values(profileOverrides)],
    );
  }
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

describe("createRequest", () => {
  it("creates one pending row and zero conversations when privacy is requests", async () => {
    const sender = await createMember("mr_sender", {});
    const recipient = await createMember("mr_recipient", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);

    const created = await createRequest(senderRpc, {
      username: recipient.username,
      note: "Hello there",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const dup = await createRequest(senderRpc, {
      username: recipient.username,
      note: "Another",
    });
    expect(dup.ok).toBe(true);
    if (!dup.ok) return;
    expect(dup.value.id).toBe(created.value.id);

    const convCount = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.conversations`,
    );
    expect(Number(convCount.rows[0]?.count)).toBe(0);

    const pending = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.message_requests where status = 'pending'`,
    );
    expect(Number(pending.rows[0]?.count)).toBe(1);
  });

  it("returns not_allowed on block and not_required when everyone", async () => {
    const sender = await createMember("mr_sender2");
    const blocked = await createMember("mr_blocked", { who_can_message: "requests" });
    const open = await createMember("mr_open", { who_can_message: "everyone" });
    const senderRpc = createRpcClient(db, sender.id);

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [blocked.id, sender.id],
    );

    const denied = await createRequest(senderRpc, {
      username: blocked.username,
      note: "nope",
    });
    expect(denied).toEqual({
      ok: false,
      error: { code: "message_requests.not_allowed" },
    });

    const notNeeded = await createRequest(senderRpc, {
      username: open.username,
    });
    expect(notNeeded).toEqual({
      ok: false,
      error: { code: "message_requests.not_required" },
    });
  });

  it("notifies the recipient on create", async () => {
    const sender = await createMember("mr_sender3");
    const recipient = await createMember("mr_recipient3", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);

    const created = await createRequest(senderRpc, {
      username: recipient.username,
      note: "Ping",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const notes = await asSuperuser<{ rows: { type: string }[] }>(
      db,
      `select type from public.notifications where recipient_id = $1 and entity_id = $2`,
      [recipient.id, created.value.id],
    );
    expect(notes.rows.some((row) => row.type === "message_request.created")).toBe(true);
  });
});

describe("accept and decline", () => {
  it("accept creates one direct conversation and first message from note", async () => {
    const sender = await createMember("mr_a_sender");
    const recipient = await createMember("mr_a_recipient", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);
    const recipientRpc = createRpcClient(db, recipient.id);

    const created = await createRequest(senderRpc, {
      username: recipient.username,
      note: "First words",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const accepted = await acceptRequest(recipientRpc, created.value.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    const again = await acceptRequest(recipientRpc, created.value.id);
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.conversationId).toBe(accepted.value.conversationId);

    const convCount = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count
       from public.conversations c
       where c.type = 'direct'
         and c.direct_pair_key = public.direct_pair_key($1::uuid, $2::uuid)`,
      [sender.id, recipient.id],
    );
    expect(Number(convCount.rows[0]?.count)).toBe(1);

    const messages = await listMessages(recipientRpc, {
      conversationId: accepted.value.conversationId,
    });
    expect(messages.ok).toBe(true);
    if (!messages.ok) return;
    expect(messages.value.items.some((m) => m.body === "First words")).toBe(true);

    const notify = await asSuperuser<{ rows: { type: string }[] }>(
      db,
      `select type from public.notifications where recipient_id = $1`,
      [sender.id],
    );
    expect(notify.rows.some((row) => row.type === "message_request.accepted")).toBe(
      true,
    );
  });

  it("decline creates no conversation and is idempotent", async () => {
    const sender = await createMember("mr_d_sender");
    const recipient = await createMember("mr_d_recipient", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);
    const recipientRpc = createRpcClient(db, recipient.id);

    const created = await createRequest(senderRpc, { username: recipient.username });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const declined = await declineRequest(recipientRpc, created.value.id);
    expect(declined.ok).toBe(true);

    const again = await declineRequest(recipientRpc, created.value.id);
    expect(again.ok).toBe(true);

    const convCount = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count
       from public.conversations c
       where c.type = 'direct'
         and c.direct_pair_key = public.direct_pair_key($1::uuid, $2::uuid)`,
      [sender.id, recipient.id],
    );
    expect(Number(convCount.rows[0]?.count)).toBe(0);
  });

  it("sender cannot accept; stranger cannot see incoming list", async () => {
    const sender = await createMember("mr_s_sender");
    const recipient = await createMember("mr_s_recipient", {
      who_can_message: "requests",
    });
    const stranger = await createMember("mr_stranger");
    const senderRpc = createRpcClient(db, sender.id);
    const strangerRpc = createRpcClient(db, stranger.id);

    const created = await createRequest(senderRpc, { username: recipient.username });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const senderAccept = await acceptRequest(senderRpc, created.value.id);
    expect(senderAccept).toEqual({
      ok: false,
      error: { code: "message_requests.not_found" },
    });

    const strangerIncoming = await listIncoming(strangerRpc);
    expect(strangerIncoming.ok).toBe(true);
    if (!strangerIncoming.ok) return;
    expect(strangerIncoming.value).toEqual([]);
  });

  it("accept fails after recipient blocks sender", async () => {
    const sender = await createMember("mr_b_sender");
    const recipient = await createMember("mr_b_recipient", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);
    const recipientRpc = createRpcClient(db, recipient.id);

    const created = await createRequest(senderRpc, { username: recipient.username });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [recipient.id, sender.id],
    );

    const accepted = await acceptRequest(recipientRpc, created.value.id);
    expect(accepted).toEqual({
      ok: false,
      error: { code: "message_requests.not_allowed" },
    });
  });

  it("after accept openDirect returns conversation not not_required for sender", async () => {
    const sender = await createMember("mr_o_sender");
    const recipient = await createMember("mr_o_recipient", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);
    const recipientRpc = createRpcClient(db, recipient.id);

    const created = await createRequest(senderRpc, { username: recipient.username });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const accepted = await acceptRequest(recipientRpc, created.value.id);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;

    const open = await openDirect(senderRpc, { username: recipient.username });
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    expect(open.value.conversationId).toBe(accepted.value.conversationId);

    const retryRequest = await createRequest(senderRpc, { username: recipient.username });
    expect(retryRequest).toEqual({
      ok: false,
      error: { code: "message_requests.not_required" },
    });
  });
});

describe("listOutgoing", () => {
  it("shows pending status for sender", async () => {
    const sender = await createMember("mr_l_sender");
    const recipient = await createMember("mr_l_recipient", {
      who_can_message: "requests",
    });
    const senderRpc = createRpcClient(db, sender.id);

    await createRequest(senderRpc, { username: recipient.username, note: "Hi" });

    const outgoing = await listOutgoing(senderRpc);
    expect(outgoing.ok).toBe(true);
    if (!outgoing.ok) return;
    expect(outgoing.value).toHaveLength(1);
    expect(outgoing.value[0]?.status).toBe("pending");
    expect(outgoing.value[0]?.username).toBe(recipient.username);
  });
});
