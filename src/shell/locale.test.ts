import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  isLocale,
  isRtl,
  isTheme,
  LOCALES,
} from "./locale";

describe("locale helpers", () => {
  it("defaults to Arabic RTL", () => {
    expect(DEFAULT_LOCALE).toBe("ar");
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
});
