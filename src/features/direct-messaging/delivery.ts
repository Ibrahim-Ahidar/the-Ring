import type { ConversationDetail } from "./types";
import type { TimelineMessage } from "@/platform/timeline";

export type OutboundDelivery = "pending" | "failed" | "sent" | "read";

export function compareMessages(a: TimelineMessage, b: TimelineMessage): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function isMessageAtOrBefore(
  message: TimelineMessage,
  cursorMessage: TimelineMessage,
): boolean {
  return compareMessages(message, cursorMessage) <= 0;
}

export function outboundDeliveryStatus(
  message: TimelineMessage,
  detail: ConversationDetail | undefined,
  localStatus?: "pending" | "failed",
): OutboundDelivery {
  if (localStatus === "pending") {
    return "pending";
  }
  if (localStatus === "failed") {
    return "failed";
  }
  if (!detail?.other_send_read_receipts || !detail.other_last_read_message_id) {
    return "sent";
  }
  const cursor: TimelineMessage = {
    id: detail.other_last_read_message_id,
    conversation_id: message.conversation_id,
    sender_id: detail.other_user_id ?? "",
    client_id: "",
    type: "text",
    body: null,
    reply_to_id: null,
    created_at: detail.other_last_read_created_at ?? message.created_at,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
  };
  if (isMessageAtOrBefore(message, cursor)) {
    return "read";
  }
  return "sent";
}

export function firstUnreadMessageId(
  messages: TimelineMessage[],
  lastReadMessageId: string | null,
  currentUserId: string,
): string | null {
  const chronological = [...messages].reverse();
  const cursor = lastReadMessageId
    ? messages.find((m) => m.id === lastReadMessageId)
    : null;

  for (const message of chronological) {
    if (message.sender_id === currentUserId) {
      continue;
    }
    if (!cursor) {
      return message.id;
    }
    if (!isMessageAtOrBefore(message, cursor)) {
      return message.id;
    }
  }
  return null;
}

export function shouldGroupWithPrevious(
  current: TimelineMessage,
  previous: TimelineMessage | undefined,
): boolean {
  if (!previous) {
    return false;
  }
  if (current.sender_id !== previous.sender_id) {
    return false;
  }
  const gap =
    new Date(current.created_at).getTime() -
    new Date(previous.created_at).getTime();
  return gap >= 0 && gap <= 5 * 60 * 1000;
}
