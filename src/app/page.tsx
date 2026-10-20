import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { PublicFrame } from "./_public/PublicFrame";
import styles from "./_public/public.module.css";
import ui from "@/shell/styles/ui.module.css";

type Feature = { title: string; body: string };
type DemoMessage = { side: "in" | "out"; text: string; time: string };
type Demo = { name: string; handle: string; status: string; messages: DemoMessage[]; typing: string };

const featureIcons: ReactNode[] = [
  <path key="at" d="M16 12a4 4 0 1 0 0 .01M16 8v5a2 2 0 0 0 4 0v-1a8 8 0 1 0-3.2 6.4" />,
  <path key="chats" d="M5 6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3V8a2 2 0 0 1 2-2Zm16 4h-1m1 0a2 2 0 0 1 2 2v9l-3-2h-6a2 2 0 0 1-2-2v-1" />,
  <path key="shield" d="M14 4 6 7v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V7l-8-3Zm-3.5 10 2.5 2.5 4.5-5" />,
];

function ReadTicks() {
  return (
    <svg className={styles.ticks} viewBox="0 0 18 12" aria-hidden="true" focusable="false">
      <path d="m1 6.5 3 3L10 3m-2.5 5.5 1 1L15 3" />
    </svg>
  );
}

export default async function HomePage() {
  const t = await getTranslations("shell");
  const features = t.raw("landing.features") as Feature[];
  const demo = t.raw("landing.demo") as Demo;

  return (
    <PublicFrame wide>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot} aria-hidden="true" />
            {t("landing.eyebrow")}
          </p>
          <h1 className={styles.heroTitle}>{t("landing.headline")}</h1>
          <p className={styles.heroText}>{t("landing.proposition")}</p>
          <div className={styles.actions}>
            <Link className={`${ui.btn} ${ui.btnPrimary} ${styles.bigBtn}`} href="/signup">
              {t("landing.signup")}
            </Link>
            <Link className={`${ui.btn} ${ui.btnSecondary} ${styles.bigBtn}`} href="/login">
              {t("landing.login")}
            </Link>
          </div>
          <p className={styles.trust}>{t("landing.trust")}</p>
        </div>

        <figure className={styles.demo} aria-label={t("landing.demoLabel")}>
          <div className={styles.demoHeader}>
            <span className={styles.demoAvatar} aria-hidden="true">
              {demo.name.charAt(0)}
              <span className={styles.demoOnline} />
            </span>
            <span className={styles.demoWho}>
              <strong>{demo.name}</strong>
              <span>{demo.status}</span>
            </span>
            <span className={styles.demoHandle} dir="ltr">
              {demo.handle}
            </span>
          </div>
          <ol className={styles.demoBody}>
            {demo.messages.map((message, index) => (
              <li
                key={index}
                className={`${styles.bubble} ${message.side === "out" ? styles.bubbleOut : styles.bubbleIn}`}
                style={{ animationDelay: `${150 + index * 350}ms` }}
              >
                <span>{message.text}</span>
                <span className={styles.bubbleMeta}>
                  <span dir="ltr">{message.time}</span>
                  {message.side === "out" ? <ReadTicks /> : null}
                </span>
              </li>
            ))}
            <li className={`${styles.bubble} ${styles.bubbleIn} ${styles.typing}`}>
              <span className="sr-only">{demo.typing}</span>
              <span className={styles.typingDots} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </li>
          </ol>
        </figure>
      </section>

      <section aria-labelledby="landing-features" className={styles.featuresSection}>
        <h2 id="landing-features" className={styles.sectionTitle}>
          {t("landing.featuresTitle")}
        </h2>
        <ul className={styles.features}>
          {features.map((feature, index) => (
            <li key={feature.title} className={styles.feature}>
              <span className={styles.featureIcon} aria-hidden="true">
                <svg viewBox="0 0 28 28" focusable="false">
                  {featureIcons[index % featureIcons.length]}
                </svg>
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.ctaBand}>
        <div>
          <h2>{t("landing.ctaTitle")}</h2>
          <p>{t("landing.ctaBody")}</p>
        </div>
        <Link className={`${ui.btn} ${styles.ctaBandBtn} ${styles.bigBtn}`} href="/signup">
          {t("landing.ctaButton")}
        </Link>
      </section>
    </PublicFrame>
  );
}
