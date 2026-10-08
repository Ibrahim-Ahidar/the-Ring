import { searchByUsername } from "@/features/discovery-contacts/service";
import {
  encodeMessageCursor,
  type MessageCursor,
} from "@/platform/pagination";
import { validateUsername } from "@/platform/username";
import { callRpc, type RpcClient } from "@/platform/rpc";
import { ok, type Result } from "@/platform/result";

import type {
  ConversationSearchHit,
  MessageSearchHit,
  SearchConversationPage,
  SearchGlobalPage,
} from "./types";

type DbConversationHit = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  peer_username: string | null;
};

type DbMessageHit = {
  message_id: string;
  conversation_id: string;
  conversation_title?: string | null;
  snippet: string;
  match_start: number;
  created_at: string;
};

type SearchGlobalRow = {
  conversations: DbConversationHit[];
  messages: DbMessageHit[];
  has_more_messages: boolean;
};

type SearchConversationRow = {
  messages: DbMessageHit[];
  has_more_messages: boolean;
};

function mapConversation(row: DbConversationHit): ConversationSearchHit {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    peerUsername: row.peer_username,
  };
}

function mapMessage(row: DbMessageHit): MessageSearchHit {
  const hit: MessageSearchHit = {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    snippet: row.snippet,
    matchStart: row.match_start,
    createdAt: row.created_at,
  };
  if (row.conversation_title !== undefined) {
    hit.conversationTitle = row.conversation_title;
  }
  return hit;
}

function nextCursorFromMessages(messages: MessageSearchHit[]): string | null {
  const last = messages.at(-1);
  if (!last) {
    return null;
  }
  const cursor: MessageCursor = {
    createdAt: last.createdAt,
    id: last.messageId,
  };
  return encodeMessageCursor(cursor);
}

export async function searchGlobal(
  rpc: RpcClient,
  input: { query: string; cursor?: string | null },
): Promise<Result<SearchGlobalPage>> {
  const trimmed = input.query.trim();

  const historyResult = await callRpc<SearchGlobalRow>(rpc, "search_global", {
    p_query: trimmed,
    p_cursor: input.cursor ?? null,
  });
  if (!historyResult.ok) {
    return historyResult;
  }

  const row = historyResult.value;
  const conversations = (row.conversations ?? []).map(mapConversation);
  const messages = (row.messages ?? []).map(mapMessage);
  const messagesHasMore = Boolean(row.has_more_messages);
  const nextMessageCursor = messagesHasMore
    ? nextCursorFromMessages(messages)
    : null;

  let person = null;
  if (validateUsername(trimmed).ok) {
    const personResult = await searchByUsername(rpc, trimmed);
    if (!personResult.ok) {
      return personResult;
    }
    person = personResult.value;
  }

  return ok({
    person,
    conversations,
    messages,
    messagesHasMore,
    nextMessageCursor,
  });
}

export async function searchConversation(
  rpc: RpcClient,
  input: {
    conversationId: string;
    query: string;
    cursor?: string | null;
  },
): Promise<Result<SearchConversationPage>> {
  const trimmed = input.query.trim();
  const result = await callRpc<SearchConversationRow>(rpc, "search_conversation", {
    p_conversation_id: input.conversationId,
    p_query: trimmed,
    p_cursor: input.cursor ?? null,
  });
  if (!result.ok) {
    return result;
  }

  const messages = (result.value.messages ?? []).map(mapMessage);
  const hasMore = Boolean(result.value.has_more_messages);
  return ok({
    messages,
    hasMore,
    nextCursor: hasMore ? nextCursorFromMessages(messages) : null,
  });
}
