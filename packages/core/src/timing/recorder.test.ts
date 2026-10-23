import { describe, expect, it } from "vitest";

import { createRecorder, percentile } from "./recorder";

describe("percentile", () => {
  it("returns null for no samples", () => {
    expect(percentile([], 50)).toBeNull();
  });
  it("uses nearest rank", () => {
    const s = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(100);
    expect(percentile([5], 95)).toBe(5);
  });
  it("does not need sorted input", () => {
    expect(percentile([3, 1, 2], 50)).toBe(2);
  });
});

describe("createRecorder", () => {
  it("measures between mark and measure using the injected clock", () => {
    let t = 100;
    const r = createRecorder({ now: () => t });
    r.mark("chat-open");
    t = 142;
    expect(r.measure("chat-open")).toBe(42);
    expect(r.summary("chat-open")).toEqual({ metric: "chat-open", count: 1, p50: 42, p95: 42, last: 42 });
  });
  it("returns null when measure has no mark, and consumes the mark", () => {
    const r = createRecorder({ now: () => 5 });
    expect(r.measure("x")).toBeNull();
    r.mark("x");
    r.measure("x");
    expect(r.measure("x")).toBeNull();
  });
  it("keeps only the newest samples (ring buffer)", () => {
    const r = createRecorder({ now: () => 0, capacity: 3 });
    [1, 2, 3, 4, 5].forEach((v) => r.record("m", v));
    expect(r.samples("m")).toEqual([3, 4, 5]);
    expect(r.summary("m")?.count).toBe(3);
  });
  it("summarises every metric and notifies listeners", () => {
    const r = createRecorder({ now: () => 0 });
    const seen: Array<[string, number]> = [];
    r.onSample((m, v) => seen.push([m, v]));
    r.record("a", 1);
    r.record("b", 2);
    expect(seen).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
    expect(r.summaries().map((s) => s.metric)).toEqual(["a", "b"]);
    r.reset();
    expect(r.summaries()).toEqual([]);
  });
  it("ignores non-finite values", () => {
    const r = createRecorder({ now: () => 0 });
    r.record("a", Number.NaN);
    expect(r.samples("a")).toEqual([]);
  });
});
