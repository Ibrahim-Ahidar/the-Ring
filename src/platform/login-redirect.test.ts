import { describe, expect, it } from "vitest";

import { loginPath, parseLoginReason, safeNextPath } from "./login-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/app/chats/123", "/app/chats/123"],
    ["/app/chats/123?jump=9#m9", "/app/chats/123?jump=9#m9"],
    ["/app", "/app"],
  ])("keeps the same-origin path %s", (raw, expected) => {
    expect(safeNextPath(raw, "/app")).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["app/chats"],
    ["//evil.example"],
    ["/\\evil.example"],
    ["/\t/evil.example"],
    ["/\n/evil.example"],
    ["https://evil.example/app"],
    ["javascript:alert(1)"],
    ["/login"],
    ["/login?next=/app"],
    ["/signup"],
  ])("falls back for %j", (raw) => {
    expect(safeNextPath(raw, "/app")).toBe("/app");
  });
});

describe("parseLoginReason", () => {
  it("accepts allowlisted codes only", () => {
    expect(parseLoginReason("identity.session_revoked")).toBe("identity.session_revoked");
    expect(parseLoginReason("link_expired")).toBe("link_expired");
    expect(parseLoginReason("<script>")).toBeNull();
    expect(parseLoginReason(null)).toBeNull();
  });
});

describe("loginPath", () => {
  it("encodes reason and next", () => {
    expect(loginPath()).toBe("/login");
    expect(loginPath({ next: "/app/chats/1?x=2" })).toBe("/login?next=%2Fapp%2Fchats%2F1%3Fx%3D2");
    expect(loginPath({ reason: "signed_out" })).toBe("/login?reason=signed_out");
  });
});
