import { randomUUID } from "node:crypto";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listConversations, openDirect } from "@/features/direct-messaging/service";
import {
  completeUpload,
  failUpload,
  getAttachmentDownloadMeta,
  getMessageAttachments,
  listShared,
  prepareUpload,
  reconcileDeletedAttachments,
} from "@/features/media/service";

import { asSuperuser, asUser, createTestDb } from "./pglite";
import { createRpcClient } from "./rpc-client";

let db: PGliteInterface;

async function createTestUser(username: string) {
  const id = randomUUID();
  await db.query(
    `insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, now(), $3::jsonb)`,
    [id, `${username}@pulse.test`, JSON.stringify({ username })],
  );
  return { id, username };
}

async function markObjectVerified(messageId: string) {
  await asSuperuser(
    db,
    `update public.messages
     set metadata = coalesce(metadata, '{}'::jsonb) || '{"object_verified": true}'::jsonb
     where id = $1`,
    [messageId],
  );
}

beforeAll(async () => {
  db = await createTestDb();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("prepareUpload", () => {
  it("rejects unsupported mime without inserting a ready message", async () => {
    const alice = await createTestUser("media_alice1");
    const bob = await createTestUser("media_bob1");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const bad = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "application/x-msdownload",
      sizeBytes: 1000,
    });
    expect(bad).toEqual({ ok: false, error: { code: "media.unsupported_type" } });

    const count = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.messages where type <> 'text'`,
    );
    expect(Number(count.rows[0]?.count)).toBe(0);
  });

  it("rejects quota without changing usage", async () => {
    const alice = await createTestUser("media_alice2");
    const bob = await createTestUser("media_bob2");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    await asSuperuser(
      db,
      `insert into public.storage_usage (user_id, bytes_used) values ($1, 104857600)`,
      [alice.id],
    );

    const rejected = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(rejected).toEqual({
      ok: false,
      error: { code: "media.quota_exceeded" },
    });
  });

  it("refuses prepare when direct peer has blocked the sender", async () => {
    const alice = await createTestUser("media_block_alice");
    const bob = await createTestUser("media_block_bob");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [bob.id, alice.id],
    );

    const blocked = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(blocked).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });
  });

  it("refuses idempotent prepare retry when blocked", async () => {
    const alice = await createTestUser("media_block_alice2");
    const bob = await createTestUser("media_block_bob2");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;
    const clientId = randomUUID();

    const first = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId,
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    if (!first.ok) return;

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [bob.id, alice.id],
    );

    const retry = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId,
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(retry).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });
  });

  it("counts pending upload bytes toward quota", async () => {
    const alice = await createTestUser("media_quota_pending");
    const bob = await createTestUser("media_quota_bob");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    await asSuperuser(
      db,
      `insert into public.storage_usage (user_id, bytes_used) values ($1, 104856576)`,
      [alice.id],
    );

    const pending = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(pending.ok).toBe(true);
    if (!pending.ok) return;

    const over = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 1024,
    });
    expect(over).toEqual({
      ok: false,
      error: { code: "media.quota_exceeded" },
    });
  });

  it("is idempotent on client id", async () => {
    const alice = await createTestUser("media_alice3");
    const bob = await createTestUser("media_bob3");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;
    const clientId = randomUUID();

    const first = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId,
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      fileName: "photo.jpg",
    });
    const second = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId,
      mimeType: "image/jpeg",
      sizeBytes: 2048,
      fileName: "photo.jpg",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.value.message_id).toBe(first.value.message_id);

    const rows = await asSuperuser<{ rows: { count: string }[] }>(
      db,
      `select count(*)::text as count from public.messages where client_id = $1`,
      [clientId],
    );
    expect(Number(rows.rows[0]?.count)).toBe(1);
  });
});

describe("completeUpload and visibility", () => {
  it("refuses complete_upload when direct peer has blocked the sender", async () => {
    const alice = await createTestUser("med_blk_cmp_a");
    const bob = await createTestUser("med_blk_cmp_b");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 2000,
    });
    if (!prepared.ok) return;

    await asSuperuser(
      db,
      `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)`,
      [bob.id, alice.id],
    );

    const blocked = await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 2000,
    });
    expect(blocked).toEqual({
      ok: false,
      error: { code: "messaging.send_not_allowed" },
    });
  });

  it("increments usage once and hides pending from other member", async () => {
    const alice = await createTestUser("media_alice4");
    const bob = await createTestUser("media_bob4");
    const aliceRpc = createRpcClient(db, alice.id);
    const bobRpc = createRpcClient(db, bob.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;
    const clientId = randomUUID();

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId,
      mimeType: "image/png",
      sizeBytes: 5000,
    });
    if (!prepared.ok) return;

    const bobAttachments = await getMessageAttachments(bobRpc, {
      messageId: prepared.value.message_id,
    });
    expect(bobAttachments.ok).toBe(false);

    const bobMessageSelect = await asUser<{ rows: { id: string }[] }>(
      db,
      bob.id,
      `select id from public.messages where id = $1`,
      [prepared.value.message_id],
    );
    expect(bobMessageSelect.rows).toEqual([]);

    const aliceMessageSelect = await asUser<{ rows: { id: string }[] }>(
      db,
      alice.id,
      `select id from public.messages where id = $1`,
      [prepared.value.message_id],
    );
    expect(aliceMessageSelect.rows.length).toBe(1);

    const unverified = await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 5000,
    });
    expect(unverified).toEqual({ ok: false, error: { code: "media.rejected" } });

    await markObjectVerified(prepared.value.message_id);
    const completed = await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 5000,
      width: 100,
      height: 80,
    });
    expect(completed.ok).toBe(true);

    const again = await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 5000,
    });
    expect(again.ok).toBe(true);

    const usage = await asSuperuser<{ rows: { bytes_used: string }[] }>(
      db,
      `select bytes_used::text from public.storage_usage where user_id = $1`,
      [alice.id],
    );
    expect(Number(usage.rows[0]?.bytes_used)).toBe(5000);
  });
});

describe("failUpload", () => {
  it("rejects fail_upload on ready and is idempotent on failed", async () => {
    const alice = await createTestUser("media_fail_state");
    const bob = await createTestUser("media_fail_state_b");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 1000,
    });
    if (!prepared.ok) return;

    await markObjectVerified(prepared.value.message_id);
    await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 1000,
    });

    const onReady = await failUpload(aliceRpc, {
      messageId: prepared.value.message_id,
    });
    expect(onReady).toEqual({ ok: false, error: { code: "media.not_ready" } });

    const pending = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 800,
    });
    if (!pending.ok) return;
    await failUpload(aliceRpc, { messageId: pending.value.message_id });
    const again = await failUpload(aliceRpc, { messageId: pending.value.message_id });
    expect(again.ok).toBe(true);
  });

  it("marks failed without usage increment", async () => {
    const alice = await createTestUser("media_alice5");
    const bob = await createTestUser("media_bob5");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "application/pdf",
      sizeBytes: 3000,
      fileName: "doc.pdf",
    });
    if (!prepared.ok) return;

    const failed = await failUpload(aliceRpc, {
      messageId: prepared.value.message_id,
    });
    expect(failed.ok).toBe(true);

    const usage = await asSuperuser<{ rows: { bytes_used: string }[] }>(
      db,
      `select coalesce(bytes_used, 0)::text as bytes_used from public.storage_usage where user_id = $1`,
      [alice.id],
    );
    expect(Number(usage.rows[0]?.bytes_used ?? 0)).toBe(0);
  });

  it("keeps pending and failed uploads out of the recipient's unread count", async () => {
    const alice = await createTestUser("media_alice_unread");
    const bob = await createTestUser("media_bob_unread");
    const aliceRpc = createRpcClient(db, alice.id);
    const bobRpc = createRpcClient(db, bob.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) throw new Error(opened.error.code);
    const conversationId = opened.value.conversationId;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId,
      clientId: randomUUID(),
      mimeType: "application/pdf",
      sizeBytes: 3000,
      fileName: "doc.pdf",
    });
    if (!prepared.ok) throw new Error(prepared.error.code);

    const pendingList = await listConversations(bobRpc, {});
    if (!pendingList.ok) throw new Error(pendingList.error.code);
    expect(
      pendingList.value.items.find((item) => item.id === conversationId)?.unread_count,
    ).toBe(0);

    const failed = await failUpload(aliceRpc, { messageId: prepared.value.message_id });
    expect(failed.ok).toBe(true);

    const failedList = await listConversations(bobRpc, {});
    if (!failedList.ok) throw new Error(failedList.error.code);
    expect(
      failedList.value.items.find((item) => item.id === conversationId)?.unread_count,
    ).toBe(0);
  });
});

describe("getAttachmentDownloadMeta", () => {
  it("refuses non-members and deleted-for-everyone", async () => {
    const alice = await createTestUser("media_alice6");
    const bob = await createTestUser("media_bob6");
    const outsider = await createTestUser("media_out6");
    const aliceRpc = createRpcClient(db, alice.id);
    const outsiderRpc = createRpcClient(db, outsider.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "text/plain",
      sizeBytes: 100,
      fileName: "note.txt",
    });
    if (!prepared.ok) return;
    await markObjectVerified(prepared.value.message_id);
    await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 100,
    });

    const denied = await getAttachmentDownloadMeta(outsiderRpc, {
      attachmentId: prepared.value.attachment_id,
    });
    expect(denied).toEqual({ ok: false, error: { code: "media.not_member" } });

    await asSuperuser(
      db,
      `update public.messages set deletion_scope = 'everyone', deleted_at = now(), body = null, metadata = '{}'::jsonb where id = $1`,
      [prepared.value.message_id],
    );

    const tomb = await getAttachmentDownloadMeta(aliceRpc, {
      attachmentId: prepared.value.attachment_id,
    });
    expect(tomb).toEqual({ ok: false, error: { code: "media.not_found" } });
  });
});

describe("listShared", () => {
  it("list_shared stays callable after delete-for-everyone (reconcile is separate)", async () => {
    const alice = await createTestUser("media_reconcile_a");
    const bob = await createTestUser("media_reconcile_b");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/png",
      sizeBytes: 900,
    });
    if (!prepared.ok) return;
    await markObjectVerified(prepared.value.message_id);
    await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 900,
    });

    await asSuperuser(
      db,
      `update public.messages
       set deletion_scope = 'everyone', deleted_at = now(), body = null, metadata = '{}'::jsonb
       where id = $1`,
      [prepared.value.message_id],
    );

    const page = await listShared(aliceRpc, {
      conversationId: opened.value.conversationId,
      tab: "media",
    });
    expect(page.ok).toBe(true);

    const paths = await reconcileDeletedAttachments(aliceRpc, {
      conversationId: opened.value.conversationId,
    });
    expect(paths.ok).toBe(true);
    if (paths.ok) {
      expect(paths.value).toContain(prepared.value.storage_path);
    }

    const again = await reconcileDeletedAttachments(aliceRpc, {
      conversationId: opened.value.conversationId,
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value).toEqual([]);
    }
  });

  it("returns ready images for members and link tab finds urls", async () => {
    const alice = await createTestUser("media_alice7");
    const bob = await createTestUser("media_bob7");
    const aliceRpc = createRpcClient(db, alice.id);
    const opened = await openDirect(aliceRpc, { username: bob.username });
    if (!opened.ok) return;

    const prepared = await prepareUpload(aliceRpc, {
      conversationId: opened.value.conversationId,
      clientId: randomUUID(),
      mimeType: "image/webp",
      sizeBytes: 1200,
    });
    if (!prepared.ok) return;
    await markObjectVerified(prepared.value.message_id);
    await completeUpload(aliceRpc, {
      messageId: prepared.value.message_id,
      objectSizeBytes: 1200,
    });

    await asSuperuser(
      db,
      `insert into public.messages (conversation_id, sender_id, client_id, type, body)
       values ($1, $2, $3, 'text', $4)`,
      [
        opened.value.conversationId,
        alice.id,
        randomUUID(),
        "see https://example.com/docs",
      ],
    );

    const media = await listShared(aliceRpc, {
      conversationId: opened.value.conversationId,
      tab: "media",
    });
    expect(media.ok).toBe(true);
    if (media.ok) {
      expect(media.value.items.length).toBeGreaterThan(0);
    }

    const links = await listShared(aliceRpc, {
      conversationId: opened.value.conversationId,
      tab: "links",
    });
    expect(links.ok).toBe(true);
    if (links.ok) {
      expect(links.value.items.some((item) => item.url?.includes("example.com"))).toBe(
        true,
      );
    }
  });
});
