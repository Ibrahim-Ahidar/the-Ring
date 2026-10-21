import { describe, expect, it, vi } from "vitest";

import { updateAccent, updateLocale, updateTheme } from "@/features/locale-appearance/service";

describe("locale-appearance service validation", () => {
  it("rejects invalid locale before rpc", async () => {
    const rpc = { rpc: vi.fn() };
    const result = await updateLocale(rpc, "xx");
    expect(result).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid theme before rpc", async () => {
    const rpc = { rpc: vi.fn() };
    const result = await updateTheme(rpc, "neon");
    expect(result).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid accent before rpc", async () => {
    const rpc = { rpc: vi.fn() };
    const result = await updateAccent(rpc, "blue");
    expect(result).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
    expect(rpc.rpc).not.toHaveBeenCalled();
  });
});
