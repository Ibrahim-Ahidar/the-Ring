import { redirect } from "next/navigation";

import { ChatsApp } from "@/features/direct-messaging/components/ChatsApp";
import {
  inboxFiltersToListArgs,
  parseInboxFilters,
} from "@/features/direct-messaging/lib/inbox-filters";
import { listConversations } from "@/features/direct-messaging/service";
import { getSessionContext } from "@/platform/session";

type PageProps = {
  searchParams: Promise<{ archived?: string; folder?: string }>;
};

export default async function ChatsPage({ searchParams }: PageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const inboxFilters = parseInboxFilters(params);
  const list = await listConversations(
    session.rpc,
    inboxFiltersToListArgs(inboxFilters),
  );
  const conversations = list.ok ? list.value.items : [];
  const hasMore = list.ok ? list.value.hasMore : false;

  return (
    <ChatsApp
      userId={session.userId}
      initialConversations={conversations}
      initialConversationsHasMore={hasMore}
      inboxFilters={inboxFilters}
    />
  );
}
