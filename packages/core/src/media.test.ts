import { describe, expect, it } from "vitest";

import {
  AUDIO_MAX_BYTES,
  AUDIO_MAX_DURATION_MS,
  classifyAttachment,
  IMAGE_MAX_BYTES,
  normalizeMimeType,
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

describe("normalizeMimeType", () => {
  it("lowercases and strips parameters", () => {
    expect(normalizeMimeType("Image/PNG; charset=binary")).toBe("image/png");
  });

  it("maps device aliases onto allowed types", () => {
    expect(normalizeMimeType("image/jpg")).toBe("image/jpeg");
    expect(normalizeMimeType("audio/m4a")).toBe("audio/mp4");
    expect(normalizeMimeType("audio/x-m4a")).toBe("audio/mp4");
    expect(normalizeMimeType("audio/aac")).toBe("audio/mp4");
  });

  it("leaves unknown types alone", () => {
    expect(normalizeMimeType("video/mp4")).toBe("video/mp4");
  });
});
