import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LegalPage } from "../../_public/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("routes.privacy"), description: t("legal.privacy.intro") };
}

// TODO(owner): add the legal entity name, effective date and a contact address to the privacy copy before launch.
export default function PrivacyPage() {
  return <LegalPage kind="privacy" />;
}
