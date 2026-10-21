import { describe, expect, it } from "vitest";

import { splitTextWithLinks } from "./linkify";

describe("splitTextWithLinks", () => {
  it("leaves plain text untouched", () => {
    expect(splitTextWithLinks("hello")).toEqual([{ kind: "text", value: "hello" }]);
  });

  it("splits http and https URLs", () => {
    const segments = splitTextWithLinks("see https://example.com now");
    expect(segments).toEqual([
      { kind: "text", value: "see " },
      { kind: "link", href: "https://example.com", label: "https://example.com" },
      { kind: "text", value: " now" },
    ]);
  });

  it("does not treat javascript URLs as links", () => {
    const segments = splitTextWithLinks("javascript:alert(1)");
    expect(segments).toEqual([{ kind: "text", value: "javascript:alert(1)" }]);
  });
});
