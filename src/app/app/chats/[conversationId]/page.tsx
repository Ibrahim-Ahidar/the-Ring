import { redirect } from "next/navigation";

import { ChatsApp } from "@/features/direct-messaging/components/ChatsApp";
import {
  inboxFiltersToListArgs,
  parseInboxFilters,
} from "@/features/direct-messaging/lib/inbox-filters";
import { getConversation } from "@/features/direct-messaging/service";
import { streamInbox, streamThread } from "@/features/direct-messaging/streamed";
import { getSessionContext } from "@/platform/session";
import { NotFoundScreen } from "@/shell/components/NotFoundScreen";

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

  // The list and messages stream in behind the page frame; only the
  // conversation row is awaited, for the not-found state and the thread header.
  const inbox = streamInbox(session.rpc, listArgs);
  const thread = streamThread(session.rpc, conversationId);
  const [detailResult, viewer] = await Promise.all([
    getConversation(session.rpc, { conversationId }),
    loadViewer(session.rpc),
  ]);

  if (!detailResult.ok) {
    // Unknown id or no access: say so instead of silently bouncing to the list.
    return <NotFoundScreen variant="conversation" />;
  }

  return (
    <ChatsApp
      userId={session.userId}
      viewer={viewer}
      inbox={inbox}
      inboxFilters={inboxFilters}
      activeConversationId={conversationId}
      initialDetail={detailResult.value}
      thread={thread}
    />
  );
}
