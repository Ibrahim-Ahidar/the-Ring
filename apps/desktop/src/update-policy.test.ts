import { describe, expect, it } from "vitest";
import { shouldCheckForUpdates } from "./update-policy";

describe("shouldCheckForUpdates", () => {
  it("is false when not packaged", () => {
    expect(shouldCheckForUpdates({ isPackaged: false, env: {} })).toBe(false);
  });
  it("is true when packaged", () => {
    expect(shouldCheckForUpdates({ isPackaged: true, env: {} })).toBe(true);
  });
  it("is false when PULSE_NO_UPDATE=1", () => {
    expect(shouldCheckForUpdates({ isPackaged: true, env: { PULSE_NO_UPDATE: "1" } })).toBe(false);
  });
});
