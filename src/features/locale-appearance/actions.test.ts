import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieSet = vi.fn();
const getSessionContext = vi.fn();
const updateAccent = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: cookieSet }),
}));
vi.mock("@/platform/session", () => ({
  getSessionContext: () => getSessionContext(),
}));
vi.mock("@/features/locale-appearance/service", () => ({
  updateAccent: (...args: unknown[]) => updateAccent(...args),
  updateLocale: vi.fn(),
  updateTheme: vi.fn(),
}));

import { saveAccentAction } from "@/features/locale-appearance/actions";

describe("saveAccentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid accent without touching rpc or cookie", async () => {
    const result = await saveAccentAction("blue");
    expect(result).toEqual({
      ok: false,
      error: { code: "appearance.invalid_preference" },
    });
    expect(updateAccent).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  it("calls the RPC and sets the cookie for a signed-in user", async () => {
    const rpc = { rpc: vi.fn() };
    getSessionContext.mockResolvedValue({ rpc });
    updateAccent.mockResolvedValue({ ok: true, value: null });

    const result = await saveAccentAction("green");
    expect(result).toEqual({ ok: true, value: null });
    expect(updateAccent).toHaveBeenCalledWith(rpc, "green");
    expect(cookieSet).toHaveBeenCalledWith(
      "pulse_accent",
      "green",
      expect.objectContaining({ path: "/" }),
    );
  });

  it("only sets the cookie when signed out", async () => {
    getSessionContext.mockResolvedValue(null);
    const result = await saveAccentAction("indigo");
    expect(result.ok).toBe(true);
    expect(updateAccent).not.toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledOnce();
  });
});
