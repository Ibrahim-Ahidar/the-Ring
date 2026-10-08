import { RouteFrame } from "@/shell/components/RouteFrame";

type PageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function MediaPage({ params }: PageProps) {
  const { conversationId } = await params;
  return <RouteFrame titleKey="media" meta={conversationId} />;
}
