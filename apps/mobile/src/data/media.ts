import {
  err,
  normalizeMimeType,
  ok,
  validateAttachment,
  type MessageAttachment,
  type Result,
} from "@pulse/core";

import { supabase } from "./client";
import { rpc } from "./rpc";

const BUCKET = "attachments";

/** Calls the `media` Edge Function (apps may not use service-role-only RPCs directly). */
async function invokeMedia<T>(body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke("media", { body });
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    try {
      const parsed = (await ctx?.json?.()) as Result<T> | undefined;
      if (parsed && !parsed.ok) return parsed;
    } catch {
      // fall through
    }
    return err("platform.unexpected");
  }
  return (data as Result<T>) ?? err("platform.unexpected");
}

export type MediaUploadInput = {
  conversationId: string;
  clientId: string;
  /** Local file URI from the picker or recorder. */
  uri: string;
  mimeType: string;
  fileName?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
};

/** Validates, reserves the message, uploads the bytes to the signed URL, then completes. */
export async function sendChatMedia(input: MediaUploadInput): Promise<Result<unknown>> {
  const mimeType = normalizeMimeType(input.mimeType);
  let blob: Blob;
  try {
    blob = await (await fetch(input.uri)).blob();
  } catch {
    return err("media.read_failed");
  }
  const valid = validateAttachment({
    mimeType,
    sizeBytes: blob.size,
    durationMs: input.durationMs ?? undefined,
  });
  if (!valid.ok) return valid;

  const prepared = await invokeMedia<{
    messageId: string;
    storagePath: string;
    token: string;
  }>({
    action: "prepare",
    conversationId: input.conversationId,
    clientId: input.clientId,
    mimeType,
    sizeBytes: blob.size,
    fileName: input.fileName ?? null,
    durationMs: input.durationMs ?? null,
  });
  if (!prepared.ok) return prepared;

  const { messageId, storagePath, token } = prepared.value;
  const uploaded = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(storagePath, token, blob, { contentType: mimeType });
  if (uploaded.error) {
    await invokeMedia({ action: "fail", messageId });
    return err("media.upload_failed");
  }

  const completed = await invokeMedia<unknown>({
    action: "complete",
    messageId,
    width: input.width ?? null,
    height: input.height ?? null,
  });
  if (!completed.ok) await invokeMedia({ action: "fail", messageId });
  return completed;
}

export function listMessageAttachments(messageId: string): Promise<Result<MessageAttachment[]>> {
  return rpc<MessageAttachment[]>("get_message_attachments", { p_message_id: messageId }).then((r) =>
    r.ok ? ok(Array.isArray(r.value) ? r.value : []) : r,
  );
}

/** Short-lived signed URL for an attachment. */
export function getAttachmentUrl(attachmentId: string): Promise<Result<{ url: string; fileName: string }>> {
  return invokeMedia({ action: "download", attachmentId });
}

export type SharedTab = "media" | "files" | "links";
export type SharedItem = {
  item_type: SharedTab;
  message_id: string;
  attachment_id: string | null;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  url: string | null;
  created_at: string;
  has_more: boolean;
};

/** One page of a conversation's shared media, files or links (same RPC and cursor as the web). */
export async function listSharedItems(input: {
  conversationId: string;
  tab: SharedTab;
  cursor?: string | null;
}): Promise<Result<{ items: SharedItem[]; hasMore: boolean }>> {
  const result = await rpc<SharedItem[]>("list_shared", {
    p_conversation_id: input.conversationId,
    p_tab: input.tab,
    p_cursor: input.cursor ?? null,
  });
  if (!result.ok) return result;
  const rows = result.value ?? [];
  return ok({ items: rows, hasMore: Boolean(rows[0]?.has_more) });
}

export function sharedNextCursor(items: SharedItem[]): string | null {
  const last = items[items.length - 1];
  if (!last) return null;
  return btoa(`${last.created_at}|${last.message_id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
