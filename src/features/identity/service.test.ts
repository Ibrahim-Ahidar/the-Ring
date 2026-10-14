import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RpcClient } from "@/platform/rpc";
import { setTelemetrySink } from "@/platform/telemetry";

import { resendSignupCode, signIn, signUp, verifySignupCode } from "./service";

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

describe("signUp", () => {
  const input = { email: " new@b.co ", password: "secret-pass", username: "newbie" };

  function stubSignUp(response: { data?: unknown; error?: AuthError }) {
    const signUpFn = vi.fn(async () => ({
      data: response.data ?? { user: null, session: null },
      error: response.error ?? null,
    }));
    const client = { auth: { signUp: signUpFn } } as unknown as SupabaseClient;
    const rpc = {
      rpc: vi.fn(async () => ({ data: true, error: null })),
    } as unknown as RpcClient;
    const serverRpc = {
      rpc: vi.fn(async () => ({ data: null, error: null })),
    } as unknown as RpcClient;
    return { signUpFn, client, rpc, serverRpc };
  }

  it("asks for the code when Supabase created an unconfirmed user", async () => {
    const { signUpFn, client, rpc, serverRpc } = stubSignUp({
      data: { user: { email_confirmed_at: null, identities: [{ id: "i" }] } },
    });
    const result = await signUp(client, rpc, input, serverRpc);
    expect(result).toEqual({ ok: true, value: { needsEmailConfirmation: true } });
    expect(signUpFn).toHaveBeenCalledWith(expect.objectContaining({ email: "new@b.co" }));
  });

  it("reports an already-registered email (user with no identities)", async () => {
    const { client, rpc, serverRpc } = stubSignUp({
      data: { user: { email_confirmed_at: null, identities: [] } },
    });
    expect(await signUp(client, rpc, input, serverRpc)).toEqual({
      ok: false,
      error: { code: "identity.email_registered" },
    });
  });

  it.each([
    [{ code: "weak_password", status: 422 }, "identity.password_weak"],
    [{ code: "email_address_invalid", status: 400 }, "identity.email_invalid"],
    [{ code: "email_address_not_authorized", status: 400 }, "identity.email_undeliverable"],
    [{ code: "user_already_exists", status: 422 }, "identity.email_registered"],
    [{ code: "over_email_send_rate_limit", status: 429 }, "platform.rate_limited"],
    [{ code: "unexpected_failure", status: 500 }, "platform.unexpected"],
  ])("maps %o to %s", async (error, expected) => {
    setTelemetrySink({ captureError: vi.fn(), captureEvent: vi.fn() });
    const { client, rpc, serverRpc } = stubSignUp({ error: { message: "x", ...error } });
    expect(await signUp(client, rpc, input, serverRpc)).toEqual({
      ok: false,
      error: { code: expected },
    });
  });

  it.each([
    [{ password: "12345" }, "identity.password_weak"],
    [{ email: "   " }, "identity.email_required"],
  ])("rejects %o before calling Supabase", async (override, expected) => {
    const { signUpFn, client, rpc, serverRpc } = stubSignUp({});
    const result = await signUp(client, rpc, { ...input, ...override }, serverRpc);
    expect(result).toEqual({ ok: false, error: { code: expected } });
    expect(serverRpc.rpc).not.toHaveBeenCalled();
    expect(signUpFn).not.toHaveBeenCalled();
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
