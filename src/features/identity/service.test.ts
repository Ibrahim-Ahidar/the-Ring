import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RpcClient } from "@/platform/rpc";
import { setTelemetrySink } from "@/platform/telemetry";

import { resendSignupCode, signIn, verifySignupCode } from "./service";

type AuthError = { code?: string; status?: number; message?: string } | null;

function stubSupabase(error: AuthError) {
  const auth = {
    signInWithPassword: vi.fn(async () => ({ data: {}, error })),
    verifyOtp: vi.fn(async () => ({ data: {}, error })),
    resend: vi.fn(async () => ({ data: {}, error })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

function stubRpc(): RpcClient {
  return { rpc: vi.fn(async () => ({ data: "device", error: null })) } as unknown as RpcClient;
}

const credentials = { email: " a@b.co ", password: "secret-pass" };

afterEach(() => setTelemetrySink(null));

describe("signIn error mapping", () => {
  it.each([
    [{ code: "invalid_credentials", status: 400 }, "identity.credentials_rejected"],
    [{ code: "email_not_confirmed", status: 400 }, "identity.confirmation_required"],
    [{ code: "over_request_rate_limit", status: 429 }, "platform.rate_limited"],
    [{ status: 429 }, "platform.rate_limited"],
    [{ code: "unexpected_failure", status: 500 }, "platform.unexpected"],
    [{ status: 0, message: "fetch failed" }, "platform.unexpected"],
  ])("maps %o to %s", async (error, expected) => {
    setTelemetrySink({ captureError: vi.fn(), captureEvent: vi.fn() });
    const { client } = stubSupabase(error);
    const result = await signIn(client, stubRpc(), credentials, undefined, () => "id-1");
    expect(result).toEqual({ ok: false, error: { code: expected } });
  });

  it("ignores the message text and uses the error code", async () => {
    const { client } = stubSupabase({
      code: "email_not_confirmed",
      message: "Invalid login credentials",
    });
    const result = await signIn(client, stubRpc(), credentials, undefined);
    expect(result).toEqual({ ok: false, error: { code: "identity.confirmation_required" } });
  });

  it("reports unknown failures through telemetry", async () => {
    const captureError = vi.fn();
    setTelemetrySink({ captureError, captureEvent: vi.fn() });
    const { client } = stubSupabase({ code: "unexpected_failure", status: 500 });
    await signIn(client, stubRpc(), credentials, undefined);
    expect(captureError).toHaveBeenCalledTimes(1);
    expect(captureError.mock.calls[0]![1]).toMatchObject({
      operation: "identity.sign_in",
      authCode: "unexpected_failure",
    });
  });

  it("does not report wrong credentials", async () => {
    const captureError = vi.fn();
    setTelemetrySink({ captureError, captureEvent: vi.fn() });
    const { client } = stubSupabase({ code: "invalid_credentials", status: 400 });
    await signIn(client, stubRpc(), credentials, undefined);
    expect(captureError).not.toHaveBeenCalled();
  });
});

describe("verifySignupCode", () => {
  it.each([
    [{ code: "otp_expired", status: 403 }, "identity.code_expired"],
    [{ code: "invalid_otp", status: 400 }, "identity.code_invalid"],
    [{ code: "validation_failed", status: 400 }, "identity.code_invalid"],
    [{ code: "over_request_rate_limit", status: 429 }, "platform.rate_limited"],
    [{ code: "unexpected_failure", status: 500 }, "platform.unexpected"],
  ])("maps %o to %s", async (error, expected) => {
    setTelemetrySink({ captureError: vi.fn(), captureEvent: vi.fn() });
    const { client } = stubSupabase(error);
    const result = await verifySignupCode(
      client,
      stubRpc(),
      { email: "a@b.co", token: "123456" },
      undefined,
    );
    expect(result).toEqual({ ok: false, error: { code: expected } });
  });

  it("rejects a malformed code without calling Supabase", async () => {
    const { auth, client } = stubSupabase(null);
    const result = await verifySignupCode(
      client,
      stubRpc(),
      { email: "a@b.co", token: "12345" },
      undefined,
    );
    expect(result).toEqual({ ok: false, error: { code: "identity.code_invalid" } });
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("verifies a signup code and registers the device", async () => {
    const { auth, client } = stubSupabase(null);
    const rpc = stubRpc();
    const result = await verifySignupCode(
      client,
      rpc,
      { email: " a@b.co ", token: "123456" },
      undefined,
      () => "fresh-id",
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "a@b.co",
      token: "123456",
      type: "signup",
    });
    expect(rpc.rpc).toHaveBeenCalledWith("identity_upsert_device", {
      p_device_id: "fresh-id",
      p_device_label: null,
    });
    expect(result).toEqual({ ok: true, value: "fresh-id" });
  });
});

describe("resendSignupCode", () => {
  it("resends a signup code", async () => {
    const { auth, client } = stubSupabase(null);
    expect(await resendSignupCode(client, " a@b.co ")).toEqual({ ok: true, value: undefined });
    expect(auth.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co" });
  });

  it("maps email rate limits", async () => {
    const { client } = stubSupabase({ code: "over_email_send_rate_limit", status: 429 });
    expect(await resendSignupCode(client, "a@b.co")).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });
});
