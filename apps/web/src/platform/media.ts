import { err, ok, type Result } from "@pulse/core/result";

const MB = 1024 * 1024;

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const DOCUMENT_MIME_TYPES = ["application/pdf", "text/plain"] as const;

export const AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
] as const;

export const IMAGE_MAX_BYTES = 8 * MB;
export const DOCUMENT_MAX_BYTES = 20 * MB;
export const AUDIO_MAX_BYTES = 8 * MB;
export const AUDIO_MAX_DURATION_MS = 180 * 1000;
export const USER_STORAGE_QUOTA_BYTES = 100 * MB;

export type AttachmentKind = "image" | "file" | "audio";

export function classifyAttachment(mimeType: string): AttachmentKind | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "image";
  }
  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "file";
  }
  if ((AUDIO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return "audio";
  }
  return null;
}

export type ValidateAttachmentInput = {
  mimeType: string;
  sizeBytes: number;
  durationMs?: number;
};

export function validateAttachment(
  input: ValidateAttachmentInput,
): Result<{ kind: AttachmentKind }> {
  const kind = classifyAttachment(input.mimeType);
  if (!kind) {
    return err("media.unsupported_type");
  }

  if (kind === "image" && input.sizeBytes > IMAGE_MAX_BYTES) {
    return err("media.too_large");
  }
  if (kind === "file" && input.sizeBytes > DOCUMENT_MAX_BYTES) {
    return err("media.too_large");
  }
  if (kind === "audio") {
    if (input.sizeBytes > AUDIO_MAX_BYTES) {
      return err("media.too_large");
    }
    if (
      input.durationMs !== undefined &&
      input.durationMs > AUDIO_MAX_DURATION_MS
    ) {
      return err("media.too_long");
    }
  }

  return ok({ kind });
}
