import { afterEach, describe, expect, it, vi } from "vitest";

import type { RpcClient } from "@/platform/rpc";

import { listMessages } from "./service";

function rpcReturning(result: { data: unknown; error: { message: string; code?: string } | null }): RpcClient {
  return { rpc: async () => result };
}

describe("listMessages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("surfaces a feature error code instead of an empty list", async () => {
    const result = await listMessages(
      rpcReturning({ data: null, error: { message: "messaging.not_member" } }),
      { conversationId: "c1" },
    );
    expect(result).toEqual({ ok: false, error: { code: "messaging.not_member" } });
  });

  it("logs the underlying cause of an unexpected database error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await listMessages(
      rpcReturning({ data: null, error: { message: 'column reference "id" is ambiguous', code: "42702" } }),
      { conversationId: "c1" },
    );
    expect(result).toEqual({ ok: false, error: { code: "platform.unexpected" } });
    expect(spy).toHaveBeenCalledWith(
      "[rpc] list_messages failed",
      expect.objectContaining({ pgCode: "42702" }),
    );
  });

  it("returns rows and has_more from the first row", async () => {
    const rows = [{ id: "m1", has_more: true }, { id: "m0", has_more: true }];
    const result = await listMessages(rpcReturning({ data: rows, error: null }), {
      conversationId: "c1",
    });
    expect(result).toEqual({ ok: true, value: { items: rows, hasMore: true } });
  });
});
