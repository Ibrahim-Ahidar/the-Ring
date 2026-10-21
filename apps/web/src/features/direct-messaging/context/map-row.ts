import type { TimelineMessage } from "@pulse/core/timeline";

export function rowToTimelineMessage(
  row: Record<string, unknown>,
): TimelineMessage | null {
  const id = row.id;
  if (typeof id !== "string") {
    return null;
  }
  return {
    id,
    conversation_id: String(row.conversation_id ?? ""),
    sender_id: String(row.sender_id ?? ""),
    client_id: String(row.client_id ?? ""),
    type: (row.type as TimelineMessage["type"]) ?? "text",
    body: (row.body as string | null) ?? null,
    reply_to_id: (row.reply_to_id as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    edited_at: (row.edited_at as string | null) ?? null,
    deleted_at: (row.deleted_at as string | null) ?? null,
    deletion_scope:
      (row.deletion_scope as TimelineMessage["deletion_scope"]) ?? "none",
    pinned_at: (row.pinned_at as string | null) ?? null,
    forwarded: Boolean(row.forwarded),
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}
