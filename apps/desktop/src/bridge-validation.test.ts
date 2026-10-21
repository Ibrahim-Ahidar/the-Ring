import { describe, expect, it } from "vitest";
import { parseNotifyPayload, parseUnreadCount, trayTooltip } from "./bridge-validation";

describe("parseNotifyPayload", () => {
  it("accepts a valid payload", () => {
    expect(parseNotifyPayload({ chatId: "c1", title: "Ann", body: "hi" })).toEqual({
      chatId: "c1",
      title: "Ann",
      body: "hi",
    });
  });
  it("allows an empty body", () => {
    expect(parseNotifyPayload({ chatId: "c1", title: "Ann", body: "" })).not.toBeNull();
  });
  it.each([null, undefined, "x", 1, [], {}, { chatId: 1, title: "a", body: "b" }])(
    "rejects %j",
    (v) => expect(parseNotifyPayload(v)).toBeNull(),
  );
  it("rejects empty ids/titles and over-long fields", () => {
    expect(parseNotifyPayload({ chatId: "", title: "a", body: "b" })).toBeNull();
    expect(parseNotifyPayload({ chatId: "c", title: "", body: "b" })).toBeNull();
    expect(parseNotifyPayload({ chatId: "c".repeat(129), title: "a", body: "b" })).toBeNull();
    expect(parseNotifyPayload({ chatId: "c", title: "a".repeat(201), body: "b" })).toBeNull();
    expect(parseNotifyPayload({ chatId: "c", title: "a", body: "b".repeat(501) })).toBeNull();
  });
});

describe("parseUnreadCount", () => {
  it("accepts non-negative integers and caps huge values", () => {
    expect(parseUnreadCount(0)).toBe(0);
    expect(parseUnreadCount(7)).toBe(7);
    expect(parseUnreadCount(10_000_000)).toBe(99999);
  });
  it.each([-1, 1.5, NaN, Infinity, "3", null, undefined])("rejects %j", (v) =>
    expect(parseUnreadCount(v)).toBeNull(),
  );
});

describe("trayTooltip", () => {
  it("shows the count only when unread", () => {
    expect(trayTooltip(0)).toBe("Pulse");
    expect(trayTooltip(3)).toBe("Pulse (3 unread)");
  });
});
