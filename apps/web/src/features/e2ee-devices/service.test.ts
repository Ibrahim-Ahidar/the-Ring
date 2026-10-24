import { describe, expect, it } from "vitest";
import type { RpcClient } from "@pulse/core";

import { listOwnDevices, removeDevice } from "./service";

describe("e2ee-devices service", () => {
  it("calls list_devices and remove_device with the RPC argument names", async () => {
    const calls: unknown[][] = [];
    const client = {
      async rpc(fn: string, args: unknown) {
        calls.push([fn, args]);
        return { data: fn === "list_devices" ? [] : null, error: null };
      },
    } as unknown as RpcClient;
    expect(await listOwnDevices(client)).toEqual({ ok: true, value: [] });
    expect((await removeDevice(client, "d1")).ok).toBe(true);
    expect(calls).toEqual([
      ["list_devices", {}],
      ["remove_device", { p_device_id: "d1" }],
    ]);
  });

  it("maps a feature error code", async () => {
    const client = {
      async rpc() {
        return { data: null, error: { message: "e2ee.device_not_found" } };
      },
    } as unknown as RpcClient;
    expect(await removeDevice(client, "d1")).toEqual({
      ok: false,
      error: { code: "e2ee.device_not_found" },
    });
  });
});
