import { describe, expect, it } from "vitest";

import { adjustedLatency, estimateClockOffset, medianOffset } from "./clock-offset";

describe("estimateClockOffset", () => {
  it("is zero when clocks agree and the trip is symmetric", () => {
    expect(estimateClockOffset({ clientSend: 1000, serverNow: 1050, clientRecv: 1100 })).toEqual({
      offsetMs: 0,
      rttMs: 100,
    });
  });
  it("reports server ahead of client as a positive offset", () => {
    expect(estimateClockOffset({ clientSend: 1000, serverNow: 1550, clientRecv: 1100 }).offsetMs).toBe(500);
  });
  it("rejects a reply that arrived before it was sent", () => {
    expect(() => estimateClockOffset({ clientSend: 10, serverNow: 5, clientRecv: 9 })).toThrow();
  });
});

describe("medianOffset", () => {
  it("prefers the lowest-RTT samples", () => {
    const m = medianOffset([
      { offsetMs: 10, rttMs: 20 },
      { offsetMs: 12, rttMs: 25 },
      { offsetMs: 900, rttMs: 800 },
      { offsetMs: 11, rttMs: 22 },
    ]);
    expect(m).toBe(10);
  });
  it("returns 0 with no samples", () => {
    expect(medianOffset([])).toBe(0);
  });
});

describe("adjustedLatency", () => {
  it("maps the server send time into the client clock", () => {
    // server stamped 2000; client is 500 behind => that is client time 1500; received at 1620
    expect(adjustedLatency({ sentAtServerMs: 2000, receivedAtClientMs: 1620, offsetMs: 500 })).toBe(120);
  });
});
