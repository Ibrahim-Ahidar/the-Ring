import { RouteFrame } from "@/shell/components/RouteFrame";

type PageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({ params }: PageProps) {
  const { conversationId } = await params;
  return <RouteFrame titleKey="chat" meta={conversationId} />;
}
