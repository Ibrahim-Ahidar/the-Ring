import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { MessageRequestsInbox } from "@/features/message-requests/components/MessageRequestsInbox";
import { MessageRequestsProvider } from "@/features/message-requests/context/MessageRequestsProvider";
import {
  countPendingIncoming,
  listIncoming,
  listOutgoing,
} from "@/features/message-requests/service";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";

export default async function MessageRequestsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("message-requests");

  const [incoming, outgoing, pending] = await Promise.all([
    listIncoming(session.rpc),
    listOutgoing(session.rpc),
    countPendingIncoming(session.rpc),
  ]);

  return (
    <SinglePane title={t("pageTitle")}>
      <MessageRequestsProvider
        initialIncoming={incoming.ok ? incoming.value : []}
        initialOutgoing={outgoing.ok ? outgoing.value : []}
        initialPendingCount={pending.ok ? pending.value : 0}
      >
        <MessageRequestsInbox />
      </MessageRequestsProvider>
    </SinglePane>
  );
}
