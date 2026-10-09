import { shouldHideMessageForViewer } from "@/features/media/upload-status";
import type { TimelineMessage } from "@/platform/timeline";

/** Matches {@link list_messages} tombstone projection for delete-for-everyone. */
export function applyListMessagesTombstone(message: TimelineMessage): TimelineMessage {
  if (message.deletion_scope !== "everyone") {
    return message;
  }
  return {
    ...message,
    body: null,
    metadata: {},
    attachments: [],
  };
}

export function mergeRealtimeMessage(
  existing: TimelineMessage | undefined,
  incoming: TimelineMessage,
): TimelineMessage {
  const merged: TimelineMessage = {
    ...incoming,
    attachments:
      incoming.attachments && incoming.attachments.length > 0
        ? incoming.attachments
        : existing?.attachments,
    reactions:
      incoming.reactions && incoming.reactions.length > 0
        ? incoming.reactions
        : existing?.reactions,
  };
  return applyListMessagesTombstone(merged);
}

export function shouldApplyRealtimeMessage(
  message: TimelineMessage,
  viewerId: string,
): boolean {
  return !shouldHideMessageForViewer(message, viewerId);
}

export function isMediaType(message: TimelineMessage): boolean {
  return (
    message.type === "image" ||
    message.type === "file" ||
    message.type === "audio"
  );
}

export function needsAttachmentFetch(message: TimelineMessage): boolean {
  if (!isMediaType(message)) {
    return false;
  }
  if (message.deletion_scope === "everyone") {
    return false;
  }
  if (message.attachments && message.attachments.length > 0) {
    return false;
  }
  const upload = message.metadata?.upload;
  if (upload === "pending" || upload === "failed") {
    return false;
  }
  return true;
}
