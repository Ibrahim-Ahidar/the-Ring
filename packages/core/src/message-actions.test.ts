import { describe, expect, it } from "vitest";

import { availableActions, editMessage } from "./message-actions";
import type { RpcClient } from "./rpc";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const base = {
  id: "m1",
  type: "text" as const,
  body: "hi",
  sender_id: "me",
  created_at: "2026-10-21T11:55:00Z",
  deletion_scope: "none" as const,
};

describe("availableActions", () => {
  it("offers everything on a recent own text message", () => {
    expect(availableActions(base, "me", NOW)).toEqual(["reply", "react", "copy", "edit", "delete"]);
  });
  it("hides edit and delete on messages from others", () => {
    expect(availableActions({ ...base, sender_id: "you" }, "me", NOW)).toEqual([
      "reply",
      "react",
      "copy",
    ]);
  });
  it("drops edit after 15 minutes but keeps delete", () => {
    const old = { ...base, created_at: "2026-10-21T11:00:00Z" };
    expect(availableActions(old, "me", NOW)).toEqual(["reply", "react", "copy", "delete"]);
  });
  it("drops delete after 48 hours", () => {
    const old = { ...base, created_at: "2026-10-18T11:00:00Z" };
    expect(availableActions(old, "me", NOW)).not.toContain("delete");
  });
  it("offers nothing on deleted or pending messages", () => {
    expect(availableActions({ ...base, deletion_scope: "everyone" }, "me", NOW)).toEqual([]);
    expect(availableActions({ ...base, id: "pending-1" }, "me", NOW)).toEqual([]);
  });
  it("non-text messages from others only get react", () => {
    expect(availableActions({ ...base, type: "image", sender_id: "you" }, "me", NOW)).toEqual([
      "react",
    ]);
  });
});

describe("editMessage", () => {
  it("rejects blank bodies without calling the server", async () => {
    const rpc = { rpc: () => Promise.reject(new Error("no")) } as unknown as RpcClient;
    const r = await editMessage(rpc, { messageId: "m1", body: "  " });
    expect(r).toEqual({ ok: false, error: { code: "message_actions.invalid_body" } });
  });
});
