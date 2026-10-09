import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

const BUCKET = "attachments";

export async function uploadToSignedTarget(input: {
  storagePath: string;
  token: string;
  file: File;
  onProgress?: (ratio: number) => void;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const supabase = createSupabaseBrowserClient();
  if (input.onProgress) {
    input.onProgress(0);
  }
  const { error } = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(input.storagePath, input.token, input.file, {
      upsert: true,
    });
  if (error) {
    return { ok: false, code: "media.storage_error" };
  }
  if (input.onProgress) {
    input.onProgress(1);
  }
  return { ok: true };
}
