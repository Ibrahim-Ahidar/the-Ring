import { notFound } from "next/navigation";

import { ProfileView } from "@/features/discovery-contacts/components/ProfileView";
import { getProfile } from "@/features/discovery-contacts/service";
import { getSessionContext } from "@/platform/session";

type PageProps = {
  params: Promise<{ username: string }>;
};

export default async function ProfilePage({ params }: PageProps) {
  const { username } = await params;
  const session = await getSessionContext();

  if (!session) {
    notFound();
  }

  const result = await getProfile(session.rpc, username);
  if (!result.ok) {
    notFound();
  }

  const newChatHref = `/app/chats/new?username=${encodeURIComponent(result.value.username)}`;

  return (
    <ProfileView
      profile={result.value}
      signedIn
      newChatHref={newChatHref}
    />
  );
}
