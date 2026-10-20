import type { ConversationDetail } from "./types";
import type { TimelineMessage } from "@pulse/core/timeline";

export type OutboundDelivery = "pending" | "failed" | "sent" | "delivered" | "read";

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
  if (!detail) {
    return "sent";
  }
  if (
    detail.other_send_read_receipts &&
    detail.other_last_read_message_id &&
    isReadBy(message, detail)
  ) {
    return "read";
  }
  const deliveredAt = detail.other_last_delivered_at;
  if (deliveredAt && new Date(deliveredAt).getTime() >= new Date(message.created_at).getTime()) {
    return "delivered";
  }
  return "sent";
}

function isReadBy(message: TimelineMessage, detail: ConversationDetail): boolean {
  const cursor: TimelineMessage = {
    id: detail.other_last_read_message_id ?? "",
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
  return isMessageAtOrBefore(message, cursor);
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

/** Ordering of delivery states; `failed` is local only and never ranked. */
export function rankDelivery(status: OutboundDelivery): number {
  switch (status) {
    case "pending":
      return 0;
    case "sent":
      return 1;
    case "delivered":
      return 2;
    case "read":
      return 3;
    default:
      return -1;
  }
}

function laterBy(
  prevAt: string | null,
  prevId: string | null,
  nextAt: string | null,
  nextId: string | null,
): "prev" | "next" {
  if (!prevId) return "next";
  if (!nextId) return "prev";
  const a = prevAt ?? "";
  const b = nextAt ?? "";
  if (a !== b) return a > b ? "prev" : "next";
  return prevId >= nextId ? "prev" : "next";
}

/**
 * Merge a freshly fetched detail into the current one without ever moving a
 * receipt backwards. A stale fetch must not un-deliver or un-read a message;
 * the only legitimate regression is the other user turning read receipts off.
 */
export function mergeDetailMonotonic(
  prev: ConversationDetail | undefined,
  next: ConversationDetail,
): ConversationDetail {
  if (!prev) return next;

  const merged: ConversationDetail = { ...next };

  const prevDelivered = prev.other_last_delivered_at;
  const nextDelivered = next.other_last_delivered_at;
  if (
    prevDelivered &&
    (!nextDelivered ||
      new Date(prevDelivered).getTime() > new Date(nextDelivered).getTime())
  ) {
    merged.other_last_delivered_at = prevDelivered;
  }

  if (next.other_send_read_receipts !== false) {
    const pick = laterBy(
      prev.other_last_read_created_at,
      prev.other_last_read_message_id,
      next.other_last_read_created_at,
      next.other_last_read_message_id,
    );
    if (pick === "prev") {
      merged.other_last_read_message_id = prev.other_last_read_message_id;
      merged.other_last_read_created_at = prev.other_last_read_created_at;
    }
  }

  // The own cursor has no created_at; last_read_at is the server write time of
  // a monotonically advancing cursor, so the later timestamp wins.
  if (
    prev.last_read_message_id &&
    (!next.last_read_message_id ||
      (prev.last_read_at ?? "") > (next.last_read_at ?? ""))
  ) {
    merged.last_read_message_id = prev.last_read_message_id;
    merged.last_read_at = prev.last_read_at;
  }

  return merged;
}
