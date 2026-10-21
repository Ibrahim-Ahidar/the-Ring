import { describe, expect, it } from "vitest";

import { conversationChannel, inboxChannel } from "./realtime";

describe("realtime channel names", () => {
  it("formats conversation and inbox channels", () => {
    expect(conversationChannel("abc")).toBe("conversation:abc");
    expect(inboxChannel("user-1")).toBe("inbox:user-1");
  });
});
