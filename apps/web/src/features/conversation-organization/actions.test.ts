import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSessionContext = vi.fn();

vi.mock("@/platform/session", () => ({
  getSessionContext: () => getSessionContext(),
}));

import {
  clearChatAction,
  deleteChatAction,
  setConversationUnreadAction,
} from "./actions";

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  getSessionContext.mockReset();
  getSessionContext.mockResolvedValue({ rpc: { rpc } });
});

describe("chat clear/delete/unread actions", () => {
  it("clears a chat through clear_chat", async () => {
    expect(await clearChatAction("c1")).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("clear_chat", { p_conversation_id: "c1" });
  });

  it("deletes a chat for me through delete_chat_for_me", async () => {
    expect(await deleteChatAction("c1")).toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_chat_for_me", { p_conversation_id: "c1" });
  });

  it("flags unread through set_conversation_unread", async () => {
    await setConversationUnreadAction({ conversationId: "c1", unread: true });
    expect(rpc).toHaveBeenCalledWith("set_conversation_unread", {
      p_conversation_id: "c1",
      p_unread: true,
    });
  });

  it("rejects without a session", async () => {
    getSessionContext.mockResolvedValue(null);
    expect(await clearChatAction("c1")).toMatchObject({
      ok: false,
      error: { code: "platform.unauthenticated" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
