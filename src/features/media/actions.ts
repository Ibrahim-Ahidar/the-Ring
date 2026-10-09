"use server";

import { validateAttachment } from "@/platform/media";
import { asRpcClient, callRpc } from "@/platform/rpc";
import { getSessionContext } from "@/platform/session";
import { createSupabaseAdminClient } from "@/platform/supabase/admin";
import type { Result } from "@/platform/result";
import type { TimelineMessage } from "@/platform/timeline";

import { completeUploadFlow } from "./complete-upload-flow";
import {
  failUpload,
  getAttachmentDownloadMeta,
  getMessageAttachments,
  listShared,
  prepareUpload,
  reconcileDeletedAttachments,
} from "./service";
import {
  createSignedDownloadUrl,
  createSignedUploadTarget,
  getObjectByteSize,
  removeStorageObject,
  removeStorageObjects,
} from "./storage-server";
import type { ListSharedResult, SharedTab } from "./types";

async function requireSession() {
  return getSessionContext();
}

export async function prepareUploadAction(input: {
  conversationId: string;
  clientId: string;
  mimeType: string;
  sizeBytes: number;
  fileName?: string | null;
  durationMs?: number | null;
}): Promise<
  Result<{
    messageId: string;
    attachmentId: string;
    storagePath: string;
    signedUrl: string;
    token: string;
    messageType: "image" | "file" | "audio";
  }>
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }

  const validated = validateAttachment({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs ?? undefined,
  });
  if (!validated.ok) {
    return validated;
  }

  const prepared = await prepareUpload(session.rpc, input);
  if (!prepared.ok) {
    return prepared;
  }

  const signed = await createSignedUploadTarget(prepared.value.storage_path);
  if (!signed.ok) {
    return signed;
  }

  return {
    ok: true,
    value: {
      messageId: prepared.value.message_id,
      attachmentId: prepared.value.attachment_id,
      storagePath: prepared.value.storage_path,
      signedUrl: signed.value.signedUrl,
      token: signed.value.token,
      messageType: prepared.value.message_type,
    },
  };
}

export async function completeUploadAction(input: {
  messageId: string;
  width?: number | null;
  height?: number | null;
  waveform?: number[] | null;
}): Promise<Result<TimelineMessage>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }

  return completeUploadFlow(
    session.rpc,
    getObjectByteSize,
    async (messageId) => {
      const marked = await callRpc(
        asRpcClient(createSupabaseAdminClient()),
        "media_mark_object_verified",
        { p_message_id: messageId },
      );
      if (!marked.ok) {
        return marked;
      }
      return { ok: true, value: undefined };
    },
    input,
  );
}

export async function failUploadAction(input: {
  messageId: string;
}): Promise<Result<void>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }

  const failed = await failUpload(session.rpc, input);
  if (!failed.ok) {
    return failed;
  }
  await removeStorageObject(failed.value.storage_path);
  return { ok: true, value: undefined };
}

export async function getDownloadUrlAction(input: {
  attachmentId: string;
}): Promise<Result<{ url: string; fileName: string }>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }

  const meta = await getAttachmentDownloadMeta(session.rpc, input);
  if (!meta.ok) {
    return meta;
  }

  const signed = await createSignedDownloadUrl(meta.value.storage_path);
  if (!signed.ok) {
    return signed;
  }

  return {
    ok: true,
    value: { url: signed.value, fileName: meta.value.file_name },
  };
}

export async function getMessageAttachmentsAction(input: {
  messageId: string;
}): Promise<Result<TimelineMessage["attachments"]>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return getMessageAttachments(session.rpc, input);
}

export async function listSharedAction(input: {
  conversationId: string;
  tab: SharedTab;
  cursor?: string | null;
}): Promise<Result<ListSharedResult>> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }

  const reconciled = await reconcileDeletedAttachments(session.rpc, {
    conversationId: input.conversationId,
  });
  if (!reconciled.ok) {
    return reconciled;
  }
  if (reconciled.value.length > 0) {
    await removeStorageObjects(reconciled.value);
  }

  return listShared(session.rpc, input);
}
