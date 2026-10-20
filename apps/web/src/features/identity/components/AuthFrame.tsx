import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import styles from "@/features/identity/identity.module.css";
import { BrandMark } from "@/shell/components/BrandMark";

type Props = {
  title: string;
  subtitle: string;
  /** Rendered in the top bar; the route supplies it so this module stays feature-local. */
  topEnd?: ReactNode;
  children: ReactNode;
};

/** Login / signup page frame: brand bar, two-column card with art, legal footer. */
export async function AuthFrame({ title, subtitle, topEnd, children }: Props) {
  const t = await getTranslations("identity");
  const shell = await getTranslations("shell");

  return (
    <div className={styles.auth}>
      <header className={styles.authTop}>
        <Link className={styles.brand} href="/">
          <BrandMark size={28} />
          <span>{shell("landing.title")}</span>
        </Link>
        {topEnd}
      </header>

      <main className={styles.authMain}>
        <div className={styles.authCard}>
          <div className={styles.authForm}>
            <div>
              <h1 className={styles.authTitle}>{title}</h1>
              <p className={styles.authSubtitle}>{subtitle}</p>
            </div>
            {children}
          </div>
          <div className={styles.authArt} aria-hidden="true">
            <BrandMark size={180} className={styles.authRing} />
            <p className={styles.authQuote}>{shell("landing.proposition")}</p>
          </div>
        </div>
      </main>

      <footer className={styles.authLegal}>
        {t.rich("legalNotice", {
          terms: (chunks) => <Link href="/legal/terms">{chunks}</Link>,
          privacy: (chunks) => <Link href="/legal/privacy">{chunks}</Link>,
        })}
      </footer>
    </div>
  );
}
