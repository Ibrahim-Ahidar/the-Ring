import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES } from "@/platform/media";

/** Public storage bucket that holds profile photos. */
export const AVATARS_BUCKET = "avatars";

export const AVATAR_MAX_BYTES = IMAGE_MAX_BYTES;
export const AVATAR_MAX_MB = Math.round(AVATAR_MAX_BYTES / (1024 * 1024));
export const AVATAR_MIME_TYPES = IMAGE_MIME_TYPES;

const AVATAR_PATH = /^avatars\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i;

export type AvatarFileProblem = "unsupported_type" | "too_large" | "empty";

/** Browser-side check run before any upload starts. */
export function checkAvatarFile(file: {
  type: string;
  size: number;
}): AvatarFileProblem | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "unsupported_type";
  }
  if (file.size <= 0) {
    return "empty";
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return "too_large";
  }
  return null;
}

/** True for `avatars/<uid>/<file>` values stored in profiles.avatar_url. */
export function isAvatarStoragePath(value: string): boolean {
  return AVATAR_PATH.test(value);
}

/** Object name inside the avatars bucket for a stored `avatars/<uid>/<file>` path. */
export function avatarObjectName(storagePath: string): string | null {
  return isAvatarStoragePath(storagePath)
    ? storagePath.slice(AVATARS_BUCKET.length + 1)
    : null;
}

/**
 * Turns a stored avatar value into something an <img> can load: absolute
 * http(s) and blob: (local preview) URLs pass through; `avatars/<uid>/<file>`
 * paths become public bucket URLs. Anything else yields null (initials).
 */
export function resolveAvatarSrc(
  value: string | null | undefined,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (typeof value !== "string" || value === "") {
    return null;
  }
  if (/^(https?:\/\/|blob:)/.test(value)) {
    return value;
  }
  if (!supabaseUrl || !isAvatarStoragePath(value)) {
    return null;
  }
  const base = supabaseUrl.replace(/\/+$/, "");
  const encoded = value.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${encoded}`;
}
