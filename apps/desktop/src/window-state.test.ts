import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATE,
  parseWindowState,
  sanitizeForDisplays,
  serializeWindowState,
} from "./window-state";

const screen = { x: 0, y: 0, width: 1920, height: 1080 };

describe("parseWindowState", () => {
  it("returns defaults for missing, bad or non-object input", () => {
    expect(parseWindowState(null)).toEqual(DEFAULT_STATE);
    expect(parseWindowState("{nope")).toEqual(DEFAULT_STATE);
    expect(parseWindowState("42")).toEqual(DEFAULT_STATE);
  });
  it("round-trips a valid state", () => {
    const s = { width: 900, height: 700, x: 10, y: 20, maximised: true };
    expect(parseWindowState(serializeWindowState(s))).toEqual(s);
  });
  it("replaces invalid or tiny sizes with defaults", () => {
    const s = parseWindowState(JSON.stringify({ width: 10, height: "x", maximised: "yes" }));
    expect(s).toEqual(DEFAULT_STATE);
  });
  it("omits position unless both coordinates are numbers", () => {
    expect(parseWindowState(JSON.stringify({ width: 800, height: 600, x: 5 })).x).toBeUndefined();
  });
});

describe("sanitizeForDisplays", () => {
  it("keeps a position that is on a display", () => {
    const s = { width: 800, height: 600, x: 100, y: 100, maximised: false };
    expect(sanitizeForDisplays(s, [screen])).toEqual(s);
  });
  it("drops a position that is off every display but keeps size", () => {
    const s = { width: 800, height: 600, x: 5000, y: 100, maximised: true };
    expect(sanitizeForDisplays(s, [screen])).toEqual({ width: 800, height: 600, maximised: true });
  });
  it("accepts a window on a second display", () => {
    const s = { width: 800, height: 600, x: 2000, y: 0, maximised: false };
    expect(sanitizeForDisplays(s, [screen, { x: 1920, y: 0, width: 1920, height: 1080 }])).toEqual(s);
  });
});
