"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import { usePreferenceSave } from "@/features/locale-appearance/hooks/use-preference-save";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import { THEMES, type Theme } from "@/shell/locale";

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
    <ul className={styles.optionList}>
      {THEMES.map((code) => (
        <li key={code} className={styles.optionRow}>
          <label className={styles.optionLabel} htmlFor={`theme-${code}`}>
            {t(THEME_LABEL_KEYS[code])}
          </label>
          <input
            id={`theme-${code}`}
            type="radio"
            name="theme"
            value={code}
            checked={theme === code}
            disabled={pending}
            onChange={() => saveTheme(code)}
          />
        </li>
      ))}
    </ul>
  );
}

export const ThemeOptionList = memo(ThemeOptionListInner);
