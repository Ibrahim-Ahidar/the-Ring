import { describe, expect, it } from "vitest";

import { parseMemberUsernames } from "./member-usernames";

describe("parseMemberUsernames", () => {
  it("splits on commas, semicolons and whitespace, strips @ and de-duplicates", () => {
    expect(parseMemberUsernames(" @alice, bob;;  @@carol\nALICE ,, ")).toEqual([
      "alice",
      "bob",
      "carol",
    ]);
  });

  it("accepts an array and returns nothing for blank input", () => {
    expect(parseMemberUsernames(["@x", " ", "x"])).toEqual(["x"]);
    expect(parseMemberUsernames("   ")).toEqual([]);
  });
});
