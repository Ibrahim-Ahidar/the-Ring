import { describe, expect, it } from "vitest";

import { computePageLimit, pageLimitFromCookie } from "./page-limit";

describe("computePageLimit", () => {
  it("is about three screens of rows", () => {
    expect(computePageLimit(800)).toBe(38);
  });
  it("clamps to 20..60", () => {
    expect(computePageLimit(100)).toBe(20);
    expect(computePageLimit(5000)).toBe(60);
  });
  it("falls back to the default without a usable viewport", () => {
    expect(pageLimitFromCookie(undefined)).toBe(40);
    expect(pageLimitFromCookie("abc")).toBe(40);
  });
});
