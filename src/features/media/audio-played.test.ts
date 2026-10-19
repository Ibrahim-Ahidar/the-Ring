import { describe, expect, it } from "vitest";

import { shouldRecordPlay } from "./audio-played";

describe("shouldRecordPlay", () => {
  it("records the first play of a received message", () => {
    expect(shouldRecordPlay({ isOwn: false, alreadyRecorded: false })).toBe(true);
  });
  it("does not record twice", () => {
    expect(shouldRecordPlay({ isOwn: false, alreadyRecorded: true })).toBe(false);
  });
  it("never records own messages", () => {
    expect(shouldRecordPlay({ isOwn: true, alreadyRecorded: false })).toBe(false);
  });
});
