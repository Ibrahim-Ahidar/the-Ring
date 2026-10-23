export * from "./recorder";
export * from "./clock-offset";

export const TIMING_METRICS = {
  sendToArrival: "send-to-arrival",
  tapToBubble: "tap-to-bubble",
  chatOpen: "chat-open",
  coldStart: "cold-start",
} as const;

export type TimingMetric = (typeof TIMING_METRICS)[keyof typeof TIMING_METRICS];
