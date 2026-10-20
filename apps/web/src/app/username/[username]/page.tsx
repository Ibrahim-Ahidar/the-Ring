import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ProfileView } from "@/features/discovery-contacts/components/ProfileView";
import { getProfile } from "@/features/discovery-contacts/service";
import { asRpcClient } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";
import ui from "@/shell/styles/ui.module.css";

import { PublicFrame } from "../../_public/PublicFrame";
import styles from "../../_public/public.module.css";

type PageProps = {
  params: Promise<{ username: string }>;
};

async function loadProfile(username: string) {
  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return null;
  }
  const result = await getProfile(asRpcClient(supabase), username);
  return result.ok ? result.value : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) {
    return {};
  }
  const t = await getTranslations("shell");
  const title = t("public.profileTitle", { username: profile.username });
  const description = profile.bio?.trim()
    ? profile.bio
    : t("public.profileDesc", { name: profile.displayName ?? profile.username });
  return {
    title,
    description,
    openGraph: { title, description, type: "profile", username: profile.username },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicUsernamePage({ params }: PageProps) {
  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) {
    notFound();
  }

  const t = await getTranslations("shell");
  const next = `/app/chats/new?username=${encodeURIComponent(profile.username)}`;
  const loginHref = `/login?next=${encodeURIComponent(next)}`;

  return (
    <PublicFrame>
      <ProfileView profile={profile} signedIn={false} newChatHref="" />
      <div className={styles.cta}>
        <Link className={`${ui.btn} ${ui.btnPrimary}`} href={loginHref}>
          {t("public.loginToMessage", { username: profile.username })}
        </Link>
        <Link href="/signup">{t("public.signupCta")}</Link>
      </div>
    </PublicFrame>
  );
}
