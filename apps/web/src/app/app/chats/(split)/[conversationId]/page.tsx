import { redirect } from "next/navigation";

import { ThreadSeed } from "@/features/direct-messaging/components/StreamSeeders";
import { getConversation } from "@/features/direct-messaging/service";
import { readPageLimit } from "@/features/direct-messaging/page-limit-server";
import { streamThread } from "@/features/direct-messaging/streamed";
import { getSessionContext } from "@/platform/session";
import { NotFoundScreen } from "@/shell/components/NotFoundScreen";

type PageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  // The messages stream in behind the page; only the conversation row is
  // awaited, for the not-found state and the thread header. The shell shows a
  // conversation already in the store without waiting for either.
  const thread = streamThread(session.rpc, conversationId, await readPageLimit());
  const detailResult = await getConversation(session.rpc, { conversationId });

  if (!detailResult.ok) {
    // Unknown id or no access: say so instead of silently bouncing to the list.
    return <NotFoundScreen variant="conversation" />;
  }

  return (
    <ThreadSeed
      conversationId={conversationId}
      detail={detailResult.value}
      thread={thread}
    />
  );
}
