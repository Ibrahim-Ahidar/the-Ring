import { AUDIO_MAX_DURATION_MS } from "@/platform/media";

export function clampRecordingMs(durationMs: number): number {
  if (durationMs <= 0) {
    return 0;
  }
  return Math.min(durationMs, AUDIO_MAX_DURATION_MS);
}
