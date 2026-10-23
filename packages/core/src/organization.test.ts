import { describe, expect, it, vi } from "vitest";

import { archiveConversation, clearChat, deleteChatForMe, setConversationUnread, createFolder, listFolders, moveToFolder, reorderFolders } from "./organization";
import type { RpcClient } from "./rpc";

function client(data: unknown, error?: string) {
  const rpc = vi.fn(async () => ({ data: data ?? null, error: error ? { message: error } : null }));
  return { rpc } as unknown as RpcClient & { rpc: typeof rpc };
}

describe("organization", () => {
  it("archives and maps the membership row", async () => {
    const c = client([{ pinned_at: null, muted_until: null, archived_at: "2026-01-01" }]);
    const r = await archiveConversation(c, "c1");
    expect(r).toEqual({ ok: true, value: { pinnedAt: null, mutedUntil: null, archivedAt: "2026-01-01" } });
    expect(c.rpc).toHaveBeenCalledWith("archive_conversation", { p_conversation_id: "c1" });
  });

  it("maps folders", async () => {
    const c = client([{ id: "f1", name: "Work", folder_position: 0 }]);
    expect(await listFolders(c)).toEqual({ ok: true, value: [{ id: "f1", name: "Work", position: 0 }] });
    expect(await createFolder(c, "Work")).toMatchObject({ ok: true, value: { id: "f1" } });
  });

  it("passes ids for reorder and move", async () => {
    const c = client([]);
    await reorderFolders(c, ["b", "a"]);
    await moveToFolder(c, { conversationId: "c1", folderId: "f1" });
    expect(c.rpc.mock.calls).toEqual([
      ["reorder_chat_folders", { p_folder_ids: ["b", "a"] }],
      ["move_conversation_to_folder", { p_conversation_id: "c1", p_folder_id: "f1" }],
    ]);
  });

  it("surfaces rpc errors", async () => {
    const r = await archiveConversation(client(null, "organization.not_found"), "c1");
    expect(r).toMatchObject({ ok: false, error: { code: "organization.not_found" } });
  });

  it("calls the clear, delete and unread rpcs", async () => {
    const c = client(null);
    expect(await clearChat(c, "c1")).toEqual({ ok: true, value: null });
    expect(await deleteChatForMe(c, "c1")).toEqual({ ok: true, value: null });
    expect(await setConversationUnread(c, { conversationId: "c1", unread: true })).toEqual({
      ok: true,
      value: null,
    });
    expect(c.rpc.mock.calls).toEqual([
      ["clear_chat", { p_conversation_id: "c1" }],
      ["delete_chat_for_me", { p_conversation_id: "c1" }],
      ["set_conversation_unread", { p_conversation_id: "c1", p_unread: true }],
    ]);
  });

  it("surfaces clear_chat errors", async () => {
    const r = await clearChat(client(null, "organization.not_found"), "c1");
    expect(r).toMatchObject({ ok: false, error: { code: "organization.not_found" } });
  });
});
