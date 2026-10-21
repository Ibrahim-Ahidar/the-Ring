import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { NewGroupForm } from "@/features/groups/components/NewGroupForm";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("groupsNew");

export default async function NewGroupPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("groups");

  return (
    <SinglePane title={t("newTitle")} backHref="/app/groups">
      <NewGroupForm />
    </SinglePane>
  );
}
