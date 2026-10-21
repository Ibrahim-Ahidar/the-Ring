import { describe, expect, it } from "vitest";

import { compareVersions, isBelowMinimum, parseMobileCompat } from "./app-version";
import { directionChanges, parsePreferences, resolveLanguage } from "./preferences";

describe("preferences", () => {
  it("falls back per field on junk", () => {
    expect(parsePreferences("nope")).toEqual({ theme: "system", accent: "indigo", language: null });
    expect(parsePreferences('{"theme":"dark","accent":"pink","language":"fr"}')).toEqual({
      theme: "dark",
      accent: "indigo",
      language: "fr",
    });
  });
  it("resolves language", () => {
    expect(resolveLanguage(null, "ar")).toBe("ar");
    expect(resolveLanguage(null, "de")).toBe("en");
    expect(resolveLanguage("fr", "ar")).toBe("fr");
  });
  it("detects direction flips", () => {
    expect(directionChanges("en", "ar")).toBe(true);
    expect(directionChanges("ar", "fr")).toBe(true);
    expect(directionChanges("en", "fr")).toBe(false);
  });
});

describe("app version", () => {
  it("compares numerically", () => {
    expect(compareVersions("1.2.10", "1.2.9")).toBe(1);
    expect(compareVersions("1.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.9.9", "1.0.0")).toBe(-1);
  });
  it("blocks only older builds", () => {
    expect(isBelowMinimum("0.1.0", "0.2.0")).toBe(true);
    expect(isBelowMinimum("0.2.0", "0.2.0")).toBe(false);
    expect(isBelowMinimum("0.1.0", null)).toBe(false);
  });
  it("parses compat payload", () => {
    expect(parseMobileCompat({ min_version: " 1.0.0 ", download_url: "" })).toEqual({
      minVersion: "1.0.0",
      downloadUrl: null,
    });
    expect(parseMobileCompat(null)).toEqual({ minVersion: null, downloadUrl: null });
  });
});
