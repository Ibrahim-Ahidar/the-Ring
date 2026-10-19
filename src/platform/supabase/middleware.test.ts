import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const signOut = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: getUser, signOut } }),
}));

const { updateSession } = await import("./middleware");

const ORIGIN = "http://localhost:3000";

function request(path: string) {
  return new NextRequest(new URL(path, ORIGIN));
}

function location(response: Response): string | null {
  const value = response.headers.get("location");
  return value ? value.replace(ORIGIN, "") : null;
}

function signedIn() {
  getUser.mockResolvedValue({ data: { claims: { sub: "u1" } }, error: null });
}

function signedOut() {
  getUser.mockResolvedValue({ data: { claims: null }, error: null });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  getUser.mockReset();
  signOut.mockReset().mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("updateSession", () => {
  it("sends a signed-out deep link to login and keeps the destination", async () => {
    signedOut();
    const response = await updateSession(request("/app/chats/123?jump=9"));
    expect(location(response)).toBe("/login?next=%2Fapp%2Fchats%2F123%3Fjump%3D9");
  });

  it("keeps the destination when Supabase is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    const response = await updateSession(request("/app/groups"));
    expect(location(response)).toBe("/login?next=%2Fapp%2Fgroups");
  });

  it("lets signed-out visitors open login and signup", async () => {
    signedOut();
    expect(location(await updateSession(request("/login")))).toBeNull();
    expect(location(await updateSession(request("/signup")))).toBeNull();
  });

  it("sends signed-in members away from login and signup", async () => {
    signedIn();
    expect(location(await updateSession(request("/login")))).toBe("/app");
    expect(location(await updateSession(request("/signup")))).toBe("/app");
  });

  it("sends signed-in members from the landing page to the app", async () => {
    signedIn();
    expect(location(await updateSession(request("/")))).toBe("/app");
    signedOut();
    expect(location(await updateSession(request("/")))).toBeNull();
  });

  it("honours a safe next and ignores an unsafe one", async () => {
    signedIn();
    expect(location(await updateSession(request("/login?next=/app/groups")))).toBe(
      "/app/groups",
    );
    expect(
      location(await updateSession(request("/login?next=%2F%2Fevil.example"))),
    ).toBe("/app");
  });

  it("stays on login when the app sent a reason, so it cannot loop", async () => {
    signedIn();
    const response = await updateSession(
      request("/login?reason=identity.confirmation_required"),
    );
    expect(location(response)).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("ends a revoked session on the login page", async () => {
    signedIn();
    const response = await updateSession(request("/login?reason=identity.session_revoked"));
    expect(location(response)).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("treats an unknown reason like none", async () => {
    signedIn();
    expect(location(await updateSession(request("/login?reason=bogus")))).toBe("/app");
  });
});
