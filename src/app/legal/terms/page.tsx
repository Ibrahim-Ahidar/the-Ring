import { getTranslations } from "next-intl/server";

export default async function TermsPage() {
  const t = await getTranslations("shell");

  return (
    <main className="landing" style={{ minHeight: "auto" }}>
      <h1 className="landing-title">{t("routes.terms")}</h1>
      <p>{t("legal.termsBody")}</p>
    </main>
  );
}
