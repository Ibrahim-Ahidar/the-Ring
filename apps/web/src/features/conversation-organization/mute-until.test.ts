import { describe, expect, it } from "vitest";

import { isMuted, muteUntilForDuration } from "./mute-until";

describe("muteUntilForDuration", () => {
  const now = Date.parse("2026-01-01T12:00:00.000Z");

  it("computes timed and indefinite mute", () => {
    expect(muteUntilForDuration("1h", now)).toBe("2026-01-01T13:00:00.000Z");
    expect(muteUntilForDuration("forever", now)).toMatch(/^212[56]-/);
  });

  it("detects active mute", () => {
    expect(isMuted("2026-01-01T14:00:00.000Z", now)).toBe(true);
    expect(isMuted(null, now)).toBe(false);
    expect(isMuted("2025-01-01T12:00:00.000Z", now)).toBe(false);
  });
});
