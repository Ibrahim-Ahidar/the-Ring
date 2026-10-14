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

import { loadViewer } from "../../_lib/viewer";

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

  const [list, detailResult, messagesResult, viewer] = await Promise.all([
    listConversations(session.rpc, listArgs),
    getConversation(session.rpc, { conversationId }),
    listMessages(session.rpc, { conversationId }),
    loadViewer(session.rpc),
  ]);

  if (!detailResult.ok) {
    redirect("/app/chats");
  }

  if (!messagesResult.ok) {
    // Never render an empty thread for a failed read: the saved messages would
    // look lost. Let the route error boundary show a retry instead.
    console.error("[chats] list_messages failed", {
      conversationId,
      code: messagesResult.error.code,
    });
    throw new Error(`list_messages failed: ${messagesResult.error.code}`);
  }
  const messages = messagesResult.value.items.map(mapMessageRow);
  const messagesHasMore = messagesResult.value.hasMore;

  return (
    <ChatsApp
      userId={session.userId}
      viewer={viewer}
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
