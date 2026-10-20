"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import { AUTONYMS } from "@/features/locale-appearance/autonyms";
import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import { usePreferenceSave } from "@/features/locale-appearance/hooks/use-preference-save";
import { LOCALES, type Locale } from "@/shell/locale";
import ui from "@/shell/styles/ui.module.css";

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
    <div role="radiogroup" aria-label={t("settingsLanguageTitle")}>
      {LOCALES.map((code) => {
        const checked = locale === code;
        const translated = t(LOCALE_LABEL_KEYS[code]);
        return (
          <label key={code} className={ui.setting} htmlFor={`locale-${code}`}>
            <input
              id={`locale-${code}`}
              className="sr-only"
              type="radio"
              name="locale"
              value={code}
              checked={checked}
              disabled={pending}
              onChange={() => saveLocale(code)}
            />
            <span className={ui.radio} data-checked={checked} aria-hidden />
            <span className={ui.settingBody}>
              <span lang={code}>{AUTONYMS[code]}</span>
              {translated !== AUTONYMS[code] ? (
                <span className={ui.settingDesc}>{translated}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export const LocaleOptionList = memo(LocaleOptionListInner);
