import { normalizeSearchText } from "./search-schema";
import type { MessageRow, SqlExecutor } from "./types";

export type SearchSnippetPart = { text: string; match: boolean };

export type MessageSearchHit = {
  message: MessageRow;
  /** Text around the match, split so the UI can highlight without parsing HTML. */
  snippet: SearchSnippetPart[];
};

export type MessageSearchOptions = {
  query: string;
  /** Limit to one chat. Omit to search every chat. */
  conversationId?: string;
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 20;
const MARK_OPEN = "\u0002";
const MARK_CLOSE = "\u0003";

/** Builds an FTS5 MATCH expression: every word must match, each as a prefix. Null when empty. */
export function toFtsQuery(query: string): string | null {
  const words = normalizeSearchText(query).match(/[\p{L}\p{N}\p{M}]+/gu);
  if (!words || words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(" ");
}

function parseSnippet(raw: string): SearchSnippetPart[] {
  const parts: SearchSnippetPart[] = [];
  let rest = raw;
  while (rest.length > 0) {
    const open = rest.indexOf(MARK_OPEN);
    if (open === -1) {
      parts.push({ text: rest, match: false });
      break;
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), match: false });
    const close = rest.indexOf(MARK_CLOSE, open);
    const end = close === -1 ? rest.length : close;
    parts.push({ text: rest.slice(open + 1, end), match: true });
    rest = close === -1 ? "" : rest.slice(close + 1);
  }
  return parts;
}

type Row = MessageRow & { snippet_text: string };

/** Ranked (bm25, then newest) full-text search over local message bodies. */
export async function searchLocalMessages(
  db: SqlExecutor,
  opts: MessageSearchOptions,
): Promise<MessageSearchHit[]> {
  const match = toFtsQuery(opts.query);
  if (!match) return [];
  const params: (string | number)[] = [match];
  let scope = "";
  if (opts.conversationId) {
    scope = ` AND m.conversation_id = ?`;
    params.push(opts.conversationId);
  }
  params.push(opts.limit ?? DEFAULT_LIMIT, opts.offset ?? 0);
  const rows = await db.query<Row>(
    `SELECT m.*, snippet(messages_search, 0, '${MARK_OPEN}', '${MARK_CLOSE}', '…', 16) AS snippet_text
     FROM messages_search
     JOIN messages m ON m.rowid = messages_search.rowid
     WHERE messages_search MATCH ? AND m.deleted = 0${scope}
     ORDER BY bm25(messages_search), m.sent_at DESC, m.id DESC
     LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map(({ snippet_text, ...message }) => ({
    message: message as MessageRow,
    snippet: parseSnippet(snippet_text),
  }));
}
