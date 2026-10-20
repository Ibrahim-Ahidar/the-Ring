import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  getConversation,
  getConversationReceipts,
  markRead,
  openDirect,
  sendText,
} from "@/features/direct-messaging/service";

import { asSuperuser, createTestDb, type TestUser } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createUser(
  username: string,
  sendReadReceipts: boolean,
): Promise<TestUser> {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, `${username}@pulse.test`, JSON.stringify({ username })],
  );
  await asSuperuser(
    db,
    `update public.profiles set send_read_receipts = $2 where id = $1`,
    [id, sendReadReceipts],
  );
  return { id, username };
}

/** viewer sends one message, peer reads it; returns what the viewer can see. */
async function scenario(viewerOn: boolean, peerOn: boolean, tag: string) {
  const viewer = await createUser(`rc_v_${tag}`, viewerOn);
  const peer = await createUser(`rc_p_${tag}`, peerOn);
  const viewerRpc = createRpcClient(db, viewer.id);
  const peerRpc = createRpcClient(db, peer.id);
  const opened = await openDirect(viewerRpc, { username: peer.username });
  if (!opened.ok) throw new Error("open failed");
  const conversationId = opened.value.conversationId;
  const sent = await sendText(viewerRpc, {
    conversationId,
    clientId: randomUUID(),
    body: "hello",
  });
  if (!sent.ok) throw new Error("send failed");
  const marked = await markRead(peerRpc, { conversationId, messageId: sent.value.id });
  if (!marked.ok) throw new Error("mark read failed");

  const detail = await getConversation(viewerRpc, { conversationId });
  if (!detail.ok) throw new Error("detail failed");
  const receipts = await getConversationReceipts(viewerRpc, {
    conversationIds: [conversationId],
  });
  if (!receipts.ok) throw new Error("receipts failed");
  return {
    detail: detail.value,
    receipt: receipts.value[conversationId],
    messageId: sent.value.id,
  };
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  if (db) await db.close();
});

describe("read receipt reciprocity", () => {
  it("shows read when both sides send read receipts", async () => {
    const r = await scenario(true, true, "both");
    expect(r.detail.other_last_read_message_id).toBe(r.messageId);
    expect(r.detail.other_last_read_created_at).not.toBeNull();
    expect(r.receipt).toEqual({ status: "read", messageId: r.messageId });
  });

  it("hides read from a viewer whose own receipts are off", async () => {
    const r = await scenario(false, true, "viewer_off");
    expect(r.detail.other_last_read_message_id).toBeNull();
    expect(r.detail.other_last_read_created_at).toBeNull();
    expect(r.receipt.status).not.toBe("read");
    expect(r.receipt.messageId).toBe(r.messageId);
  });

  it("hides read when the other side's receipts are off", async () => {
    const r = await scenario(true, false, "peer_off");
    expect(r.detail.other_send_read_receipts).toBe(false);
    expect(r.detail.other_last_read_message_id).toBeNull();
    expect(r.receipt.status).not.toBe("read");
  });

  it("hides read when both sides have receipts off", async () => {
    const r = await scenario(false, false, "none");
    expect(r.detail.other_last_read_message_id).toBeNull();
    expect(r.receipt.status).not.toBe("read");
  });
});
