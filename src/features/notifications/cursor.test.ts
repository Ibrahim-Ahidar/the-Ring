import { describe, expect, it } from "vitest";

import {
  decodeNotificationCursor,
  encodeNotificationCursor,
} from "./cursor";

describe("notification cursor", () => {
  it("round-trips createdAt and id", () => {
    const cursor = {
      createdAt: "2026-10-08T12:00:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440000",
    };
    const encoded = encodeNotificationCursor(cursor);
    expect(decodeNotificationCursor(encoded)).toEqual(cursor);
  });
});
