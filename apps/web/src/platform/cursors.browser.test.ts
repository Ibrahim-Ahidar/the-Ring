import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cursor codecs run in client components too, where webpack swaps Node's
// Buffer for Next's polyfill (no "base64url"). Run them against that polyfill.
const require = createRequire(import.meta.url);
const { Buffer: BrowserBuffer } = require("next/dist/compiled/buffer") as {
  Buffer: typeof Buffer;
};

describe("cursor codecs under the browser Buffer polyfill", () => {
  beforeEach(() => {
    vi.stubGlobal("Buffer", BrowserBuffer);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const createdAt = "2026-10-08T12:00:00.000Z";
  const id = "550e8400-e29b-41d4-a716-446655440000";

  it("message cursor round-trips", async () => {
    const { encodeMessageCursor, decodeMessageCursor } = await import("@pulse/core/pagination");
    expect(decodeMessageCursor(encodeMessageCursor({ createdAt, id }))).toEqual({ createdAt, id });
  });

  it("conversation cursor encodes", async () => {
    const { encodeConversationCursor } = await import("@/features/direct-messaging/types");
    expect(encodeConversationCursor({ pinnedAt: null, lastMessageAt: createdAt, id })).toBe(
      "bnVsbHwyMDI2LTEwLTA4VDEyOjAwOjAwLjAwMFp8NTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAw",
    );
  });
});
