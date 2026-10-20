"use client";

import { useCallback } from "react";

import type { MessageReaction } from "@pulse/core/timeline";

import { addReactionAction, removeReactionAction } from "../actions";
import { dispatchConversationReaction } from "../context/conversation-reactions-store";

export function useToggleReaction(input: {
  conversationId: string;
  messageId: string;
  userId: string;
}): (emoji: string, reactedByMe: boolean) => Promise<void> {
  const { conversationId, messageId, userId } = input;

  return useCallback(
    async (emoji: string, reactedByMe: boolean) => {
      const optimistic: MessageReaction = {
        message_id: messageId,
        user_id: userId,
        emoji,
        created_at: new Date().toISOString(),
      };

      if (reactedByMe) {
        dispatchConversationReaction(conversationId, {
          type: "optimistic_remove",
          messageId,
          userId,
          emoji,
        });
        const result = await removeReactionAction({ messageId, emoji });
        if (!result.ok) {
          dispatchConversationReaction(conversationId, {
            type: "rollback_remove",
            reaction: optimistic,
          });
        }
        return;
      }

      dispatchConversationReaction(conversationId, {
        type: "optimistic_add",
        reaction: optimistic,
      });
      const result = await addReactionAction({ messageId, emoji });
      if (!result.ok) {
        dispatchConversationReaction(conversationId, {
          type: "rollback_add",
          messageId,
          userId,
          emoji,
        });
        return;
      }
      dispatchConversationReaction(conversationId, {
        type: "apply_server",
        reactions: [result.value],
      });
    },
    [conversationId, messageId, userId],
  );
}
