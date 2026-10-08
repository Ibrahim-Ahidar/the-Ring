import { redirect } from "next/navigation";

import { ChatsApp } from "@/features/direct-messaging/components/ChatsApp";
import {
  inboxFiltersToListArgs,
  parseInboxFilters,
} from "@/features/direct-messaging/lib/inbox-filters";
import {
  getConversation,
  listConversations,
  listMessages,
  mapMessageRow,
} from "@/features/direct-messaging/service";
import { getSessionContext } from "@/platform/session";

type PageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ archived?: string; folder?: string; message?: string }>;
};

export default async function ConversationPage({ params, searchParams }: PageProps) {
  const { conversationId } = await params;
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const query = await searchParams;
  const inboxFilters = parseInboxFilters(query);
  const listArgs = inboxFiltersToListArgs(inboxFilters);

  const [list, detailResult, messagesResult] = await Promise.all([
    listConversations(session.rpc, listArgs),
    getConversation(session.rpc, { conversationId }),
    listMessages(session.rpc, { conversationId }),
  ]);

  if (!detailResult.ok) {
    redirect("/app/chats");
  }

  const messages = messagesResult.ok
    ? messagesResult.value.items.map(mapMessageRow)
    : [];
  const messagesHasMore = messagesResult.ok ? messagesResult.value.hasMore : false;

  return (
    <ChatsApp
      userId={session.userId}
      initialConversations={list.ok ? list.value.items : []}
      initialConversationsHasMore={list.ok ? list.value.hasMore : false}
      inboxFilters={inboxFilters}
      activeConversationId={conversationId}
      initialDetail={detailResult.value}
      initialMessages={messages}
      initialMessagesHasMore={messagesHasMore}
    />
  );
}
