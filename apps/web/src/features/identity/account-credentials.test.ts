import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RpcClient } from "@pulse/core/rpc";
import { setTelemetrySink } from "@/platform/telemetry";

import { changeEmail, changePassword } from "./service";

type AuthError = { code?: string; status?: number; message?: string } | null;

const DEVICES = [
  { id: "this-device", device_label: null, last_seen_at: null, revoked_at: null },
  { id: "laptop", device_label: null, last_seen_at: null, revoked_at: null },
];

function stubSupabase(errors: { signIn?: AuthError; update?: AuthError } = {}) {
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: { access_token: "old-token" } } })),
    signInWithPassword: vi.fn(async () => ({ data: {}, error: errors.signIn ?? null })),
    updateUser: vi.fn(async (attrs: { email?: string }) => ({
      data: { user: attrs.email ? { new_email: attrs.email } : {} },
      error: errors.update ?? null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    admin: { signOut: vi.fn(async () => ({ data: null, error: null })) },
  };
  return { auth, client: { auth } as unknown as SupabaseClient };
}

function stubRpc() {
  const rpc = vi.fn(async (fn: string, args?: { p_device_id?: string }) => {
    if (fn === "identity_upsert_device") {
      return { data: args?.p_device_id, error: null };
    }
    if (fn === "identity_list_devices") {
      return { data: DEVICES, error: null };
    }
    return { data: null, error: null };
  });
  return { rpc, client: { rpc } as unknown as RpcClient };
}

const input = {
  email: "me@pulse.test",
  currentPassword: "old-secret1",
  newPassword: "new-secret1",
  signOutOthers: true,
};

beforeEach(() => setTelemetrySink({ captureError: vi.fn(), captureEvent: vi.fn() }));
afterEach(() => setTelemetrySink(null));

describe("changePassword", () => {
  it("checks the current password, updates it, and signs out other devices", async () => {
    const { auth, client } = stubSupabase();
    const { rpc, client: rpcClient } = stubRpc();

    const result = await changePassword(client, rpcClient, input, "this-device");

    expect(result).toEqual({ ok: true, value: "this-device" });
    expect(auth.signInWithPassword).toHaveBeenCalledWith({
      email: "me@pulse.test",
      password: "old-secret1",
    });
    expect(rpc).toHaveBeenCalledWith("identity_upsert_device", expect.objectContaining({
      p_device_id: "this-device",
    }));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-secret1" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(rpc).toHaveBeenCalledWith("identity_revoke_device", { p_device_id: "laptop" });
    expect(rpc).not.toHaveBeenCalledWith("identity_revoke_device", { p_device_id: "this-device" });
    expect(auth.admin.signOut).not.toHaveBeenCalled();
  });

  it("fails clearly with a wrong current password and changes nothing", async () => {
    const { auth, client } = stubSupabase({ signIn: { code: "invalid_credentials", status: 400 } });

    const result = await changePassword(client, stubRpc().client, input, "this-device");

    expect(result).toEqual({ ok: false, error: { code: "identity.current_password_wrong" } });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("only ends the replaced session when other devices stay signed in", async () => {
    const { auth, client } = stubSupabase();
    const { rpc, client: rpcClient } = stubRpc();

    await changePassword(client, rpcClient, { ...input, signOutOthers: false }, "this-device");

    expect(auth.admin.signOut).toHaveBeenCalledWith("old-token", "local");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith("identity_revoke_device", expect.anything());
  });

  it.each([
    [{ ...input, currentPassword: "" }, "identity.password_required"],
    [{ ...input, newPassword: "short1" }, "identity.password_weak"],
    [{ ...input, newPassword: "old-secret1" }, "identity.password_same"],
  ])("rejects %o before signing in", async (bad, code) => {
    const { auth, client } = stubSupabase();
    const result = await changePassword(client, stubRpc().client, bad, "this-device");
    expect(result).toEqual({ ok: false, error: { code } });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "weak_password", status: 422 }, "identity.password_weak"],
    [{ code: "same_password", status: 422 }, "identity.password_same"],
    [{ code: "reauthentication_needed", status: 400 }, "identity.reauthentication_needed"],
  ])("maps update error %o", async (error, code) => {
    const { client } = stubSupabase({ update: error });
    const result = await changePassword(client, stubRpc().client, input, "this-device");
    expect(result).toEqual({ ok: false, error: { code } });
  });
});

describe("changeEmail", () => {
  const redirect = "http://localhost:3000/auth/callback?next=/app/settings/account";

  it("starts the change and returns the pending address", async () => {
    const { auth, client } = stubSupabase();

    const result = await changeEmail(client, "me@pulse.test", " new@pulse.test ", redirect);

    expect(result).toEqual({ ok: true, value: { pendingEmail: "new@pulse.test" } });
    expect(auth.updateUser).toHaveBeenCalledWith(
      { email: "new@pulse.test" },
      { emailRedirectTo: redirect },
    );
  });

  it.each([
    ["", "identity.email_required"],
    ["nope", "identity.email_invalid"],
    ["ME@pulse.test", "identity.email_same"],
  ])("rejects %j without calling Supabase", async (email, code) => {
    const { auth, client } = stubSupabase();
    const result = await changeEmail(client, "me@pulse.test", email, redirect);
    expect(result).toEqual({ ok: false, error: { code } });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: "email_exists", status: 422 }, "identity.email_taken"],
    [{ code: "email_address_invalid", status: 400 }, "identity.email_invalid"],
    [{ code: "email_address_not_authorized", status: 400 }, "identity.email_not_authorized"],
    [{ code: "over_email_send_rate_limit", status: 429 }, "platform.rate_limited"],
  ])("maps %o", async (error, code) => {
    const { client } = stubSupabase({ update: error });
    const result = await changeEmail(client, "me@pulse.test", "new@pulse.test", redirect);
    expect(result).toEqual({ ok: false, error: { code } });
  });
});
