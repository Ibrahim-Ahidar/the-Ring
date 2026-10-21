// Pure recipient filtering and message building for push-notify.
// No Deno or network APIs here so it can be unit tested with vitest.

export interface NotificationRow {
  id: string;
  recipient_id: string;
  type: string;
  actor_id: string | null;
  entity_id: string | null;
  conversation_id: string | null;
}

export interface RecipientState {
  /** conversation_members.muted_until for the recipient, if any. */
  mutedUntil: string | null;
  /** notification_preferences.mentions_only (defaults to false). */
  mentionsOnly: boolean;
  /** True when the notification is for a mention of the recipient. */
  isMention: boolean;
  /** True when the recipient is still a member of the conversation. */
  isMember: boolean;
}

/** Defence in depth: public.notify already applies these rules. */
export function shouldPush(
  n: Pick<NotificationRow, "recipient_id" | "actor_id" | "type">,
  state: RecipientState,
  now: Date = new Date(),
): boolean {
  if (n.type !== "message.created") return false;
  if (n.actor_id !== null && n.actor_id === n.recipient_id) return false;
  if (!state.isMember) return false;
  if (state.mutedUntil !== null && new Date(state.mutedUntil) > now) return false;
  if (state.mentionsOnly && !state.isMention) return false;
  return true;
}

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  channelId: "messages";
  data: { conversationId: string; notificationId: string };
}

export function previewBody(type: string | null, body: string | null): string {
  if (type === "image") return "\u{1F4F7} Photo";
  if (type === "audio" || type === "voice") return "\u{1F3A4} Voice message";
  const text = (body ?? "").trim();
  if (text === "") return "New message";
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export function buildMessages(
  tokens: string[],
  title: string,
  body: string,
  conversationId: string,
  notificationId: string,
): PushMessage[] {
  return tokens.map((to) => ({
    to,
    title,
    body,
    sound: "default" as const,
    channelId: "messages" as const,
    data: { conversationId, notificationId },
  }));
}

export interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

/** Tokens whose ticket (same order as the request) says DeviceNotRegistered. */
export function deadTokens(tokens: string[], tickets: ExpoTicket[]): string[] {
  return tokens.filter(
    (_, i) =>
      tickets[i]?.status === "error" &&
      tickets[i]?.details?.error === "DeviceNotRegistered",
  );
}
