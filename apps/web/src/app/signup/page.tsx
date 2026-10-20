import { getTranslations } from "next-intl/server";

import { AuthFrame } from "@/features/identity/components/AuthFrame";
import { SignupForm } from "@/features/identity/components/SignupForm";
import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("signup");

export default async function SignupPage() {
  const t = await getTranslations("identity");

  return (
    <AuthFrame
      title={t("signupTitle")}
      subtitle={t("signupSubtitle")}
      topEnd={<LanguageSelect />}
    >
      <SignupForm />
    </AuthFrame>
  );
}
