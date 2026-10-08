"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import { usePreferenceSave } from "@/features/locale-appearance/hooks/use-preference-save";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import { LOCALES, type Locale } from "@/shell/locale";

const LOCALE_LABEL_KEYS: Record<Locale, "localeAr" | "localeEn" | "localeFr"> =
  {
    ar: "localeAr",
    en: "localeEn",
    fr: "localeFr",
  };

function LocaleOptionListInner() {
  const t = useTranslations("locale-appearance");
  const {
    state: { locale },
  } = useAppearance();
  const { saveLocale, pending } = usePreferenceSave();

  return (
    <ul className={styles.optionList}>
      {LOCALES.map((code) => (
        <li key={code} className={styles.optionRow}>
          <label className={styles.optionLabel} htmlFor={`locale-${code}`}>
            {t(LOCALE_LABEL_KEYS[code])}
          </label>
          <input
            id={`locale-${code}`}
            type="radio"
            name="locale"
            value={code}
            checked={locale === code}
            disabled={pending}
            onChange={() => saveLocale(code)}
          />
        </li>
      ))}
    </ul>
  );
}

export const LocaleOptionList = memo(LocaleOptionListInner);
