import { describe, expect, it } from "vitest";

import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_MS,
  classifyAttachment,
  IMAGE_MAX_BYTES,
  validateAttachment,
} from "./media";

describe("classifyAttachment", () => {
  it("maps known mime types", () => {
    expect(classifyAttachment("image/png")).toBe("image");
    expect(classifyAttachment("application/pdf")).toBe("file");
    expect(classifyAttachment("audio/webm")).toBe("audio");
    expect(classifyAttachment("video/mp4")).toBeNull();
  });
});

describe("validateAttachment", () => {
  it("rejects unsupported types", () => {
    const result = validateAttachment({ mimeType: "video/mp4", sizeBytes: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("media.unsupported_type");
    }
  });

  it("rejects oversized images", () => {
    const result = validateAttachment({
      mimeType: "image/jpeg",
      sizeBytes: IMAGE_MAX_BYTES + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("media.too_large");
    }
  });

  it("rejects audio that is too long", () => {
    const result = validateAttachment({
      mimeType: "audio/ogg",
      sizeBytes: AUDIO_MAX_BYTES,
      durationMs: AUDIO_MAX_DURATION_MS + 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("media.too_long");
    }
  });
});
