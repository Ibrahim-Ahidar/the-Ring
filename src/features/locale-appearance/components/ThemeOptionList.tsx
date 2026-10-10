"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import { usePreferenceSave } from "@/features/locale-appearance/hooks/use-preference-save";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import { THEMES, type Theme } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

const THEME_LABEL_KEYS: Record<
  Theme,
  "themeSystem" | "themeLight" | "themeDark"
> = {
  system: "themeSystem",
  light: "themeLight",
  dark: "themeDark",
};

function ThemeOptionListInner() {
  const t = useTranslations("locale-appearance");
  const {
    state: { theme },
  } = useAppearance();
  const { saveTheme, pending } = usePreferenceSave();

  return (
    <div
      className={styles.themeCards}
      role="radiogroup"
      aria-label={t("settingsAppearanceTitle")}
    >
      {THEMES.map((code) => {
        const checked = theme === code;
        return (
          <label
            key={code}
            className={styles.themeCard}
            data-checked={checked}
            htmlFor={`theme-${code}`}
          >
            <span className={styles.themePreview} data-theme-preview={code} aria-hidden>
              <span />
              <span />
            </span>
            <span className={styles.themeLabel}>
              <input
                id={`theme-${code}`}
                className="sr-only"
                type="radio"
                name="theme"
                value={code}
                checked={checked}
                disabled={pending}
                onChange={() => saveTheme(code)}
              />
              <span className={ui.radio} data-checked={checked} aria-hidden />
              {t(THEME_LABEL_KEYS[code])}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export const ThemeOptionList = memo(ThemeOptionListInner);
