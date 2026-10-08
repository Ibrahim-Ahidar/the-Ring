import { describe, expect, it, vi } from "vitest";

import { callRpc, mapRpcError, type RpcClient } from "./rpc";

describe("mapRpcError", () => {
  it("passes through feature error codes in the message", () => {
    expect(mapRpcError("identity.username_taken")).toBe(
      "identity.username_taken",
    );
    expect(mapRpcError("platform.invalid_action", "P0001")).toBe(
      "platform.invalid_action",
    );
  });

  it("maps postgres privilege errors", () => {
    expect(mapRpcError("permission denied", "42501")).toBe(
      "platform.forbidden",
    );
  });

  it("maps unique violations", () => {
    expect(mapRpcError("duplicate key", "23505")).toBe("platform.conflict");
  });

  it("maps unknown errors", () => {
    expect(mapRpcError("something broke", "XX000")).toBe("platform.unexpected");
  });
});

describe("callRpc", () => {
  it("returns ok on success", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({ data: { id: "1" }, error: null }),
    };
    const result = await callRpc<{ id: string }>(client, "test_fn");
    expect(result).toEqual({ ok: true, value: { id: "1" } });
  });

  it("returns err with mapped code", async () => {
    const client: RpcClient = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "platform.rate_limited", code: "P0001" },
      }),
    };
    const result = await callRpc(client, "test_fn");
    expect(result).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });
});
