import type { MessageAttachment } from "@/platform/timeline";
import type { AttachmentKind } from "@/platform/media";

export type PrepareUploadRow = {
  message_id: string;
  attachment_id: string;
  storage_path: string;
  message_type: "image" | "file" | "audio";
};

export type CompleteUploadRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  client_id: string;
  type: "image" | "file" | "audio";
  body: string | null;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  deletion_scope: "none" | "everyone";
  pinned_at: string | null;
  forwarded: boolean;
  metadata: Record<string, unknown> | null;
};

export type SharedTab = "media" | "files" | "links";

export type SharedItem = {
  item_type: SharedTab;
  message_id: string;
  attachment_id: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  url: string | null;
  created_at: string;
  has_more: boolean;
};

export type ListSharedResult = {
  items: SharedItem[];
  hasMore: boolean;
};

export type DownloadMeta = {
  storage_path: string;
  mime_type: string;
  file_name: string;
};

export type LocalUploadState = {
  clientId: string;
  conversationId: string;
  messageId: string | null;
  kind: AttachmentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl: string | null;
  progress: number;
  status: "validating" | "preparing" | "uploading" | "completing" | "ready" | "failed";
  errorCode: string | null;
};

export type MessageAttachmentList = MessageAttachment[];
