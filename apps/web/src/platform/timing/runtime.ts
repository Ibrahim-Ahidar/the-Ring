/**
 * Development-only timing runtime (issue #215). Only ./hooks may import this.
 * Output: a console table on every new sample batch and `window.__pulseTiming`.
 */
import {
  TIMING_METRICS,
  adjustedLatency,
  createRecorder,
  estimateClockOffset,
  medianOffset,
  type OffsetSample,
  type MetricSummary,
} from "@pulse/core/timing/index";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

export type PulseTimingApi = {
  summaries(): MetricSummary[];
  samples(metric: string): number[];
  clockOffsetMs(): number;
  refreshClockOffset(): Promise<number>;
  reset(): void;
};

const recorder = createRecorder({ now: () => performance.now() });
const offsets: OffsetSample[] = [];
let offsetPromise: Promise<void> | null = null;
let coldStartDone = false;

function offsetMs(): number {
  return medianOffset(offsets);
}

/** Five server_now round trips; the lowest-RTT half decides the offset. */
async function sampleOffset(): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  for (let i = 0; i < 5; i += 1) {
    const clientSend = Date.now();
    const { data, error } = await supabase.rpc("server_now");
    const clientRecv = Date.now();
    if (error || typeof data !== "number") return;
    offsets.push(estimateClockOffset({ clientSend, serverNow: data, clientRecv }));
  }
}

function ensureOffset(): Promise<void> {
  offsetPromise ??= sampleOffset().catch(() => undefined);
  return offsetPromise;
}

function print(): void {
  console.table(
    recorder.summaries().map((s) => ({
      metric: s.metric,
      n: s.count,
      p50_ms: Math.round(s.p50),
      p95_ms: Math.round(s.p95),
      last_ms: Math.round(s.last),
    })),
  );
}

recorder.onSample(print);

const api: PulseTimingApi = {
  summaries: () => recorder.summaries(),
  samples: (metric) => recorder.samples(metric),
  clockOffsetMs: offsetMs,
  async refreshClockOffset() {
    offsets.length = 0;
    offsetPromise = null;
    await ensureOffset();
    return offsetMs();
  },
  reset: () => recorder.reset(),
};

if (typeof window !== "undefined") {
  (window as unknown as { __pulseTiming?: PulseTimingApi }).__pulseTiming = api;
  void ensureOffset();
}

export function tapStart(clientId: string, t: number): void {
  // The facade passes the timestamp taken at the call site, so the async
  // import does not inflate the measurement.
  starts.set(`tap:${clientId}`, t);
}

export function bubbleShown(clientId: string, t: number): void {
  const start = starts.get(`tap:${clientId}`);
  if (start === undefined) return;
  starts.delete(`tap:${clientId}`);
  recorder.record(TIMING_METRICS.tapToBubble, t - start);
}

/**
 * Today the sent time is the message row's created_at (server clock, so the
 * measured offset applies). When the Envelope carries sentAt (spec section 5)
 * pass that instead; it comes from the sender's clock, so subtract the sender's
 * offset in the same way.
 */
export function arrival(sentAtIso: string, receivedAtClientMs: number): void {
  const sentAt = Date.parse(sentAtIso);
  if (Number.isNaN(sentAt)) return;
  void ensureOffset().then(() => {
    recorder.record(
      TIMING_METRICS.sendToArrival,
      adjustedLatency({ sentAtServerMs: sentAt, receivedAtClientMs, offsetMs: offsetMs() }),
    );
  });
}

export function chatOpenStart(conversationId: string, t: number): void {
  starts.set(`open:${conversationId}`, t);
}

export function chatOpenPainted(conversationId: string, t: number): void {
  const start = starts.get(`open:${conversationId}`);
  if (start === undefined) return;
  starts.delete(`open:${conversationId}`);
  recorder.record(TIMING_METRICS.chatOpen, t - start);
}

export function coldStartPainted(t: number): void {
  if (coldStartDone) return;
  coldStartDone = true;
  // performance.now() is relative to timeOrigin (navigation start).
  recorder.record(TIMING_METRICS.coldStart, t);
}

const starts = new Map<string, number>();
