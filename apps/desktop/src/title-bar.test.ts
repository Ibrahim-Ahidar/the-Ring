import { describe, expect, it } from "vitest";
import { isLandingUrl, parseTitleBarColors, startUrl } from "./title-bar";

const BASE = "https://the-ring-five.vercel.app";

describe("startUrl", () => {
  it("points at the app, not the landing page", () => {
    expect(startUrl(BASE)).toBe(`${BASE}/app`);
    expect(startUrl("http://localhost:3000/")).toBe("http://localhost:3000/app");
  });
});

describe("isLandingUrl", () => {
  it("matches the root of the Pulse origin only", () => {
    expect(isLandingUrl(`${BASE}/`, BASE)).toBe(true);
    expect(isLandingUrl(`${BASE}/?ref=x`, BASE)).toBe(true);
    expect(isLandingUrl(`${BASE}/app`, BASE)).toBe(false);
    expect(isLandingUrl(`${BASE}/login`, BASE)).toBe(false);
    expect(isLandingUrl("https://example.com/", BASE)).toBe(false);
    expect(isLandingUrl("not a url", BASE)).toBe(false);
  });
});

describe("parseTitleBarColors", () => {
  it("accepts rgb() and hex colours", () => {
    expect(parseTitleBarColors({ color: "rgb(18, 19, 24)", symbolColor: "#FAFAFA" })).toEqual({
      color: "#121318",
      symbolColor: "#fafafa",
    });
    expect(parseTitleBarColors({ color: "rgba(1, 2, 3, 0.5)", symbolColor: "#000000" })).toEqual({
      color: "#010203",
      symbolColor: "#000000",
    });
  });

  it("rejects anything else", () => {
    expect(parseTitleBarColors(null)).toBeNull();
    expect(parseTitleBarColors({ color: "red", symbolColor: "#000000" })).toBeNull();
    expect(parseTitleBarColors({ color: "rgb(300, 0, 0)", symbolColor: "#000000" })).toBeNull();
    expect(parseTitleBarColors({ color: "#000000" })).toBeNull();
  });
});
