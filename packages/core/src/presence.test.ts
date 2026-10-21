import { describe, expect, it } from "vitest";

import {
  canShowPresence,
  LAST_SEEN_TOUCH_MS,
  markLastSeenTouched,
  resetLastSeenTouchForTests,
  shouldTouchLastSeen,
} from "./presence";

describe("canShowPresence", () => {
  it("allows online when decision is allow", () => {
    expect(canShowPresence("allow", true)).toEqual({
      showOnline: true,
      showLastSeen: true,
    });
  });

  it("hides online when decision is deny", () => {
    expect(canShowPresence("deny", true)).toEqual({
      showOnline: false,
      showLastSeen: false,
    });
  });

  it("hides last seen when the subject disabled it", () => {
    expect(canShowPresence("allow", false)).toEqual({
      showOnline: true,
      showLastSeen: false,
    });
  });
});

describe("shouldTouchLastSeen", () => {
  it("no-ops inside the throttle window", () => {
    resetLastSeenTouchForTests();
    const start = 10_000;
    expect(shouldTouchLastSeen(start)).toBe(true);
    markLastSeenTouched(start);
    expect(shouldTouchLastSeen(start + 10_000)).toBe(false);
    expect(shouldTouchLastSeen(start + LAST_SEEN_TOUCH_MS)).toBe(true);
  });
});
