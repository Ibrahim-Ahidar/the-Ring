import { describe, expect, it } from "vitest";

import { splitSnippetHighlight } from "./snippet-highlight";

describe("splitSnippetHighlight", () => {
  it("splits at matchStart for client highlighting", () => {
    const parts = splitSnippetHighlight("hello world", 6, 5);
    expect(parts.before).toBe("hello ");
    expect(parts.match).toBe("world");
    expect(parts.after).toBe("");
  });
});
