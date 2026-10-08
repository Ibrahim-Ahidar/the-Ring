import { describe, expect, it } from "vitest";

import { normalizeUsername, validateUsername } from "./username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Ibrahim  ")).toBe("ibrahim");
  });
});

describe("validateUsername", () => {
  it("accepts valid usernames", () => {
    const result = validateUsername("Valid_user1");
    expect(result).toEqual({
      ok: true,
      value: { display: "Valid_user1", normalized: "valid_user1" },
    });
  });

  it("rejects too short", () => {
    const result = validateUsername("ab");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("identity.username_too_short");
    }
  });

  it("rejects reserved names", () => {
    const result = validateUsername("admin");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("identity.username_reserved");
    }
  });
});
