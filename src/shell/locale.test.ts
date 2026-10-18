import { describe, expect, it } from "vitest";

import {
  DEFAULT_ACCENT,
  DEFAULT_LOCALE,
  isAccent,
  isLocale,
  isRtl,
  isTheme,
  LOCALES,
} from "./locale";

describe("locale helpers", () => {
  it("defaults to English LTR, and Arabic is RTL", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(isRtl(DEFAULT_LOCALE)).toBe(false);
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("fr")).toBe(false);
  });

  it("validates locales and themes", () => {
    for (const locale of LOCALES) {
      expect(isLocale(locale)).toBe(true);
    }
    expect(isLocale("de")).toBe(false);
    expect(isTheme("system")).toBe(true);
    expect(isTheme("neon")).toBe(false);
  });

  it("validates accents and defaults to indigo", () => {
    expect(DEFAULT_ACCENT).toBe("indigo");
    expect(isAccent("indigo")).toBe(true);
    expect(isAccent("green")).toBe(true);
    expect(isAccent("blue")).toBe(false);
  });
});
