import type { TimelineMessage } from "@pulse/core/timeline";
import type { ConversationType, MemberRole } from "@/shell/slots/types";

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type ActionAvailability =
  | { allowed: true }
  | { allowed: false; reasonKey: string };

function isTextBody(message: TimelineMessage): boolean {
  return message.type === "text" && message.deletion_scope !== "everyone";
}

export function canCopy(message: TimelineMessage): ActionAvailability {
  if (!isTextBody(message) || !message.body?.trim()) {
    return { allowed: false, reasonKey: "reasons.noText" };
  }
  return { allowed: true };
}

export function canReply(message: TimelineMessage): ActionAvailability {
  if (!isTextBody(message)) {
    return { allowed: false, reasonKey: "reasons.notText" };
  }
  return { allowed: true };
}

export function canEdit(
  message: TimelineMessage,
  currentUserId: string,
  now = Date.now(),
): ActionAvailability {
  if (message.sender_id !== currentUserId) {
    return { allowed: false, reasonKey: "reasons.notSender" };
  }
  if (!isTextBody(message)) {
    return { allowed: false, reasonKey: "reasons.notText" };
  }
  const created = Date.parse(message.created_at);
  if (Number.isNaN(created) || now - created > EDIT_WINDOW_MS) {
    return { allowed: false, reasonKey: "reasons.editWindow" };
  }
  return { allowed: true };
}

export function canDeleteForMe(message: TimelineMessage): ActionAvailability {
  if (message.id.startsWith("pending-")) {
    return { allowed: false, reasonKey: "reasons.pending" };
  }
  return { allowed: true };
}

export function canDeleteForEveryone(
  message: TimelineMessage,
  currentUserId: string,
  conversationType: ConversationType,
  role: MemberRole | undefined,
  now = Date.now(),
): ActionAvailability {
  if (message.deletion_scope === "everyone") {
    return { allowed: false, reasonKey: "reasons.alreadyDeleted" };
  }
  if (message.sender_id === currentUserId) {
    const created = Date.parse(message.created_at);
    if (!Number.isNaN(created) && now - created <= DELETE_EVERYONE_WINDOW_MS) {
      return { allowed: true };
    }
  }
  if (conversationType === "group" && (role === "admin" || role === "owner")) {
    return { allowed: true };
  }
  if (message.sender_id === currentUserId) {
    return { allowed: false, reasonKey: "reasons.deleteWindow" };
  }
  return { allowed: false, reasonKey: "reasons.notModerator" };
}

export function canForward(message: TimelineMessage): ActionAvailability {
  if (!isTextBody(message) || !message.body?.trim()) {
    return { allowed: false, reasonKey: "reasons.noText" };
  }
  return { allowed: true };
}

export function canPin(
  conversationType: ConversationType,
  role: MemberRole | undefined,
): ActionAvailability {
  if (conversationType === "direct") {
    return { allowed: true };
  }
  if (role === "admin" || role === "owner") {
    return { allowed: true };
  }
  return { allowed: false, reasonKey: "reasons.pinRole" };
}
