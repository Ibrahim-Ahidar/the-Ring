import { describe, expect, it } from "vitest";

import {
  CONVERSATION_PAGE_SIZE,
  decodeMessageCursor,
  encodeMessageCursor,
  MESSAGE_PAGE_SIZE,
} from "./pagination";

describe("pagination constants", () => {
  it("matches the foundation contract", () => {
    expect(MESSAGE_PAGE_SIZE).toBe(50);
    expect(CONVERSATION_PAGE_SIZE).toBe(30);
  });
});

describe("message cursor codec", () => {
  it("round-trips created_at and id", () => {
    const cursor = {
      createdAt: "2026-10-08T12:00:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const encoded = encodeMessageCursor(cursor);
    expect(decodeMessageCursor(encoded)).toEqual(cursor);
  });

  it("returns null for invalid payloads", () => {
    expect(decodeMessageCursor("not-base64!!!")).toBeNull();
  });
});
