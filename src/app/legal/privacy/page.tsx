import { getTranslations } from "next-intl/server";

export default async function PrivacyPage() {
  const t = await getTranslations("shell");

  return (
    <main className="landing" style={{ minHeight: "auto" }}>
      <h1 className="landing-title">{t("routes.privacy")}</h1>
      <p>{t("legal.privacyBody")}</p>
    </main>
  );
}
