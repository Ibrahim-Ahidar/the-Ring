import { describe, expect, it } from "vitest";

import { decodeBase64Url, encodeBase64Url } from "./base64url";

describe("base64url codec", () => {
  it.each([
    "2026-10-08T12:00:00.000Z|550e8400-e29b-41d4-a716-446655440000",
    "null|null|abc",
    "مرحبا ü ?>?",
    "",
  ])("matches Node's base64url and round-trips %j", (text) => {
    const encoded = encodeBase64Url(text);
    expect(encoded).toBe(Buffer.from(text, "utf8").toString("base64url"));
    expect(decodeBase64Url(encoded)).toBe(text);
  });

  it("throws on invalid input", () => {
    expect(() => decodeBase64Url("not-base64!!!")).toThrow();
  });
});
