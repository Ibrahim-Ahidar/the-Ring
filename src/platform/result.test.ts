import { describe, expect, it } from "vitest";

import { err, ok } from "./result";

describe("result helpers", () => {
  it("ok wraps a value", () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it("err wraps a code", () => {
    expect(err("platform.rate_limited")).toEqual({
      ok: false,
      error: { code: "platform.rate_limited" },
    });
  });
});
