/**
 * Pure metrics recorder for the development timing tool (spec section 11).
 * No DOM, no globals: the clock is injected so it is unit-testable and shared
 * by web, desktop and mobile.
 */

export type MetricSummary = {
  metric: string;
  count: number;
  p50: number;
  p95: number;
  last: number;
};

export type Recorder = {
  mark(metric: string): void;
  /** Time since the matching mark (consumed), recorded as a sample. Null if no mark. */
  measure(metric: string): number | null;
  record(metric: string, valueMs: number): void;
  samples(metric: string): number[];
  summary(metric: string): MetricSummary | null;
  summaries(): MetricSummary[];
  onSample(listener: (metric: string, valueMs: number) => void): () => void;
  reset(): void;
};

/** Nearest-rank percentile. Null for an empty list. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function createRecorder(options: { now: () => number; capacity?: number }): Recorder {
  const capacity = options.capacity ?? 200;
  const marks = new Map<string, number>();
  const buffers = new Map<string, number[]>();
  const listeners = new Set<(metric: string, valueMs: number) => void>();

  function record(metric: string, valueMs: number): void {
    if (!Number.isFinite(valueMs)) return;
    const buf = buffers.get(metric) ?? [];
    buf.push(valueMs);
    if (buf.length > capacity) buf.splice(0, buf.length - capacity);
    buffers.set(metric, buf);
    listeners.forEach((l) => l(metric, valueMs));
  }

  function summary(metric: string): MetricSummary | null {
    const buf = buffers.get(metric);
    if (!buf || buf.length === 0) return null;
    return {
      metric,
      count: buf.length,
      p50: percentile(buf, 50) as number,
      p95: percentile(buf, 95) as number,
      last: buf[buf.length - 1],
    };
  }

  return {
    mark(metric) {
      marks.set(metric, options.now());
    },
    measure(metric) {
      const start = marks.get(metric);
      if (start === undefined) return null;
      marks.delete(metric);
      const value = options.now() - start;
      record(metric, value);
      return value;
    },
    record,
    samples: (metric) => [...(buffers.get(metric) ?? [])],
    summary,
    summaries: () =>
      [...buffers.keys()].map((m) => summary(m)).filter((s): s is MetricSummary => s !== null),
    onSample(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      marks.clear();
      buffers.clear();
    },
  };
}
