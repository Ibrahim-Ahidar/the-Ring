import { describe, expect, it } from "vitest";

import { PAD_BLOCK, padPlaintext } from "./padding";

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("padPlaintext", () => {
  it("pads to a multiple of 256 bytes, minimum 256", () => {
    expect(bytes(padPlaintext("{}"))).toBe(PAD_BLOCK);
    expect(bytes(padPlaintext("a".repeat(256)))).toBe(256);
    expect(bytes(padPlaintext("a".repeat(257)))).toBe(512);
  });
  it("counts UTF-8 bytes, not characters", () => {
    expect(bytes(padPlaintext(JSON.stringify("é".repeat(200))))).toBe(512);
  });
  it("keeps the JSON parseable", () => {
    expect(JSON.parse(padPlaintext('{"a":1}'))).toEqual({ a: 1 });
  });
});
