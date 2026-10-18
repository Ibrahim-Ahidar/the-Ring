"use client";

import { memo, useState } from "react";
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
  const [failed, setFailed] = useState(false);

  return (
    <>
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
              <span
                className={styles.accentSwatch}
                data-accent-swatch={code}
                aria-hidden
              >
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
                    setFailed(false);
                    const root = document.documentElement;
                    const previous = root.getAttribute("data-accent");
                    root.setAttribute("data-accent", code);
                    saveAccent(code, () => {
                      setFailed(true);
                      if (previous) {
                        root.setAttribute("data-accent", previous);
                      } else {
                        root.removeAttribute("data-accent");
                      }
                    });
                  }}
                />
                <span className={ui.radio} data-checked={checked} aria-hidden />
                {t(ACCENT_LABEL_KEYS[code])}
              </span>
            </label>
          );
        })}
      </div>
      {failed ? (
        <span className={ui.errorText} role="alert">
          {t("saveError")}
        </span>
      ) : null}
    </>
  );
}

export const AccentOptionList = memo(AccentOptionListInner);
