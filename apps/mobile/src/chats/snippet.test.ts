import { snippet } from "./snippet";

describe("snippet", () => {
  it("collapses whitespace", () => {
    expect(snippet("a\n\n b   c")).toBe("a b c");
  });
  it("truncates long text with an ellipsis", () => {
    expect(snippet("x".repeat(100), 10)).toBe("xxxxxxxxx…");
  });
  it("handles null", () => {
    expect(snippet(null)).toBe("");
  });
});
