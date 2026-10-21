import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

function conversationIdOf(
  response: Notifications.NotificationResponse | null,
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
    let handled: string | null = null;
    const open = (response: Notifications.NotificationResponse | null) => {
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
