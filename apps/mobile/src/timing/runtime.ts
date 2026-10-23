/** Development-only runtime (issue #215). Only ./index may require this. */
import {
  TIMING_METRICS,
  adjustedLatency,
  createRecorder,
  estimateClockOffset,
  medianOffset,
  type OffsetSample,
} from "@pulse/core/timing/index";
import { supabase } from "@/data/client";

const recorder = createRecorder({ now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()) });
const offsets: OffsetSample[] = [];
const starts = new Map<string, number>();
let offsetPromise: Promise<void> | null = null;
let coldStartDone = false;
const appStart = Date.now();

recorder.onSample((metric) => {
  const s = recorder.summaries().find((x) => x.metric === metric);
  if (s) console.log(`[pulse-timing] ${s.metric} n=${s.count} p50=${Math.round(s.p50)}ms p95=${Math.round(s.p95)}ms last=${Math.round(s.last)}ms`);
});

async function sampleOffset(): Promise<void> {
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

export function tapStart(key: string, t: number): void {
  starts.set(`tap:${key}`, t);
}
export function bubbleShown(key: string, t: number): void {
  const start = starts.get(`tap:${key}`);
  if (start === undefined) return;
  starts.delete(`tap:${key}`);
  recorder.record(TIMING_METRICS.tapToBubble, t - start);
}
export function arrival(sentAtIso: string, receivedAtClientMs: number): void {
  const sentAt = Date.parse(sentAtIso);
  if (Number.isNaN(sentAt)) return;
  void ensureOffset().then(() => {
    recorder.record(
      TIMING_METRICS.sendToArrival,
      adjustedLatency({ sentAtServerMs: sentAt, receivedAtClientMs, offsetMs: medianOffset(offsets) }),
    );
  });
}
export function chatOpenStart(id: string, t: number): void {
  starts.set(`open:${id}`, t);
}
export function chatOpenPainted(id: string, t: number): void {
  const start = starts.get(`open:${id}`);
  if (start === undefined) return;
  starts.delete(`open:${id}`);
  recorder.record(TIMING_METRICS.chatOpen, t - start);
}
export function coldStartPainted(t: number): void {
  if (coldStartDone) return;
  coldStartDone = true;
  // JS start is the earliest clock available here; native launch time is not included.
  void t;
  recorder.record(TIMING_METRICS.coldStart, Date.now() - appStart);
}
