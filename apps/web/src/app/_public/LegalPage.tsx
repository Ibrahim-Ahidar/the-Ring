import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { PublicFrame } from "./PublicFrame";
import styles from "./public.module.css";

type Section = { title: string; body: string };

/** Renders the terms or privacy copy from the shell catalog. */
export async function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const t = await getTranslations("shell");
  const sections = t.raw(`legal.${kind}.sections`) as Section[];

  return (
    <PublicFrame>
      <Link className={styles.back} href="/">
        {t("public.back")}
      </Link>
      <article className={styles.doc}>
        <h1>{t(`routes.${kind}`)}</h1>
        <p>{t(`legal.${kind}.intro`)}</p>
        {sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </article>
    </PublicFrame>
  );
}
