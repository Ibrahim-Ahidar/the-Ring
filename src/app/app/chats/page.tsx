import { redirect } from "next/navigation";

import { ChatsApp } from "@/features/direct-messaging/components/ChatsApp";
import {
  inboxFiltersToListArgs,
  parseInboxFilters,
} from "@/features/direct-messaging/lib/inbox-filters";
import { streamInbox } from "@/features/direct-messaging/streamed";
import { getSessionContext } from "@/platform/session";

import { loadViewer } from "../_lib/viewer";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("chats");

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
  // Streamed: the page frame renders now, the list fills in when it arrives.
  const inbox = streamInbox(session.rpc, inboxFiltersToListArgs(inboxFilters));
  const viewer = await loadViewer(session.rpc);

  return (
    <ChatsApp
      userId={session.userId}
      viewer={viewer}
      inbox={inbox}
      inboxFilters={inboxFilters}
    />
  );
}
