import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RpcClient } from "@pulse/core/rpc";
import { setTelemetrySink } from "@/platform/telemetry";

import { requestPasswordReset, updatePassword, verifyRecoveryCode } from "./service";

type AuthError = { code?: string; status?: number; message?: string } | null;

function stubSupabase(error: AuthError = null) {
  const auth = {
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error })),
    verifyOtp: vi.fn(async () => ({ data: {}, error })),
    updateUser: vi.fn(async () => ({ data: {}, error })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

const DEVICES = [
  { id: "this-device", revoked_at: null },
  { id: "laptop", revoked_at: null },
  { id: "old-phone", revoked_at: "2026-01-01T00:00:00Z" },
  { id: "tablet", revoked_at: null },
];

function stubRpc(): RpcClient {
  return {
    rpc: vi.fn(async (fn: string) =>
      fn === "identity_list_devices"
        ? { data: DEVICES, error: null }
        : { data: fn === "identity_upsert_device" ? "device" : null, error: null },
    ),
  } as unknown as RpcClient;
}

afterEach(() => setTelemetrySink(null));

describe("requestPasswordReset", () => {
  it("sends the recovery email with the reset-page fallback link", async () => {
    const { auth, client } = stubSupabase();
    const redirectTo = "http://localhost:3000/auth/callback?next=/reset-password";
    expect(await requestPasswordReset(client, " a@b.co ", redirectTo)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co", { redirectTo });
  });

  it("asks for an email before calling Supabase", async () => {
    const { auth, client } = stubSupabase();
    expect(await requestPasswordReset(client, "  ", "x")).toEqual({
      ok: false,
      error: { code: "identity.email_required" },
    });
    expect(auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("maps email rate limits", async () => {
    const { client } = stubSupabase({ code: "over_email_send_rate_limit", status: 429 });
    expect(await requestPasswordReset(client, "a@b.co", "x")).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });
});

describe("verifyRecoveryCode", () => {
  it("verifies a recovery code, signs in and registers the device", async () => {
    const { auth, client } = stubSupabase();
    const rpc = stubRpc();
    const result = await verifyRecoveryCode(
      client,
      rpc,
      { email: " a@b.co ", token: "123456" },
      undefined,
      () => "fresh-id",
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "a@b.co",
      token: "123456",
      type: "recovery",
    });
    expect(result).toEqual({ ok: true, value: "fresh-id" });
  });

  it.each([
    [{ code: "otp_expired", status: 403 }, "identity.code_expired"],
    [{ code: "invalid_otp", status: 400 }, "identity.code_invalid"],
  ])("maps an expired or used code %o to %s", async (error, expected) => {
    const { client } = stubSupabase(error);
    const result = await verifyRecoveryCode(
      client,
      stubRpc(),
      { email: "a@b.co", token: "123456" },
      undefined,
    );
    expect(result).toEqual({ ok: false, error: { code: expected } });
  });

  it("rejects a malformed code without calling Supabase", async () => {
    const { auth, client } = stubSupabase();
    const result = await verifyRecoveryCode(
      client,
      stubRpc(),
      { email: "a@b.co", token: "12a456" },
      undefined,
    );
    expect(result).toEqual({ ok: false, error: { code: "identity.code_invalid" } });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("updatePassword", () => {
  it("sets the password, signs out other sessions and revokes other devices", async () => {
    const { auth, client } = stubSupabase();
    const rpc = stubRpc();
    const result = await updatePassword(client, rpc, "new-secret1", "this-device");

    expect(result).toEqual({ ok: true, value: undefined });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-secret1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    const revoked = vi
      .mocked(rpc.rpc)
      .mock.calls.filter(([fn]) => fn === "identity_revoke_device")
      .map(([, args]) => (args as { p_device_id: string }).p_device_id);
    expect(revoked).toEqual(["laptop", "tablet"]);
  });

  it.each([
    [{ code: "weak_password", status: 422 }, "identity.password_weak"],
    [{ code: "same_password", status: 422 }, "identity.password_same"],
    [{ code: "session_not_found", status: 403 }, "identity.reset_session_expired"],
    [{ code: "over_request_rate_limit", status: 429 }, "platform.rate_limited"],
  ])("maps %o to %s and keeps other sessions", async (error, expected) => {
    setTelemetrySink({ captureError: vi.fn(), captureEvent: vi.fn() });
    const { auth, client } = stubSupabase(error);
    const result = await updatePassword(client, stubRpc(), "new-secret1", "this-device");
    expect(result).toEqual({ ok: false, error: { code: expected } });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("rejects a short password without calling Supabase", async () => {
    const { auth, client } = stubSupabase();
    const result = await updatePassword(client, stubRpc(), "12345", "this-device");
    expect(result).toEqual({ ok: false, error: { code: "identity.password_weak" } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
