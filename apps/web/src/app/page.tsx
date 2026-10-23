import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PublicFrame } from "./_public/PublicFrame";
import styles from "./_public/public.module.css";
import ui from "@/shell/styles/ui.module.css";

type Feature = { title: string; body: string };
type DemoMessage = { side: "in" | "out"; text: string; time: string };
type Demo = { name: string; status: string; messages: DemoMessage[] };

export default async function HomePage() {
  const t = await getTranslations("shell");
  const features = t.raw("landing.features") as Feature[];
  const demo = t.raw("landing.demo") as Demo;

  return (
    <PublicFrame wide>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>{t("landing.headline")}</h1>
          <p className={styles.heroText}>{t("landing.proposition")}</p>
          <div className={styles.actions}>
            <Link className={`${ui.btn} ${ui.btnPrimary}`} href="/signup">
              {t("landing.signup")}
            </Link>
            <Link className={`${ui.btn} ${ui.btnSecondary}`} href="/login">
              {t("landing.login")}
            </Link>
          </div>
          <p className={styles.downloadLabel}>{t("landing.downloadTitle")}</p>
          <div className={styles.actions}>
            <a className={`${ui.btn} ${ui.btnSecondary}`} href="/download/desktop">
              {t("landing.downloadDesktop")}
            </a>
            <a className={`${ui.btn} ${ui.btnSecondary}`} href="/download/android">
              {t("landing.downloadMobile")}
            </a>
          </div>
        </div>

        <figure className={styles.demo} aria-label={t("landing.demoLabel")}>
          <div className={styles.demoHeader}>
            <span className={styles.demoAvatar} aria-hidden="true">
              {demo.name.charAt(0)}
            </span>
            <span className={styles.demoWho}>
              <strong>{demo.name}</strong>
              <span>{demo.status}</span>
            </span>
          </div>
          <ol className={styles.demoBody}>
            {demo.messages.map((message, index) => (
              <li
                key={index}
                className={`${styles.bubble} ${message.side === "out" ? styles.bubbleOut : styles.bubbleIn}`}
              >
                <span>{message.text}</span>
                <span className={styles.bubbleMeta} dir="ltr">
                  {message.time}
                </span>
              </li>
            ))}
          </ol>
        </figure>
      </section>

      <section aria-labelledby="landing-features" className={styles.featuresSection}>
        <h2 id="landing-features" className={styles.sectionTitle}>
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
