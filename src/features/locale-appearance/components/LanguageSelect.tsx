"use client";

import { memo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { saveLocaleAction } from "@/features/locale-appearance/actions";
import { AUTONYMS } from "@/features/locale-appearance/autonyms";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import { LOCALES } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

/** Compact language picker for pages outside the app shell (login, signup). */
function LanguageSelectInner() {
  const t = useTranslations("locale-appearance");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className={styles.languageSelect}>
      {failed ? (
        <span className={ui.errorText} role="alert">
          {t("saveError")}
        </span>
      ) : null}
      <select
        className={styles.select}
        aria-label={t("settingsLanguageTitle")}
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            const result = await saveLocaleAction(next);
            setFailed(!result.ok);
            if (result.ok) {
              router.refresh();
            }
          });
        }}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {AUTONYMS[code]}
          </option>
        ))}
      </select>
    </div>
  );
}

export const LanguageSelect = memo(LanguageSelectInner);
