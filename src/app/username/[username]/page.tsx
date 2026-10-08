import { RouteFrame } from "@/shell/components/RouteFrame";

type PageProps = {
  params: Promise<{ username: string }>;
};

export default async function PublicUsernamePage({ params }: PageProps) {
  const { username } = await params;
  return <RouteFrame titleKey="publicProfile" meta={username} />;
}
