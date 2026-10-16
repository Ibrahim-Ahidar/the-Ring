import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "pulse_device_id" ? { value: "dev1" } : undefined) }),
}));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const serverClient = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/platform/supabase/safe-server", () => ({
  tryCreateSupabaseServerClient: async () => serverClient.current,
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { getSessionContext, resolveSession, SESSION_REVOKED_LOGIN_PATH } from "./session";

type RpcReply = { data: unknown; error: { message: string; code?: string } | null };

function fakeSupabase(input: {
  user?: { id: string } | null;
  authErrorCode?: string;
  rpcReply?: RpcReply;
}) {
  const signOut = vi.fn(async () => ({ error: null }));
  const rpc = vi.fn(async () => input.rpcReply ?? { data: null, error: null });
  return {
    signOut,
    rpc,
    client: {
      auth: {
        getClaims: async () => ({
          data: input.user ? { claims: { sub: input.user.id, email: "a@b.co" } } : null,
          error: input.authErrorCode ? { code: input.authErrorCode, message: "x" } : null,
        }),
        signOut,
      },
      rpc,
    },
  };
}

const revokedReply: RpcReply = {
  data: null,
  error: { message: "identity.session_revoked", code: "P0001" },
};

beforeEach(() => {
  redirectMock.mockClear();
});

describe("resolveSession", () => {
  it("is active when the user exists and the session check passes", async () => {
    const fake = fakeSupabase({ user: { id: "u1" } });
    const result = await resolveSession(fake.client as never, fake.client);
    expect(result.status).toBe("active");
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    expect(fake.rpc).toHaveBeenCalledWith("identity_assert_access", { p_device_id: null });
  });

  it("maps the access row and passes the device id", async () => {
    const fake = fakeSupabase({
      user: { id: "u1" },
      rpcReply: {
        data: { email_confirmed: true, mfa_required: true, device_active: true },
        error: null,
      },
    });
    const result = await resolveSession(fake.client as never, fake.client, "dev1");
    expect(fake.rpc).toHaveBeenCalledWith("identity_assert_access", { p_device_id: "dev1" });
    expect(result).toMatchObject({
      status: "active",
      context: {
        user: { id: "u1", email: "a@b.co" },
        access: { emailConfirmed: true, mfaRequired: true, deviceActive: true, deviceId: "dev1" },
      },
    });
  });

  it("treats a missing access row as unconfirmed and inactive (fail closed)", async () => {
    const fake = fakeSupabase({ user: { id: "u1" } });
    const result = await resolveSession(fake.client as never, fake.client);
    expect(result).toMatchObject({
      context: { access: { emailConfirmed: false, deviceActive: false, mfaRequired: false } },
    });
  });

  it("is anonymous without a user", async () => {
    const fake = fakeSupabase({ user: null });
    expect(await resolveSession(fake.client as never, fake.client)).toEqual({
      status: "anonymous",
    });
  });

  it("is revoked when Supabase no longer knows the session", async () => {
    const fake = fakeSupabase({ user: null, authErrorCode: "session_not_found" });
    expect(await resolveSession(fake.client as never, fake.client)).toEqual({
      status: "revoked",
    });
  });

  it("is revoked when the device row is revoked", async () => {
    const fake = fakeSupabase({ user: { id: "u1" }, rpcReply: revokedReply });
    expect(await resolveSession(fake.client as never, fake.client)).toEqual({
      status: "revoked",
    });
  });
});

describe("getSessionContext", () => {
  it("signs a revoked session out and redirects to login with the reason", async () => {
    const fake = fakeSupabase({ user: { id: "u1" }, rpcReply: revokedReply });
    serverClient.current = fake.client;
    await expect(getSessionContext()).rejects.toThrow(
      `NEXT_REDIRECT:${SESSION_REVOKED_LOGIN_PATH}`,
    );
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(SESSION_REVOKED_LOGIN_PATH).toBe("/login?reason=identity.session_revoked");
  });

  it("returns the context for an active session", async () => {
    const fake = fakeSupabase({ user: { id: "u1" } });
    serverClient.current = fake.client;
    const ctx = await getSessionContext();
    expect(ctx?.userId).toBe("u1");
    expect(fake.rpc).toHaveBeenCalledWith("identity_assert_access", { p_device_id: "dev1" });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns null for anonymous callers without redirecting", async () => {
    serverClient.current = fakeSupabase({ user: null }).client;
    expect(await getSessionContext()).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
