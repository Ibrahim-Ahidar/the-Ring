import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { RequestsView } from "@/features/message-requests/components/RequestsView";
import { listIncoming, listOutgoing } from "@/features/message-requests/service";
import { getSessionContext } from "@/platform/session";
import { LoadFailed } from "@/shell/components/LoadFailed";
import { SinglePane } from "@/shell/components/SinglePane";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("chatsRequests");

export default async function RequestsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("message-requests");
  const [incoming, outgoing] = await Promise.all([
    listIncoming(session.rpc),
    listOutgoing(session.rpc),
  ]);

  return (
    <SinglePane title={t("title")}>
      {incoming.ok && outgoing.ok ? (
        <RequestsView incoming={incoming.value} outgoing={outgoing.value} />
      ) : (
        <LoadFailed />
      )}
    </SinglePane>
  );
}
