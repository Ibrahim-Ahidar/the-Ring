import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PGliteInterface } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listConversations, openDirect } from "@/features/direct-messaging/service";
import {
  archiveConversation,
  createFolder,
  deleteFolder,
  listFolders,
  moveToFolder,
  muteConversation,
  pinConversation,
  reorderFolders,
  unmuteConversation,
} from "@/features/conversation-organization/service";
import { muteUntilForDuration } from "@/features/conversation-organization/mute-until";
import { notify } from "@/platform/notify";

import { asSuperuser, createTestDb, createUser, type TestUser } from "./pglite";
import { createRpcClient, createSuperuserRpcClient } from "./rpc-client";

process.env.PULSE_TEST_MIGRATIONS_UNTIL = "20261010020000_reactions.sql";

let db: PGliteInterface;

async function createTestUser(username: string): Promise<TestUser> {
  return createUser(db, { username });
}

beforeAll(async () => {
  db = await createTestDb();
  const orgMigration = await readFile(
    path.join(
      import.meta.dirname,
      "../../supabase/migrations/20261010060000_conversation_organization.sql",
    ),
    "utf8",
  );
  await db.exec(orgMigration);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("conversation organization", () => {
  it("pins only the caller membership", async () => {
    const owner = await createTestUser("org_pin_a");
    const peer = await createTestUser("org_pin_b");
    const ownerRpc = createRpcClient(db, owner.id);
    const peerRpc = createRpcClient(db, peer.id);

    const opened = await openDirect(ownerRpc, { username: "org_pin_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const pinned = await pinConversation(ownerRpc, conversationId);
    expect(pinned.ok).toBe(true);
    if (!pinned.ok) return;
    expect(pinned.value.pinnedAt).not.toBeNull();

    const ownerRow = await asSuperuser<{ rows: { pinned_at: string | null }[] }>(
      db,
      `select pinned_at from public.conversation_members
       where conversation_id = $1 and user_id = $2`,
      [conversationId, owner.id],
    );
    const peerRow = await asSuperuser<{ rows: { pinned_at: string | null }[] }>(
      db,
      `select pinned_at from public.conversation_members
       where conversation_id = $1 and user_id = $2`,
      [conversationId, peer.id],
    );
    expect(ownerRow.rows[0]?.pinned_at).not.toBeNull();
    expect(peerRow.rows[0]?.pinned_at).toBeNull();

    const peerPin = await pinConversation(peerRpc, conversationId);
    expect(peerPin.ok).toBe(true);
    if (!peerPin.ok) return;
    expect(peerPin.value.pinnedAt).not.toBeNull();

    const ownerAfter = await asSuperuser<{ rows: { pinned_at: string | null }[] }>(
      db,
      `select pinned_at from public.conversation_members
       where conversation_id = $1 and user_id = $2`,
      [conversationId, owner.id],
    );
    expect(ownerAfter.rows[0]?.pinned_at).toEqual(ownerRow.rows[0]?.pinned_at);
  });

  it("archives out of default list and shows when includeArchived", async () => {
    const owner = await createTestUser("org_arc_a");
    await createTestUser("org_arc_b");
    const rpc = createRpcClient(db, owner.id);
    const opened = await openDirect(rpc, { username: "org_arc_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const archived = await archiveConversation(rpc, conversationId);
    expect(archived.ok).toBe(true);

    const hidden = await listConversations(rpc, {});
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.value.items).toHaveLength(0);

    const shown = await listConversations(rpc, { includeArchived: true });
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    expect(shown.value.items).toHaveLength(1);
  });

  it("mute blocks notify until unmute", async () => {
    const owner = await createTestUser("org_mute_a");
    const peer = await createTestUser("org_mute_b");
    const ownerRpc = createRpcClient(db, owner.id);
    const opened = await openDirect(ownerRpc, { username: "org_mute_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const until = muteUntilForDuration("1h");
    const muted = await muteConversation(ownerRpc, { conversationId, until });
    expect(muted.ok).toBe(true);

    const admin = createSuperuserRpcClient(db);
    const skipped = await notify(admin, {
      recipientId: owner.id,
      type: "message",
      actorId: peer.id,
      entityId: randomUUID(),
      conversationId,
    });
    expect(skipped).toEqual({ ok: true, value: "notifications.skipped_muted" });

    const unmuted = await unmuteConversation(ownerRpc, conversationId);
    expect(unmuted.ok).toBe(true);

    const created = await notify(admin, {
      recipientId: owner.id,
      type: "message",
      actorId: peer.id,
      entityId: randomUUID(),
      conversationId,
    });
    expect(created).toEqual({ ok: true, value: "notifications.created" });
  });

  it("returns organization.not_found for non-members", async () => {
    const a = await createTestUser("org_nm_a");
    const b = await createTestUser("org_nm_b");
    const c = await createTestUser("org_nm_c");
    const aRpc = createRpcClient(db, a.id);
    const cRpc = createRpcClient(db, c.id);
    const opened = await openDirect(aRpc, { username: "org_nm_b" });
    if (!opened.ok) throw new Error("open failed");

    const denied = await pinConversation(cRpc, opened.value.conversationId);
    expect(denied).toEqual({ ok: false, error: { code: "organization.not_found" } });
  });

  it("move to folder is exclusive and delete folder keeps chats unarchived", async () => {
    const owner = await createTestUser("org_fld_a");
    await createTestUser("org_fld_b");
    const rpc = createRpcClient(db, owner.id);
    const opened = await openDirect(rpc, { username: "org_fld_b" });
    if (!opened.ok) throw new Error("open failed");
    const conversationId = opened.value.conversationId;

    const f1 = await createFolder(rpc, "Work");
    const f2 = await createFolder(rpc, "Personal");
    if (!f1.ok || !f2.ok) throw new Error("folder create failed");

    await moveToFolder(rpc, { conversationId, folderId: f1.value.id });
    await moveToFolder(rpc, { conversationId, folderId: f2.value.id });

    const items = await asSuperuser<{ rows: { folder_id: string }[] }>(
      db,
      `select cfi.folder_id
       from public.conversation_folder_items cfi
       join public.chat_folders f on f.id = cfi.folder_id
       where f.user_id = $1 and cfi.conversation_id = $2`,
      [owner.id, conversationId],
    );
    expect(items.rows).toHaveLength(1);
    expect(items.rows[0]?.folder_id).toBe(f2.value.id);

    const inFolder = await listConversations(rpc, { folderId: f2.value.id });
    expect(inFolder.ok && inFolder.value.items).toHaveLength(1);

    const deleted = await deleteFolder(rpc, f2.value.id);
    expect(deleted.ok).toBe(true);

    const main = await listConversations(rpc, {});
    expect(main.ok && main.value.items).toHaveLength(1);

    const archivedCheck = await asSuperuser<{ rows: { archived_at: string | null }[] }>(
      db,
      `select archived_at from public.conversation_members
       where conversation_id = $1 and user_id = $2`,
      [conversationId, owner.id],
    );
    expect(archivedCheck.rows[0]?.archived_at).toBeNull();
  });

  it("reorder folders persists positions", async () => {
    const owner = await createTestUser("org_reord");
    const rpc = createRpcClient(db, owner.id);
    const a = await createFolder(rpc, "A");
    const b = await createFolder(rpc, "B");
    const c = await createFolder(rpc, "C");
    if (!a.ok || !b.ok || !c.ok) throw new Error("create failed");

    const reordered = await reorderFolders(rpc, [c.value.id, a.value.id, b.value.id]);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(reordered.value.map((f) => f.name)).toEqual(["C", "A", "B"]);
    expect(reordered.value.map((f) => f.position)).toEqual([0, 1, 2]);
  });

  it("folders are private to owner", async () => {
    const owner = await createTestUser("org_priv_a");
    const other = await createTestUser("org_priv_b");
    const ownerRpc = createRpcClient(db, owner.id);
    const otherRpc = createRpcClient(db, other.id);

    const created = await createFolder(ownerRpc, "Secret");
    if (!created.ok) throw new Error("create failed");

    const ownerList = await listFolders(ownerRpc);
    expect(ownerList.ok && ownerList.value).toHaveLength(1);

    const otherList = await listFolders(otherRpc);
    expect(otherList.ok && otherList.value).toHaveLength(0);
  });
});
