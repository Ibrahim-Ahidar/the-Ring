import { describe, expect, it } from "vitest";

import { AUDIO_MAX_DURATION_MS } from "@/platform/media";

import { clampRecordingMs } from "./clamp-recording-ms";

describe("clampRecordingMs", () => {
  it("caps at 180 seconds", () => {
    expect(clampRecordingMs(AUDIO_MAX_DURATION_MS + 1)).toBe(
      AUDIO_MAX_DURATION_MS,
    );
  });

  it("returns zero for non-positive input", () => {
    expect(clampRecordingMs(0)).toBe(0);
    expect(clampRecordingMs(-100)).toBe(0);
  });

  it("passes through under the cap", () => {
    expect(clampRecordingMs(30_000)).toBe(30_000);
  });
});
