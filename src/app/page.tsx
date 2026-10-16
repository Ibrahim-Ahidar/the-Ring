import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { BrandMark } from "@/shell/components/BrandMark";

import { PublicFrame } from "./_public/PublicFrame";
import styles from "./_public/public.module.css";
import ui from "@/shell/styles/ui.module.css";

type Feature = { title: string; body: string };

export default async function HomePage() {
  const t = await getTranslations("shell");
  const features = t.raw("landing.features") as Feature[];

  return (
    <PublicFrame>
      <section className={styles.hero}>
        <BrandMark size={72} className={styles.heroMark} />
        <h1 className={styles.heroTitle}>{t("landing.title")}</h1>
        <p className={styles.heroText}>{t("landing.proposition")}</p>
        <div className={styles.actions}>
          <Link className={`${ui.btn} ${ui.btnPrimary}`} href="/login">
            {t("landing.login")}
          </Link>
          <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/signup">
            {t("landing.signup")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="landing-features">
        <h2 id="landing-features" className="sr-only">
          {t("landing.featuresTitle")}
        </h2>
        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature.title} className={styles.feature}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </PublicFrame>
  );
}
