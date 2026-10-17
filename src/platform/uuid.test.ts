import { afterEach, describe, expect, it, vi } from "vitest";

import { randomUUID } from "./uuid";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUUID", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a v4 UUID", () => {
    expect(randomUUID()).toMatch(UUID_V4);
  });

  it("falls back to getRandomValues outside a secure context", () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: getRandomValues.bind(globalThis.crypto) });

    const first = randomUUID();
    expect(first).toMatch(UUID_V4);
    expect(randomUUID()).not.toBe(first);
  });
});
