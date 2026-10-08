import { redirect } from "next/navigation";

import { ChatsApp } from "@/features/direct-messaging/components/ChatsApp";
import { listConversations } from "@/features/direct-messaging/service";
import { getSessionContext } from "@/platform/session";

export default async function ChatsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const list = await listConversations(session.rpc, {});
  const conversations = list.ok ? list.value.items : [];
  const hasMore = list.ok ? list.value.hasMore : false;

  return (
    <ChatsApp
      userId={session.userId}
      initialConversations={conversations}
      initialConversationsHasMore={hasMore}
    />
  );
}
