"use client";

import { memo, useEffect } from "react";

import { useMessaging } from "@/features/direct-messaging/context/MessagingProvider";

import { onMessageMutation } from "../message-actions-events";

function MessagingMutationBridgeInner() {
  const { refreshConversation } = useMessaging();

  useEffect(() => {
    return onMessageMutation((mutation) => {
      void refreshConversation(mutation.conversationId);
    });
  }, [refreshConversation]);

  return null;
}

export const MessagingMutationBridge = memo(MessagingMutationBridgeInner);
