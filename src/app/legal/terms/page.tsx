import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LegalPage } from "../../_public/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  return { title: t("routes.terms"), description: t("legal.terms.intro") };
}

// TODO(owner): add the legal entity name, effective date and a contact address to the terms copy before launch.
export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
