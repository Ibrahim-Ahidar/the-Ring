import type { SqlExecutor } from "@pulse/core/local-store";

export type SearchHit = {
  messageId: string;
  conversationId: string;
  sentAt: string;
  body: string;
  snippet: string;
};

/** Turns user text into a safe FTS5 query: every word quoted, the last one as a prefix. */
export function toFtsQuery(text: string): string | null {
  const words = text
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w, i) => `"${w}"${i === words.length - 1 ? "*" : ""}`).join(" ");
}

/**
 * Offline message search over the local FTS5 index (messages_fts, the schema core defines).
 * Newest first; unsent and deleted messages are left out.
 */
export async function searchLocalMessages(
  db: SqlExecutor,
  text: string,
  opts: { conversationId?: string; limit?: number } = {},
): Promise<SearchHit[]> {
  const q = toFtsQuery(text);
  if (!q) return [];
  const params: (string | number)[] = [q];
  let where = "messages_fts MATCH ? AND m.deleted = 0 AND (m.status IS NULL OR m.status NOT IN ('pending','failed'))";
  if (opts.conversationId) {
    where += " AND m.conversation_id = ?";
    params.push(opts.conversationId);
  }
  params.push(opts.limit ?? 50);
  const rows = await db.query<{
    id: string;
    conversation_id: string;
    sent_at: string;
    body: string;
    snippet: string;
  }>(
    `SELECT m.id AS id, m.conversation_id AS conversation_id, m.sent_at AS sent_at, m.body AS body,
            snippet(messages_fts, 0, '', '', '…', 12) AS snippet
       FROM messages_fts JOIN messages m ON m.rowid = messages_fts.rowid
      WHERE ${where}
      ORDER BY m.sent_at DESC, m.id DESC
      LIMIT ?`,
    params,
  );
  return rows.map((r) => ({
    messageId: r.id,
    conversationId: r.conversation_id,
    sentAt: r.sent_at,
    body: r.body,
    snippet: r.snippet,
  }));
}
