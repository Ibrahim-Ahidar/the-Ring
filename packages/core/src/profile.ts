import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES, validateAttachment } from "./media";
import { callRpc, type RpcClient } from "./rpc";
import { err, ok, type Result } from "./result";
import { validateUsername } from "./username";
import type { OwnProfile } from "./profile-types";

/** Public storage bucket that holds profile photos. */
export const AVATARS_BUCKET = "avatars";

export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 300;

export async function getOwnProfile(rpc: RpcClient): Promise<Result<OwnProfile | null>> {
  const result = await callRpc<OwnProfile[]>(rpc, "identity_get_own_profile");
  if (!result.ok) return result;
  const rows = result.value;
  if (!rows?.length) return ok(null);
  return ok(rows[0]!);
}

export async function updateProfile(
  rpc: RpcClient,
  input: { displayName?: string; bio?: string; timezone?: string },
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_update_profile", {
    p_display_name: input.displayName ?? null,
    p_bio: input.bio ?? null,
    p_timezone: input.timezone ?? null,
  });
  if (!result.ok) return result;
  return ok(undefined);
}

export async function changeUsername(rpc: RpcClient, username: string): Promise<Result<void>> {
  const validated = validateUsername(username);
  if (!validated.ok) return validated;
  const result = await callRpc<null>(rpc, "identity_change_username", {
    p_username: validated.value.display,
  });
  if (!result.ok) return result;
  return ok(undefined);
}

export async function setAvatarPath(rpc: RpcClient, storagePath: string): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_set_avatar_path", { p_storage_path: storagePath });
  if (!result.ok) return result;
  return ok(undefined);
}

/** Clears the photo of the caller; returns the previous stored value (if any). */
export async function clearAvatar(rpc: RpcClient): Promise<Result<string | null>> {
  const result = await callRpc<string | null>(rpc, "identity_clear_avatar");
  if (!result.ok) return result;
  return ok(result.value ?? null);
}

export function validateAvatarUpload(mimeType: string, sizeBytes: number): Result<{ kind: "image" }> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return err("identity.avatar_rejected");
  }
  const attachment = validateAttachment({ mimeType, sizeBytes });
  if (!attachment.ok) return err("identity.avatar_rejected");
  if (sizeBytes > IMAGE_MAX_BYTES) return err("identity.avatar_rejected");
  return ok({ kind: "image" });
}

/** File extension for an avatar upload of the given image MIME type. */
export function avatarExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "gif";
}

const AVATAR_PATH = /^avatars\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i;

/** True for `avatars/<uid>/<file>` values stored in profiles.avatar_url. */
export function isAvatarStoragePath(value: string): boolean {
  return AVATAR_PATH.test(value);
}

/**
 * Turns a stored avatar value into a loadable URL: http(s)/file URLs pass through,
 * `avatars/<uid>/<file>` becomes a public bucket URL, anything else is null (initials).
 */
export function resolveAvatarUrl(value: string | null | undefined, supabaseUrl: string | undefined): string | null {
  if (typeof value !== "string" || value === "") return null;
  if (/^(https?:\/\/|blob:|file:)/.test(value)) return value;
  if (!supabaseUrl || !isAvatarStoragePath(value)) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${value.split("/").map(encodeURIComponent).join("/")}`;
}
