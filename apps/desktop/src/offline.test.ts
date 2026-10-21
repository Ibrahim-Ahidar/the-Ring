import { describe, expect, it, vi } from "vitest";
import { isOfflineError, nextRetryDelay } from "./offline";
import { createRetryController } from "./retry-controller";

describe("isOfflineError", () => {
  it.each([-106, -105, -102, -101, -118, -109, -21, -7])("treats %i as offline", (c) =>
    expect(isOfflineError(c)).toBe(true));
  it("ignores ERR_ABORTED", () => expect(isOfflineError(-3)).toBe(false));
  it("ignores unrelated errors", () => {
    expect(isOfflineError(-200)).toBe(false);
    expect(isOfflineError(0)).toBe(false);
  });
});

describe("nextRetryDelay", () => {
  it("backs off 2s, 4s, 8s ... capped at 30s", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(nextRetryDelay)).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
  it("handles negative attempts", () => expect(nextRetryDelay(-1)).toBe(2000));
});

describe("createRetryController", () => {
  function setup(results: boolean[]) {
    const timers: { fn: () => void; ms: number }[] = [];
    const probe = vi.fn(async () => results.shift() ?? true);
    const onOnline = vi.fn();
    const c = createRetryController({
      probe,
      onOnline,
      setTimer: (fn, ms) => {
        const t = { fn, ms };
        timers.push(t);
        return t;
      },
      clearTimer: (h) => {
        const i = timers.indexOf(h as never);
        if (i >= 0) timers.splice(i, 1);
      },
    });
    return { c, timers, probe, onOnline };
  }
  it("schedules with growing delays then calls onOnline", async () => {
    const { c, timers, onOnline } = setup([false, false, true]);
    c.start();
    expect(timers.map((t) => t.ms)).toEqual([2000]);
    await timers.shift()!.fn();
    await Promise.resolve();
    expect(timers.map((t) => t.ms)).toEqual([4000]);
    await timers.shift()!.fn();
    await Promise.resolve();
    expect(timers.map((t) => t.ms)).toEqual([8000]);
    await timers.shift()!.fn();
    await Promise.resolve();
    expect(onOnline).toHaveBeenCalledTimes(1);
    expect(timers).toEqual([]);
  });
  it("retryNow probes immediately and resets the schedule", async () => {
    const { c, timers, probe } = setup([false, false]);
    c.start();
    await c.retryNow();
    expect(probe).toHaveBeenCalledTimes(1);
    expect(timers.map((t) => t.ms)).toEqual([4000]);
  });
  it("stop cancels pending retries", () => {
    const { c, timers } = setup([]);
    c.start();
    c.stop();
    expect(timers).toEqual([]);
  });
});
