import Link from "next/link";
import { getTranslations } from "next-intl/server";

import ar from "@/shell/messages/ar.json";
import en from "@/shell/messages/en.json";
import fr from "@/shell/messages/fr.json";

const locales = [
  { code: "ar", label: "العربية", copy: ar.landing },
  { code: "en", label: "English", copy: en.landing },
  { code: "fr", label: "Français", copy: fr.landing },
] as const;

export default async function HomePage() {
  const t = await getTranslations("shell");

  return (
    <div className="landing">
      <header className="landing-header">
        <h1 className="landing-title">{t("landing.title")}</h1>
        <p>{t("landing.proposition")}</p>
      </header>

      <div className="landing-actions">
        <Link className="primary" href="/login">
          {t("landing.login")}
        </Link>
        <Link className="secondary" href="/signup">
          {t("landing.signup")}
        </Link>
      </div>

      {locales.map(({ code, label, copy }) => (
        <section
          key={code}
          className="landing-locale-block"
          lang={code}
          dir={code === "ar" ? "rtl" : "ltr"}
        >
          <h2>{label}</h2>
          <p>{copy.proposition}</p>
        </section>
      ))}

      <footer className="landing-footer">
        <Link href="/legal/terms">{t("routes.terms")}</Link>
        <Link href="/legal/privacy">{t("routes.privacy")}</Link>
      </footer>
    </div>
  );
}
