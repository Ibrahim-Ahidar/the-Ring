import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { calendarDaysAgo, isSameCalendarDay } from "./calendar";

// The server renders in UTC; the viewer may not be. Day boundaries must follow
// the viewer's time zone, not the process's, or SSR and hydration disagree.
const original = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "UTC";
});
afterEach(() => {
  process.env.TZ = original;
});

const lateUtc = new Date("2026-10-14T23:30:00Z"); // 08:30 on the 15th in Tokyo
const nextMorning = new Date("2026-10-15T08:00:00Z");

describe("calendarDaysAgo", () => {
  it("counts days in the given time zone, not the process's", () => {
    expect(calendarDaysAgo(lateUtc, nextMorning, "Asia/Tokyo")).toBe(0);
    expect(calendarDaysAgo(lateUtc, nextMorning, "UTC")).toBe(1);
  });

  it("is stable across DST changes", () => {
    const beforeDst = new Date("2026-03-28T12:00:00Z");
    const afterDst = new Date("2026-03-30T12:00:00Z");
    expect(calendarDaysAgo(beforeDst, afterDst, "Europe/Paris")).toBe(2);
  });
});

describe("isSameCalendarDay", () => {
  it("compares days in the given time zone", () => {
    const a = "2026-10-14T23:30:00Z";
    const b = "2026-10-15T08:00:00Z";
    expect(isSameCalendarDay(a, b, "Asia/Tokyo")).toBe(true);
    expect(isSameCalendarDay(a, b, "UTC")).toBe(false);
  });
});
