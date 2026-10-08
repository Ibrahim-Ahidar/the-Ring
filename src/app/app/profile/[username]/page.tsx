import { notFound } from "next/navigation";

import { ProfileView } from "@/features/discovery-contacts/components/ProfileView";
import { getProfile } from "@/features/discovery-contacts/service";
import { BlockUserButton } from "@/features/safety/components/BlockUserButton";
import { ReportUserButton } from "@/features/safety/components/ReportUserButton";
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

  const profile = result.value;
  const newChatHref = `/app/chats/new?username=${encodeURIComponent(profile.username)}`;
  const isSelf = profile.id === session.userId;

  return (
    <>
      <ProfileView profile={profile} signedIn newChatHref={newChatHref} />
      {isSelf ? null : (
        <div style={{ display: "flex", gap: 12, padding: 16 }}>
          <BlockUserButton
            userId={profile.id}
            username={profile.username}
            displayName={profile.displayName}
          />
          <ReportUserButton
            userId={profile.id}
            subjectLabel={profile.displayName ?? profile.username}
          />
        </div>
      )}
    </>
  );
}
