"use client";

import { memo, useEffect } from "react";

import { useMessaging } from "@/features/direct-messaging/context/MessagingProvider";

import {
  onMessageActionDialog,
  type JumpToReplyRequest,
} from "../message-actions-events";

function scrollToMessage(messageId: string): boolean {
  const node = document.querySelector(`[data-message-id="${messageId}"]`);
  if (node instanceof HTMLElement) {
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    return true;
  }
  return false;
}

function JumpToReplyBridgeInner() {
  const { loadOlderMessages, state } = useMessaging();

  useEffect(() => {
    return onMessageActionDialog((request) => {
      if (!("replyToId" in request)) {
        return;
      }
      const { conversationId, replyToId } = request as JumpToReplyRequest;

      void (async () => {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (scrollToMessage(replyToId)) {
            return;
          }
          const hasMore = state.messagesHasMore[conversationId];
          const loaded = (state.messagesByConversation[conversationId] ?? []).some(
            (item) => item.id === replyToId,
          );
          if (loaded || !hasMore) {
            break;
          }
          await loadOlderMessages(conversationId);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        scrollToMessage(replyToId);
      })();
    });
  }, [loadOlderMessages, state.messagesByConversation, state.messagesHasMore]);

  return null;
}

export const JumpToReplyBridge = memo(JumpToReplyBridgeInner);
