import "server-only";

import { err, ok, type Result } from "@pulse/core/result";
import { createSupabaseAdminClient } from "@/platform/supabase/admin";

const BUCKET = "attachments";
const SIGNED_DOWNLOAD_TTL_SEC = 120;

export async function createSignedUploadTarget(storagePath: string): Promise<
  Result<{ signedUrl: string; token: string; path: string }>
> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    return err("media.storage_error");
  }

  return ok({
    signedUrl: data.signedUrl,
    token: data.token,
    path: storagePath,
  });
}

export async function removeStorageObject(storagePath: string): Promise<void> {
  await removeStorageObjects([storagePath]);
}

export async function removeStorageObjects(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) {
    return;
  }
  const admin = createSupabaseAdminClient();
  await admin.storage.from(BUCKET).remove(storagePaths);
}

export async function getObjectByteSize(storagePath: string): Promise<number | null> {
  const admin = createSupabaseAdminClient();
  const folder = storagePath.includes("/")
    ? storagePath.slice(0, storagePath.lastIndexOf("/"))
    : "";
  const name = storagePath.includes("/")
    ? storagePath.slice(storagePath.lastIndexOf("/") + 1)
    : storagePath;
  const { data, error } = await admin.storage.from(BUCKET).list(folder, {
    search: name,
    limit: 1,
  });
  if (error || !data?.[0]) {
    return null;
  }
  const meta = data[0].metadata as { size?: number } | undefined;
  return typeof meta?.size === "number" ? meta.size : null;
}

export async function createSignedDownloadUrl(
  storagePath: string,
): Promise<Result<string>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_DOWNLOAD_TTL_SEC);
  if (error || !data?.signedUrl) {
    return err("media.storage_error");
  }
  return ok(data.signedUrl);
}
