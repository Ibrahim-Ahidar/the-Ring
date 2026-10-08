import { notFound } from "next/navigation";

import { ProfileView } from "@/features/discovery-contacts/components/ProfileView";
import { getProfile } from "@/features/discovery-contacts/service";
import { asRpcClient } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

type PageProps = {
  params: Promise<{ username: string }>;
};

export default async function PublicUsernamePage({ params }: PageProps) {
  const { username } = await params;
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    notFound();
  }

  const result = await getProfile(asRpcClient(supabase), username);
  if (!result.ok) {
    notFound();
  }

  return <ProfileView profile={result.value} signedIn={false} newChatHref="" />;
}
