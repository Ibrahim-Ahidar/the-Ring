import { RouteFrame } from "@/shell/components/RouteFrame";

type PageProps = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupPage({ params }: PageProps) {
  const { groupId } = await params;
  return <RouteFrame titleKey="group" meta={groupId} />;
}
