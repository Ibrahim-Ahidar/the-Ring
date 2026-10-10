import { getTranslations } from "next-intl/server";

import { AuthFrame } from "@/features/identity/components/AuthFrame";
import { ResetLinkExpired } from "@/features/identity/components/ResetLinkExpired";
import { ResetPasswordForm } from "@/features/identity/components/ResetPasswordForm";
import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";
import { getSessionContext } from "@/platform/session";

export const dynamic = "force-dynamic";

/** Reached after a recovery code (or the email link fallback) signs the member in. */
export default async function ResetPasswordPage() {
  const t = await getTranslations("identity");
  const session = await getSessionContext();

  return (
    <AuthFrame
      title={t("resetPasswordTitle")}
      subtitle={t("resetPasswordSubtitle")}
      topEnd={<LanguageSelect />}
    >
      {session ? <ResetPasswordForm /> : <ResetLinkExpired />}
    </AuthFrame>
  );
}
