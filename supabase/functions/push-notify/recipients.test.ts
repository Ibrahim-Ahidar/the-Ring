import { describe, expect, it } from "vitest";
import {
  buildMessages,
  deadTokens,
  previewBody,
  shouldPush,
} from "./recipients";

const n = { recipient_id: "u2", actor_id: "u1", type: "message.created" };
const base = { mutedUntil: null, mentionsOnly: false, isMention: false, isMember: true };
const now = new Date("2026-10-21T12:00:00Z");

describe("shouldPush", () => {
  it("pushes a normal message", () => {
    expect(shouldPush(n, base, now)).toBe(true);
  });
  it("skips a muted conversation", () => {
    expect(shouldPush(n, { ...base, mutedUntil: "2026-10-22T00:00:00Z" }, now)).toBe(false);
  });
  it("pushes once the mute has expired", () => {
    expect(shouldPush(n, { ...base, mutedUntil: "2026-10-20T00:00:00Z" }, now)).toBe(true);
  });
  it("skips non-mentions in mentions-only mode", () => {
    expect(shouldPush(n, { ...base, mentionsOnly: true }, now)).toBe(false);
  });
  it("pushes mentions in mentions-only mode", () => {
    expect(shouldPush(n, { ...base, mentionsOnly: true, isMention: true }, now)).toBe(true);
  });
  it("skips the sender, non-members and other types", () => {
    expect(shouldPush({ ...n, actor_id: "u2" }, base, now)).toBe(false);
    expect(shouldPush(n, { ...base, isMember: false }, now)).toBe(false);
    expect(shouldPush({ ...n, type: "reaction.added" }, base, now)).toBe(false);
  });
});

describe("messages", () => {
  it("builds previews", () => {
    expect(previewBody("image", null)).toContain("Photo");
    expect(previewBody("audio", null)).toContain("Voice message");
    expect(previewBody("text", "  hi ")).toBe("hi");
    expect(previewBody("text", "x".repeat(300)).length).toBe(140);
  });
  it("carries conversationId in data", () => {
    const [m] = buildMessages(["t1"], "Ann", "hi", "c1", "n1");
    expect(m.data.conversationId).toBe("c1");
    expect(m.channelId).toBe("messages");
  });
  it("finds DeviceNotRegistered tokens", () => {
    expect(
      deadTokens(["a", "b", "c"], [
        { status: "ok" },
        { status: "error", details: { error: "DeviceNotRegistered" } },
        { status: "error", details: { error: "MessageTooBig" } },
      ]),
    ).toEqual(["b"]);
  });
});
