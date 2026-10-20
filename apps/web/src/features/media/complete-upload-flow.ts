import type { RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";
import type { TimelineMessage } from "@/platform/timeline";
import type { RpcMessageRow } from "@/features/direct-messaging/types";

import {
  completeUpload,
  getMessageAttachments,
  mapCompleteToTimeline,
} from "./service";

export type UploadObjectVerifier = (
  storagePath: string,
) => Promise<number | null>;

export async function completeUploadFlow(
  rpc: RpcClient,
  verifyObject: UploadObjectVerifier,
  markObjectVerified: (messageId: string) => Promise<Result<void>>,
  input: {
    messageId: string;
    width?: number | null;
    height?: number | null;
    waveform?: number[] | null;
  },
): Promise<Result<TimelineMessage>> {
  const attachments = await getMessageAttachments(rpc, {
    messageId: input.messageId,
  });
  if (!attachments.ok) {
    return attachments;
  }
  const attachment = attachments.value[0];
  if (!attachment) {
    return err("media.rejected");
  }

  const objectSize = await verifyObject(attachment.storage_path);
  if (objectSize === null || objectSize !== attachment.size_bytes) {
    return err("media.rejected");
  }

  const marked = await markObjectVerified(input.messageId);
  if (!marked.ok) {
    return marked;
  }

  const completed = await completeUpload(rpc, {
    messageId: input.messageId,
    objectSizeBytes: objectSize,
    width: input.width,
    height: input.height,
    waveform: input.waveform,
  });
  if (!completed.ok) {
    return completed;
  }

  const refreshed = await getMessageAttachments(rpc, {
    messageId: input.messageId,
  });
  const message = mapCompleteToTimeline(completed.value as RpcMessageRow);
  if (refreshed.ok) {
    message.attachments = refreshed.value;
  }
  return ok(message);
}

