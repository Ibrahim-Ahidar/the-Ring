"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import { usePreferenceSave } from "@/features/locale-appearance/hooks/use-preference-save";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import { LOCALES, THEMES, type Locale, type Theme } from "@/shell/locale";

function QuickPreferencesBarInner() {
  const t = useTranslations("locale-appearance");
  const {
    state: { locale, theme },
  } = useAppearance();
  const { saveLocale, saveTheme, pending } = usePreferenceSave();

  return (
    <div className={styles.quickBar} data-testid="quick-preferences">
      <div className={styles.quickGroup} role="group" aria-label={t("quickLanguage")}>
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={styles.segmentButton}
            data-active={locale === code ? "true" : "false"}
            disabled={pending}
            aria-pressed={locale === code}
            onClick={() => saveLocale(code as Locale)}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
      <div className={styles.quickGroup} role="group" aria-label={t("quickTheme")}>
        {THEMES.map((code) => (
          <button
            key={code}
            type="button"
            className={styles.segmentButton}
            data-active={theme === code ? "true" : "false"}
            disabled={pending}
            aria-pressed={theme === code}
            onClick={() => saveTheme(code as Theme)}
          >
            {t(
              code === "system"
                ? "themeSystem"
                : code === "light"
                  ? "themeLight"
                  : "themeDark",
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export const QuickPreferencesBar = memo(QuickPreferencesBarInner);
