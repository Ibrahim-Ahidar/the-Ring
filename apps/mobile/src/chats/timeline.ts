import type { OutboundDelivery, RpcMessageRow } from "@/data";

/** Merge pages (each newest first, pages newest to oldest) into one newest-first list without duplicates. */
export function flattenPages(pages: RpcMessageRow[][]): RpcMessageRow[] {
  const seen = new Set<string>();
  const out: RpcMessageRow[] = [];
  for (const page of pages) {
    for (const row of page) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

/**
 * Whether the landing spot is still unknown and older history must be loaded first:
 * the read marker is not in the loaded rows yet (or nothing was ever read) and more pages exist.
 * Capped so a never-read chat with huge history does not load everything.
 */
export function shouldLoadMoreForLanding(input: {
  loaded: RpcMessageRow[];
  lastReadMessageId: string | null;
  hasMore: boolean;
  pagesLoaded: number;
  maxPages?: number;
}): boolean {
  const { loaded, lastReadMessageId, hasMore, pagesLoaded, maxPages = 10 } = input;
  if (!hasMore || pagesLoaded >= maxPages) return false;
  if (lastReadMessageId === null) return true;
  return !loaded.some((m) => m.id === lastReadMessageId);
}

export type Tick = { glyph: string; read: boolean; labelKey: `mobile.chats.status.${OutboundDelivery}` };

/** Visual tick for an outgoing message's delivery state. */
export function tickFor(status: OutboundDelivery): Tick {
  switch (status) {
    case "pending":
      return { glyph: "\u23F2", read: false, labelKey: "mobile.chats.status.pending" };
    case "failed":
      return { glyph: "!", read: false, labelKey: "mobile.chats.status.failed" };
    case "sent":
      return { glyph: "\u2713", read: false, labelKey: "mobile.chats.status.sent" };
    case "delivered":
      return { glyph: "\u2713\u2713", read: false, labelKey: "mobile.chats.status.delivered" };
    case "read":
      return { glyph: "\u2713\u2713", read: true, labelKey: "mobile.chats.status.read" };
  }
}
