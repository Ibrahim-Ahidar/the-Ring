/**
 * Client/server clock offset from one RPC round trip (NTP style).
 * offset = serverNow - (clientSend + clientRecv) / 2, positive when the
 * server clock is ahead of the client clock. All values are epoch ms.
 */

export type OffsetSample = { offsetMs: number; rttMs: number };

export function estimateClockOffset(trip: {
  clientSend: number;
  serverNow: number;
  clientRecv: number;
}): OffsetSample {
  const rttMs = trip.clientRecv - trip.clientSend;
  if (rttMs < 0) throw new Error("clientRecv is before clientSend");
  return { offsetMs: trip.serverNow - (trip.clientSend + trip.clientRecv) / 2, rttMs };
}

/** Lower median offset of the lower-RTT half of the samples (least network noise). */
export function medianOffset(samples: readonly OffsetSample[]): number {
  if (samples.length === 0) return 0;
  const byRtt = [...samples].sort((a, b) => a.rttMs - b.rttMs);
  const best = byRtt.slice(0, Math.max(1, Math.ceil(byRtt.length / 2)));
  const offsets = best.map((s) => s.offsetMs).sort((a, b) => a - b);
  return offsets[Math.floor((offsets.length - 1) / 2)];
}

/**
 * Send-to-arrival: the server stamped the send time (created_at today, an
 * Envelope sentAt later), the client read its own clock on arrival.
 */
export function adjustedLatency(input: {
  sentAtServerMs: number;
  receivedAtClientMs: number;
  offsetMs: number;
}): number {
  return input.receivedAtClientMs - (input.sentAtServerMs - input.offsetMs);
}
