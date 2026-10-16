import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AuthFrame } from "@/features/identity/components/AuthFrame";
import { MfaVerifyForm } from "@/features/identity/components/MfaVerifyForm";
import { needsSecondFactor } from "@/features/identity/service";
import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";
import { loginPath, safeNextPath } from "@/platform/login-redirect";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("login");
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginVerifyPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next), "/app");

  const supabase = await tryCreateSupabaseServerClient();
  const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
  if (!supabase || !data.user) {
    redirect(loginPath({ reason: "signed_out" }));
  }
  // Already at AAL2 (or no factor): nothing to verify.
  if (!(await needsSecondFactor(supabase))) {
    redirect(next);
  }

  const t = await getTranslations("identity");
  return (
    <AuthFrame
      title={t("mfaVerifyTitle")}
      subtitle={t("mfaVerifySubtitle")}
      topEnd={<LanguageSelect />}
    >
      <MfaVerifyForm next={next} />
    </AuthFrame>
  );
}
