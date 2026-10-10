import { getTranslations } from "next-intl/server";

import { AuthFrame } from "@/features/identity/components/AuthFrame";
import { LoginForm } from "@/features/identity/components/LoginForm";
import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";

export default async function LoginPage() {
  const t = await getTranslations("identity");

  return (
    <AuthFrame
      title={t("loginTitle")}
      subtitle={t("loginSubtitle")}
      topEnd={<LanguageSelect />}
    >
      <LoginForm />
    </AuthFrame>
  );
}
