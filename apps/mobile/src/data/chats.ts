import {
  MESSAGE_PAGE_SIZE,
  getConversation,
  listConversations,
  listMessages,
  markDelivered,
  markRead,
  messagePageNextCursor,
  conversationPageNextCursor,
  sendText,
  err,
  randomUUID,
  ok,
  type ConversationDetail,
  type ConversationSummary,
  type MarkReadResult,
  type Result,
  type RpcMessageRow,
  type TimelineMessage,
} from "@pulse/core";

import { supabase } from "./client";
import { rpcClient } from "./rpc";

export type ChatPage<T> = { items: T[]; hasMore: boolean; nextCursor: string | null };

/** One page of the chat list; pass the previous page's nextCursor to continue. */
export async function listChats(cursor: string | null): Promise<Result<ChatPage<ConversationSummary>>> {
  const result = await listConversations(rpcClient, { cursor });
  if (!result.ok) return result;
  const { items, hasMore } = result.value;
  return ok({ items, hasMore, nextCursor: hasMore ? conversationPageNextCursor(items) : null });
}

export function getChat(conversationId: string): Promise<Result<ConversationDetail>> {
  return getConversation(rpcClient, { conversationId });
}

/** One page of messages, newest first. Pass the previous nextCursor to page backwards. */
export async function listChatMessages(
  conversationId: string,
  cursor: string | null,
): Promise<Result<ChatPage<RpcMessageRow>>> {
  const result = await listMessages(rpcClient, { conversationId, cursor, limit: MESSAGE_PAGE_SIZE });
  if (!result.ok) return result;
  const { items, hasMore } = result.value;
  return ok({ items, hasMore, nextCursor: hasMore ? messagePageNextCursor(items) : null });
}

export function sendChatText(input: {
  conversationId: string;
  clientId: string;
  body: string;
  replyToId?: string | null;
}): Promise<Result<TimelineMessage>> {
  const body = input.body.trim();
  if (!body) return Promise.resolve(err("messaging.empty"));
  return sendText(rpcClient, { ...input, body });
}

export function markChatRead(conversationId: string, messageId: string): Promise<Result<MarkReadResult>> {
  return markRead(rpcClient, { conversationId, messageId });
}

export function markChatDelivered(conversationId: string | null): Promise<Result<null>> {
  return markDelivered(rpcClient, { conversationId });
}

/** v4-shaped id for an outgoing message's client_id. Hermes may lack `crypto`, so fall back to Math.random (dedup key, not a secret). */
export function newClientId(): string {
  if (typeof globalThis.crypto?.getRandomValues === "function") return randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

type Unsubscribe = () => void;

function watch(
  topic: string,
  tables: { table: string; filter?: string }[],
  onChange: () => void,
): Unsubscribe {
  const channel = supabase.channel(topic, { config: { broadcast: { self: false } } });
  for (const { table, filter } of tables) {
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
      onChange,
    );
  }
  channel.subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Same topic and tables as the web inbox channel; `onChange` fires on any row change. */
export function subscribeChatList(userId: string, onChange: () => void): Unsubscribe {
  return watch(
    `inbox:${userId}`,
    [{ table: "conversation_members" }, { table: "conversations" }],
    onChange,
  );
}

/** Same topic and tables as the web conversation channel (messages, reactions, members). */
export function subscribeChat(conversationId: string, onChange: () => void): Unsubscribe {
  return watch(
    `conversation:${conversationId}`,
    [
      { table: "messages", filter: `conversation_id=eq.${conversationId}` },
      { table: "message_reactions" },
      { table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
    ],
    onChange,
  );
}
