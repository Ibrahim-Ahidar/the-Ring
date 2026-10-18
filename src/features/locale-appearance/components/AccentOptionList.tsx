"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import { usePreferenceSave } from "@/features/locale-appearance/hooks/use-preference-save";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import { ACCENTS, type Accent } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

const ACCENT_LABEL_KEYS: Record<Accent, "accentIndigo" | "accentGreen"> = {
  indigo: "accentIndigo",
  green: "accentGreen",
};

function AccentOptionListInner() {
  const t = useTranslations("locale-appearance");
  const {
    state: { accent },
  } = useAppearance();
  const { saveAccent, pending } = usePreferenceSave();

  return (
    <div
      className={styles.themeCards}
      role="radiogroup"
      aria-label={t("accentTitle")}
    >
      {ACCENTS.map((code) => {
        const checked = accent === code;
        return (
          <label
            key={code}
            className={styles.themeCard}
            data-checked={checked}
            htmlFor={`accent-${code}`}
          >
            <span className={styles.accentSwatch} data-accent-swatch={code} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <span className={styles.themeLabel}>
              <input
                id={`accent-${code}`}
                className="sr-only"
                type="radio"
                name="accent"
                value={code}
                checked={checked}
                disabled={pending}
                onChange={() => {
                  // Apply instantly; the server render confirms it after the save.
                  document.documentElement.setAttribute("data-accent", code);
                  saveAccent(code);
                }}
              />
              <span className={ui.radio} data-checked={checked} aria-hidden />
              {t(ACCENT_LABEL_KEYS[code])}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export const AccentOptionList = memo(AccentOptionListInner);
