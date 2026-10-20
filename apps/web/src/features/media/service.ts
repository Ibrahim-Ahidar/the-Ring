import { encodeBase64Url } from "@/platform/base64url";
import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";
import type { MessageAttachment } from "@/platform/timeline";
import { mapMessageRow } from "@/features/direct-messaging/service";
import type { RpcMessageRow } from "@/features/direct-messaging/types";

import type {
  CompleteUploadRow,
  DownloadMeta,
  ListSharedResult,
  PrepareUploadRow,
  SharedItem,
  SharedTab,
} from "./types";

export async function prepareUpload(
  rpc: RpcClient,
  input: {
    conversationId: string;
    clientId: string;
    mimeType: string;
    sizeBytes: number;
    fileName?: string | null;
    durationMs?: number | null;
  },
): Promise<Result<PrepareUploadRow>> {
  const result = await callRpc<PrepareUploadRow[]>(rpc, "prepare_upload", {
    p_conversation_id: input.conversationId,
    p_client_id: input.clientId,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_file_name: input.fileName ?? null,
    p_duration_ms: input.durationMs ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(row);
}

export async function completeUpload(
  rpc: RpcClient,
  input: {
    messageId: string;
    objectSizeBytes: number;
    width?: number | null;
    height?: number | null;
    waveform?: number[] | null;
  },
): Promise<Result<RpcMessageRow>> {
  const result = await callRpc<CompleteUploadRow[]>(rpc, "complete_upload", {
    p_message_id: input.messageId,
    p_object_size_bytes: input.objectSizeBytes,
    p_width: input.width ?? null,
    p_height: input.height ?? null,
    p_waveform: input.waveform ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(row as RpcMessageRow);
}

export async function failUpload(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<{ storage_path: string }>> {
  const result = await callRpc<{ storage_path: string }[]>(rpc, "fail_upload", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(row);
}

export async function getMessageAttachments(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<MessageAttachment[]>> {
  const result = await callRpc<unknown>(rpc, "get_message_attachments", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  const value = result.value;
  if (Array.isArray(value)) {
    return ok(value as MessageAttachment[]);
  }
  if (typeof value === "string") {
    try {
      return ok(JSON.parse(value) as MessageAttachment[]);
    } catch {
      return ok([]);
    }
  }
  return ok([]);
}

export async function getAttachmentDownloadMeta(
  rpc: RpcClient,
  input: { attachmentId: string },
): Promise<Result<DownloadMeta>> {
  const result = await callRpc<DownloadMeta[]>(rpc, "get_attachment_download", {
    p_attachment_id: input.attachmentId,
  });
  if (!result.ok) {
    return result;
  }
  const row = Array.isArray(result.value) ? result.value[0] : result.value;
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(row);
}

export async function reconcileDeletedAttachments(
  rpc: RpcClient,
  input: { conversationId: string },
): Promise<Result<string[]>> {
  const result = await callRpc<{ storage_path: string }[] | string[]>(
    rpc,
    "media_reconcile_deleted_attachments",
    { p_conversation_id: input.conversationId },
  );
  if (!result.ok) {
    return result;
  }
  const rows = result.value ?? [];
  if (!Array.isArray(rows)) {
    return ok([]);
  }
  const paths = rows
    .map((row) => {
      if (typeof row === "string") {
        return row;
      }
      if (row && typeof row === "object") {
        const record = row as Record<string, unknown>;
        if (typeof record.storage_path === "string") {
          return record.storage_path;
        }
        const first = Object.values(record).find((v) => typeof v === "string");
        return typeof first === "string" ? first : "";
      }
      return "";
    })
    .filter((path) => path.length > 0);
  return ok(paths);
}

export async function listShared(
  rpc: RpcClient,
  input: {
    conversationId: string;
    tab: SharedTab;
    cursor?: string | null;
  },
): Promise<Result<ListSharedResult>> {
  const result = await callRpc<SharedItem[]>(rpc, "list_shared", {
    p_conversation_id: input.conversationId,
    p_tab: input.tab,
    p_cursor: input.cursor ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const rows = result.value ?? [];
  const hasMore = rows.length > 0 ? Boolean(rows[0]?.has_more) : false;
  return ok({ items: rows, hasMore });
}

export function mapCompleteToTimeline(row: RpcMessageRow) {
  return mapMessageRow(row);
}

export function sharedPageNextCursor(items: SharedItem[]): string | null {
  if (items.length === 0) {
    return null;
  }
  const last = items[items.length - 1]!;
  const payload = `${last.created_at}|${last.message_id}`;
  return encodeBase64Url(payload);
}

export async function markAudioPlayed(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<null>> {
  const result = await callRpc<unknown>(rpc, "mark_audio_played", {
    p_message_id: input.messageId,
  });
  return result.ok ? ok(null) : result;
}

export async function getAudioPlayedCount(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<number>> {
  const result = await callRpc<unknown>(rpc, "get_audio_played_count", {
    p_message_id: input.messageId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(Number(result.value ?? 0));
}
