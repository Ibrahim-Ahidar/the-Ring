import { notFound } from "next/navigation";

import { SharedMediaBrowser } from "@/features/media/components/SharedMediaBrowser";
import { listShared } from "@/features/media/service";
import { getSessionContext } from "@/platform/session";
import { RouteFrame } from "@/shell/components/RouteFrame";

type PageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function MediaPage({ params, searchParams }: PageProps) {
  const { conversationId } = await params;
  const query = await searchParams;
  const session = await getSessionContext();
  if (!session) {
    notFound();
  }

  const tab =
    query.tab === "files" || query.tab === "links" ? query.tab : "media";

  const probe = await listShared(session.rpc, {
    conversationId,
    tab,
  });
  if (!probe.ok) {
    notFound();
  }

  return (
    <>
      <RouteFrame titleKey="media" meta={conversationId} />
      <SharedMediaBrowser conversationId={conversationId} initialTab={tab} />
    </>
  );
}
