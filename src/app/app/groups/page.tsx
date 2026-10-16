import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";

import { listConversations } from "@/features/direct-messaging/service";
import { GroupsPageView } from "@/features/groups/components/GroupsPageView";
import { getSessionContext } from "@/platform/session";
import { LoadFailed } from "@/shell/components/LoadFailed";
import { SinglePane } from "@/shell/components/SinglePane";
import ui from "@/shell/styles/ui.module.css";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("groups");

export default async function GroupsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("groups");
  const list = await listConversations(session.rpc, {});
  const groups = list.ok
    ? list.value.items.filter((item) => item.type === "group")
    : [];
  const failed = !list.ok;

  return (
    <SinglePane
      title={t("title")}
      actions={
        <Link
          className={ui.iconBtn}
          href="/app/groups/new"
          aria-label={t("createLink")}
          title={t("createLink")}
        >
          <Plus size={24} aria-hidden />
        </Link>
      }
    >
      {failed ? <LoadFailed /> : <GroupsPageView groups={groups} />}
    </SinglePane>
  );
}
