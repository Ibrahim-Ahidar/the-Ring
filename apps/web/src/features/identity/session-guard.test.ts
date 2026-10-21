import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const afterCallbacks: Array<() => Promise<void>> = [];
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => {
    afterCallbacks.push(fn);
  },
}));

import type { SessionAccess, SessionContext } from "@/platform/session";

import { assertAppAccess } from "./session-guard";

function session(access: Partial<SessionAccess>, touch?: () => Promise<unknown>) {
  const rpc = vi.fn(async () => (touch ? touch() : { data: null, error: null }));
  const ctx = {
    user: { id: "u1", email: "a@b.co" },
    userId: "u1",
    supabase: {},
    rpc: { rpc },
    access: {
      emailConfirmed: true,
      mfaRequired: false,
      deviceActive: true,
      deviceId: "dev1",
      ...access,
    },
  } as unknown as SessionContext;
  return { ctx, rpc };
}

beforeEach(() => {
  afterCallbacks.length = 0;
});

describe("assertAppAccess", () => {
  it("lets an active, confirmed, AAL2-ok member in and touches the device after the response", async () => {
    const { ctx, rpc } = session({});
    expect(assertAppAccess(ctx).ok).toBe(true);
    expect(rpc).not.toHaveBeenCalled(); // not blocking the request
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]!();
    expect(rpc).toHaveBeenCalledWith("identity_touch_device", { p_device_id: "dev1" });
  });

  it("redirects an unconfirmed email without touching", () => {
    const { ctx } = session({ emailConfirmed: false });
    const r = assertAppAccess(ctx);
    expect(r).toMatchObject({ ok: false, error: { code: "identity.confirmation_required" } });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("requires MFA step-up", () => {
    const { ctx } = session({ mfaRequired: true });
    expect(assertAppAccess(ctx)).toMatchObject({
      ok: false,
      error: { code: "identity.mfa_required" },
    });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("refuses a revoked or unknown device", () => {
    const { ctx } = session({ deviceActive: false });
    expect(assertAppAccess(ctx)).toMatchObject({
      ok: false,
      error: { code: "identity.session_revoked" },
    });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("logs, and does not throw, when the touch fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ctx } = session({}, async () => {
      throw new Error("boom");
    });
    expect(assertAppAccess(ctx).ok).toBe(true);
    await expect(afterCallbacks[0]!()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
