import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { GroupAdminClient } from "@/features/groups/components/GroupAdminClient";
import { getGroup } from "@/features/groups/service";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";

type PageProps = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupPage({ params }: PageProps) {
  const { groupId } = await params;
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const groupResult = await getGroup(session.rpc, groupId);
  if (!groupResult.ok) {
    redirect("/app/groups");
  }

  const t = await getTranslations("groups");

  return (
    <SinglePane title={t("adminTitle")} backHref="/app/groups">
      <GroupAdminClient group={groupResult.value} currentUserId={session.userId} />
    </SinglePane>
  );
}
