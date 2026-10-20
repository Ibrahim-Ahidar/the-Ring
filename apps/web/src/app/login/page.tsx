import { getTranslations } from "next-intl/server";

import { AuthFrame } from "@/features/identity/components/AuthFrame";
import { LoginForm } from "@/features/identity/components/LoginForm";
import { LoginReasonBanner } from "@/features/identity/components/LoginReasonBanner";
import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";
import { parseLoginReason, safeNextPath } from "@/platform/login-redirect";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("login");

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const t = await getTranslations("identity");
  const params = await searchParams;
  const reason = parseLoginReason(first(params.reason));
  const next = safeNextPath(first(params.next), "/app");

  return (
    <AuthFrame
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      topEnd={<LanguageSelect />}
    >
      {reason ? <LoginReasonBanner reason={reason} /> : null}
      <LoginForm next={next} />
    </AuthFrame>
  );
}
