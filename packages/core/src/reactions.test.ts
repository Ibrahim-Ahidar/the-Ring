import { describe, expect, it } from "vitest";

import { groupReactions, isAllowedReactionEmoji, reactionToggle } from "./reactions";

const r = (user_id: string, emoji: string) => ({ message_id: "m", user_id, emoji, created_at: "" });

describe("reactions", () => {
  it("groups by emoji in allowed order and flags mine", () => {
    const groups = groupReactions([r("a", "😂"), r("me", "👍"), r("b", "👍")], "me");
    expect(groups).toEqual([
      { emoji: "👍", count: 2, mine: true },
      { emoji: "😂", count: 1, mine: false },
    ]);
  });
  it("toggles add and remove", () => {
    expect(reactionToggle([r("me", "👍")], "me", "👍")).toBe("remove");
    expect(reactionToggle([r("me", "👍")], "me", "❤️")).toBe("add");
  });
  it("validates emoji", () => {
    expect(isAllowedReactionEmoji("🙏")).toBe(true);
    expect(isAllowedReactionEmoji("🔥")).toBe(false);
  });
});
