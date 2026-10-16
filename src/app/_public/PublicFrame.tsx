import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { LanguageSelect } from "@/features/locale-appearance/components/LanguageSelect";
import { BrandMark } from "@/shell/components/BrandMark";

import styles from "./public.module.css";

/** Frame for signed-out pages: brand bar, language switcher, legal footer. */
export async function PublicFrame({ children }: { children: ReactNode }) {
  const t = await getTranslations("shell");

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link className={styles.brand} href="/">
          <BrandMark size={28} />
          <span>{t("landing.title")}</span>
        </Link>
        <LanguageSelect />
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <Link href="/legal/terms">{t("routes.terms")}</Link>
        <Link href="/legal/privacy">{t("routes.privacy")}</Link>
      </footer>
    </div>
  );
}
