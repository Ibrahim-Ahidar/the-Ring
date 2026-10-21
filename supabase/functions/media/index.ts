// Edge Function media (issue #174). Mobile cannot reach the web server actions,
// so this mirrors apps/web/src/features/media/actions.ts for bearer-token clients.
//
// Auth: the caller's JWT. Every user-level RPC (prepare_upload, complete_upload,
// fail_upload, get_attachment_download, get_message_attachments) runs with the
// caller's token, so conversation membership is enforced by the database.
// The service-role client is used only for what clients may not do:
// signed upload/download URLs, the object size check and
// media_mark_object_verified (granted to service_role only).
// Deploy: supabase functions deploy media
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "attachments";
const DOWNLOAD_TTL_SEC = 120;

const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FILE = ["application/pdf", "text/plain"];
const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"];
const MB = 1024 * 1024;
const AUDIO_MAX_MS = 180 * 1000;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
function fail(code: string, status = 400): Response {
  return json({ ok: false, error: { code } }, status);
}
/** Logs the raw database error and returns a stable code; 403 for authorization-style rejections. */
function reject(message: string | undefined, status: 403 | 500 = 403): Response {
  console.error("media:", message);
  return status === 403 ? fail("media.rejected", 403) : fail("platform.unexpected", 500);
}

/** Same rules as packages/core/src/media.ts validateAttachment. */
function validate(mime: string, size: number, durationMs?: number | null): string | null {
  const limit = IMAGE.includes(mime) ? 8 * MB : FILE.includes(mime) ? 20 * MB : AUDIO.includes(mime) ? 8 * MB : null;
  if (limit === null) return "media.unsupported_type";
  if (!Number.isFinite(size) || size <= 0 || size > limit) return "media.too_large";
  if (AUDIO.includes(mime) && durationMs != null && durationMs > AUDIO_MAX_MS) return "media.too_long";
  return null;
}

type Body = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : null);
const first = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return fail("platform.method_not_allowed", 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return fail("platform.unauthenticated", 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: who, error: whoError } = await user.auth.getUser(auth.slice(7));
  if (whoError || !who.user) return fail("platform.unauthenticated", 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const storage = admin.storage.from(BUCKET);

  let b: Body;
  try {
    b = (await req.json()) as Body;
  } catch {
    return fail("platform.bad_request");
  }

  switch (b.action) {
    case "prepare": {
      const conversationId = str(b.conversationId);
      const clientId = str(b.clientId);
      const mimeType = str(b.mimeType);
      const sizeBytes = num(b.sizeBytes);
      const durationMs = num(b.durationMs);
      if (!conversationId || !clientId || !mimeType || sizeBytes === null) return fail("platform.bad_request");
      const invalid = validate(mimeType, sizeBytes, durationMs);
      if (invalid) return fail(invalid);

      // prepare_upload checks membership and send permission as the caller.
      const prepared = await user.rpc("prepare_upload", {
        p_conversation_id: conversationId,
        p_client_id: clientId,
        p_mime_type: mimeType,
        p_size_bytes: sizeBytes,
        p_file_name: str(b.fileName),
        p_duration_ms: durationMs,
      });
      const row = first(prepared.data as Record<string, string> | Record<string, string>[] | null);
      if (prepared.error || !row) return reject(prepared.error?.message);

      const signed = await storage.createSignedUploadUrl(row.storage_path);
      if (signed.error || !signed.data) return fail("media.storage_error", 500);
      return json({
        ok: true,
        value: {
          messageId: row.message_id,
          attachmentId: row.attachment_id,
          storagePath: row.storage_path,
          signedUrl: signed.data.signedUrl,
          token: signed.data.token,
          messageType: row.message_type,
        },
      });
    }

    case "complete": {
      const messageId = str(b.messageId);
      if (!messageId) return fail("platform.bad_request");
      // Visible only to conversation members (RLS / RPC check as the caller).
      const atts = await user.rpc("get_message_attachments", { p_message_id: messageId });
      const attachment = (Array.isArray(atts.data) ? atts.data[0] : null) as
        | { storage_path: string; size_bytes: number }
        | null;
      if (atts.error || !attachment) return fail("media.rejected", 403);

      const path = attachment.storage_path;
      const slash = path.lastIndexOf("/");
      const listed = await storage.list(slash >= 0 ? path.slice(0, slash) : "", {
        search: slash >= 0 ? path.slice(slash + 1) : path,
        limit: 1,
      });
      const size = (listed.data?.[0]?.metadata as { size?: number } | undefined)?.size;
      if (typeof size !== "number" || size !== attachment.size_bytes) return fail("media.rejected");

      // The service-role call below bypasses RLS, so only the sender may trigger it.
      const owner = await admin.from("messages").select("sender_id").eq("id", messageId).maybeSingle();
      if (owner.error) return reject(owner.error.message, 500);
      if (!owner.data || owner.data.sender_id !== who.user.id) return fail("media.rejected", 403);

      const marked = await admin.rpc("media_mark_object_verified", { p_message_id: messageId });
      if (marked.error) return reject(marked.error.message, 500);

      const completed = await user.rpc("complete_upload", {
        p_message_id: messageId,
        p_object_size_bytes: size,
        p_width: num(b.width),
        p_height: num(b.height),
        p_waveform: Array.isArray(b.waveform) ? b.waveform : null,
      });
      if (completed.error) return reject(completed.error.message);
      return json({ ok: true, value: first(completed.data) });
    }

    case "fail": {
      const messageId = str(b.messageId);
      if (!messageId) return fail("platform.bad_request");
      const failed = await user.rpc("fail_upload", { p_message_id: messageId });
      const row = first(failed.data as { storage_path: string } | { storage_path: string }[] | null);
      if (failed.error || !row) return reject(failed.error?.message);
      await storage.remove([row.storage_path]);
      return json({ ok: true, value: null });
    }

    case "download": {
      const attachmentId = str(b.attachmentId);
      if (!attachmentId) return fail("platform.bad_request");
      const meta = await user.rpc("get_attachment_download", { p_attachment_id: attachmentId });
      const row = first(meta.data as { storage_path: string; file_name: string } | { storage_path: string; file_name: string }[] | null);
      if (meta.error || !row) return reject(meta.error?.message);
      const signed = await storage.createSignedUrl(row.storage_path, DOWNLOAD_TTL_SEC);
      if (signed.error || !signed.data) return fail("media.storage_error", 500);
      return json({ ok: true, value: { url: signed.data.signedUrl, fileName: row.file_name } });
    }

    default:
      return fail("platform.bad_request");
  }
});
