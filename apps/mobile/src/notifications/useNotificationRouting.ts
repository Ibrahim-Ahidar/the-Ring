import { useEffect } from "react";
import type * as NotificationsTypes from "expo-notifications";
import { useRouter } from "expo-router";

import { loadNotifications } from "./optional";

function conversationIdOf(
  response: NotificationsTypes.NotificationResponse | null,
): string | null {
  const data = response?.notification.request.content.data as
    | { conversationId?: unknown }
    | undefined;
  return typeof data?.conversationId === "string" ? data.conversationId : null;
}

/** Opens the chat when a push notification is tapped (running or cold start). */
export function useNotificationRouting(): void {
  const router = useRouter();

  useEffect(() => {
    const Notifications = loadNotifications();
    if (!Notifications) return;
    let handled: string | null = null;
    const open = (response: NotificationsTypes.NotificationResponse | null) => {
      const id = conversationIdOf(response);
      const key = response?.notification.request.identifier ?? null;
      if (!id || key === handled) return;
      handled = key;
      router.push(`/chats/${id}`);
    };

    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);
}
