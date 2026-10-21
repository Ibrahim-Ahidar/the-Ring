import { getTranslations } from "next-intl/server";

import { AuthFrame } from "@/features/identity/components/AuthFrame";
import { ForgotPasswordForm } from "@/features/identity/components/ForgotPasswordForm";
import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";

type PageProps = {
  searchParams: Promise<{ email?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: PageProps) {
  const t = await getTranslations("identity");
  const { email } = await searchParams;

  return (
    <AuthFrame
      title={t("forgotPasswordTitle")}
      subtitle={t("forgotPasswordSubtitle")}
      topEnd={<LanguageSelect />}
    >
      <ForgotPasswordForm initialEmail={typeof email === "string" ? email : ""} />
    </AuthFrame>
  );
}
