import { describe, expect, it } from "vitest";

import {
  FORBIDDEN_PROPERTY_KEYS,
  scrubProperties,
  toSafeErrorPayload,
} from "./scrub";

describe("scrubProperties", () => {
  it.each(FORBIDDEN_PROPERTY_KEYS)("drops top-level %s", (key) => {
    const result = scrubProperties({
      [key]: "secret",
      code: "platform.rate_limited",
    });
    expect(result).toEqual({ code: "platform.rate_limited" });
    expect(result).not.toHaveProperty(key);
  });

  it("drops forbidden keys in nested objects", () => {
    expect(
      scrubProperties({
        meta: { body: "nested secret", conversationId: "c1" },
      }),
    ).toEqual({ meta: { conversationId: "c1" } });
  });

  it("drops forbidden keys inside arrays of objects", () => {
    expect(
      scrubProperties({
        items: [{ text: "hi" }, { details: "report", code: "x" }],
      }),
    ).toEqual({ items: [{}, { code: "x" }] });
  });

  it("replaces Error values with a payload that omits the message", () => {
    expect(
      scrubProperties({ failure: new TypeError("message body leaked") }),
    ).toEqual({ failure: { name: "TypeError" } });
  });

  it("passes through safe scalar properties", () => {
    expect(
      scrubProperties({
        code: "identity.username_taken",
        durationMs: 12,
        conversationId: "abc",
      }),
    ).toEqual({
      code: "identity.username_taken",
      durationMs: 12,
      conversationId: "abc",
    });
  });
});

describe("toSafeErrorPayload", () => {
  it("omits error message text", () => {
    const payload = toSafeErrorPayload(
      new Error("message body users typed in chat"),
    );
    expect(payload.name).toBe("Error");
    expect(payload).not.toHaveProperty("message");
    expect(JSON.stringify(payload)).not.toContain("message body");
  });

  it("scrubs nested causes without leaking message text", () => {
    const cause = new Error("bio: private");
    const error = new Error("details in message", { cause });
    const payload = toSafeErrorPayload(error);
    expect(payload.cause?.name).toBe("Error");
    expect(payload.cause).not.toHaveProperty("message");
    expect(JSON.stringify(payload)).not.toContain("bio");
    expect(JSON.stringify(payload)).not.toContain("details in message");
  });

  it("handles non-Error throws without echoing value", () => {
    expect(toSafeErrorPayload("secret string")).toEqual({
      name: "NonErrorThrown",
    });
  });
});
