import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import type { LocalStore, SearchSnippetPart } from "@pulse/core/local-store";

import { getLocalStore } from "@/platform/local-store";

export const MIN_QUERY_LENGTH = 2;
export const SEARCH_PAGE_SIZE = 20;

export type MessageSearchInput = {
  query: string;
  /** In-conversation search. Omit for global search. */
  conversationId?: string;
  offset?: number;
};

export type MessageSearchResult = {
  messageId: string;
  conversationId: string;
  sentAt: string;
  snippet: SearchSnippetPart[];
};

export type MessageSearchPage = {
  results: MessageSearchResult[];
  /** Offset for the next page, or null when this was the last one. */
  nextOffset: number | null;
};

export type MessageSearchDeps = {
  isE2ee: () => boolean;
  getStore: () => Promise<LocalStore | null>;
  /** The server message search. Used only with the e2ee flag off. */
  remote: (input: MessageSearchInput) => Promise<MessageSearchPage>;
};

export function createMessageSearch(deps: MessageSearchDeps) {
  return async function searchMessages(input: MessageSearchInput): Promise<MessageSearchPage> {
    const query = input.query.trim();
    if (query.length < MIN_QUERY_LENGTH) return { results: [], nextOffset: null };
    if (!deps.isE2ee()) return deps.remote({ ...input, query });

    // Flag on: the server never sees the query. Without a local DB there is nothing to search.
    const store = await deps.getStore();
    if (!store) return { results: [], nextOffset: null };
    const offset = input.offset ?? 0;
    const hits = await store.searchMessages({
      query,
      conversationId: input.conversationId,
      limit: SEARCH_PAGE_SIZE + 1,
      offset,
    });
    const page = hits.slice(0, SEARCH_PAGE_SIZE);
    return {
      results: page.map((h) => ({
        messageId: h.message.id,
        conversationId: h.message.conversation_id,
        sentAt: h.message.sent_at,
        snippet: h.snippet,
      })),
      nextOffset: hits.length > SEARCH_PAGE_SIZE ? offset + SEARCH_PAGE_SIZE : null,
    };
  };
}

/** Message search wired to the real flag and local DB. The caller supplies the server fallback. */
export function searchMessages(
  input: MessageSearchInput,
  remote: MessageSearchDeps["remote"],
): Promise<MessageSearchPage> {
  return createMessageSearch({ isE2ee: isE2eeEnabled, getStore: getLocalStore, remote })(input);
}
