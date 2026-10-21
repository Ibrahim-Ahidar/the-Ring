import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

import { joinConversation, type TopicHandle } from "@/platform/realtime-hub";
import type { MessageReaction } from "@pulse/core/timeline";

import {
  createInitialReactionsState,
  reactionsReducer,
  type ReactionsAction,
  type ReactionsState,
} from "./reactions-reducer";

type ConversationEntry = {
  state: ReactionsState;
  listeners: Set<() => void>;
  refs: number;
  handle: TopicHandle | null;
  changeUnsub: (() => void) | null;
};

const conversations = new Map<string, ConversationEntry>();

function getEntry(conversationId: string): ConversationEntry {
  let entry = conversations.get(conversationId);
  if (!entry) {
    entry = {
      state: createInitialReactionsState(),
      listeners: new Set(),
      refs: 0,
      handle: null,
      changeUnsub: null,
    };
    conversations.set(conversationId, entry);
  }
  return entry;
}

function emit(entry: ConversationEntry): void {
  entry.listeners.forEach((listener) => listener());
}

function dispatch(conversationId: string, action: ReactionsAction): void {
  const entry = getEntry(conversationId);
  entry.state = reactionsReducer(entry.state, action);
  emit(entry);
}

function rowFromChange(record: Record<string, unknown>): MessageReaction | null {
  const messageId = record.message_id;
  const userId = record.user_id;
  const emoji = record.emoji;
  const createdAt = record.created_at;
  if (
    typeof messageId !== "string" ||
    typeof userId !== "string" ||
    typeof emoji !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }
  return {
    message_id: messageId,
    user_id: userId,
    emoji,
    created_at: createdAt,
  };
}

function ensureRealtime(
  conversationId: string,
  supabase: SupabaseClient,
  userId: string,
): void {
  const entry = getEntry(conversationId);
  if (entry.handle) {
    return;
  }
  const handle = joinConversation(supabase, conversationId, userId);
  entry.changeUnsub = handle.onChange((change) => {
    if (change.table !== "message_reactions") {
      return;
    }
    if (change.eventType === "DELETE") {
      const old = rowFromChange(change.old);
      if (!old) {
        return;
      }
      dispatch(conversationId, {
        type: "optimistic_remove",
        messageId: old.message_id,
        userId: old.user_id,
        emoji: old.emoji,
      });
      return;
    }
    const reaction = rowFromChange(change.new);
    if (!reaction) {
      return;
    }
    dispatch(conversationId, { type: "apply_server", reactions: [reaction] });
  });
  entry.handle = handle;
}

export function retainConversationReactions(
  conversationId: string,
  supabase: SupabaseClient,
  userId: string,
  messageId: string,
  seed: MessageReaction[] | undefined,
): () => void {
  const entry = getEntry(conversationId);
  entry.refs += 1;
  ensureRealtime(conversationId, supabase, userId);
  if (seed && seed.length > 0) {
    dispatch(conversationId, { type: "seed", messageId, reactions: seed });
  }
  return () => {
    entry.refs -= 1;
    if (entry.refs <= 0) {
      entry.changeUnsub?.();
      entry.changeUnsub = null;
      entry.handle?.leave();
      entry.handle = null;
      conversations.delete(conversationId);
    }
  };
}

export function getConversationReactionsState(
  conversationId: string,
): ReactionsState {
  return getEntry(conversationId).state;
}

export function subscribeConversationReactions(
  conversationId: string,
  listener: () => void,
): () => void {
  const entry = getEntry(conversationId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

const NO_REACTIONS: MessageReaction[] = [];

export function useMessageReactions(
  conversationId: string,
  messageId: string,
): MessageReaction[] {
  return useSyncExternalStore(
    (listener) => subscribeConversationReactions(conversationId, listener),
    () => getConversationReactionsState(conversationId).byMessage[messageId] ?? NO_REACTIONS,
    () => NO_REACTIONS,
  );
}

export function dispatchConversationReaction(
  conversationId: string,
  action: ReactionsAction,
): void {
  dispatch(conversationId, action);
}
