"use client";

import { memo, useCallback, useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useSafety } from "../context/safety-context";
import { privacyErrorKey } from "../error-message";
import type {
  PrivacyFieldKey,
  PrivacyPatch,
  ProfileVisibility,
  WhoCanAddToGroups,
  WhoCanMessage,
} from "../types";
import { ToggleControl } from "./ToggleControl";
import styles from "./PrivacySettings.module.css";
import { BlockedMembersSection } from "./BlockedMembersSection";
import { MyReportsSection } from "./MyReportsSection";

type Props = {
  /** Rendered before the page heading (the settings mobile back arrow). */
  leading?: ReactNode;
};

export const PrivacySettingsView = memo(function PrivacySettingsView({ leading }: Props) {
  const t = useTranslations("safety");
  const locale = useLocale();
  const { state, savePrivacyField } = useSafety();
  const { privacy, privacyError, savingField } = state;

  const dir = locale === "ar" ? "rtl" : "ltr";

  const onToggle = useCallback(
    (field: PrivacyFieldKey, value: boolean) => {
      void savePrivacyField(field, { [field]: value } as PrivacyPatch);
    },
    [savePrivacyField],
  );

  const visibilityOptions = useMemo(
    (): ProfileVisibility[] => ["public", "contacts", "private"],
    [],
  );
  const messageOptions = useMemo((): WhoCanMessage[] => ["everyone", "requests", "nobody"], []);
  const groupOptions = useMemo((): WhoCanAddToGroups[] => ["everyone", "contacts", "nobody"], []);

  return (
    <div className={styles.page} dir={dir}>
      <div className={ui.settingsTitleRow}>
        {leading}
        <h1 className={ui.pageTitle}>{t("pageTitle")}</h1>
      </div>

      {privacyError ? (
        <p className={styles.errorBanner} role="alert">
          {t(privacyErrorKey(privacyError))}
        </p>
      ) : null}

      <section className={ui.settingsCard} aria-labelledby="discovery-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="discovery-heading" className={ui.settingsCardTitle}>
            {t("sections.discovery")}
          </h2>
        </div>
        <ToggleControl
          label={t("settings.discoverable")}
          checked={privacy.discoverable}
          disabled={savingField === "discoverable"}
          onChange={(value) => onToggle("discoverable", value)}
        />
        <label className={ui.setting} htmlFor="profile-visibility">
          <span className={ui.settingBody}>{t("settings.profileVisibility")}</span>
          <select
            id="profile-visibility"
            className={`${ui.input} ${styles.select}`}
            value={privacy.profileVisibility}
            disabled={savingField === "profileVisibility"}
            onChange={(event) =>
              void savePrivacyField("profileVisibility", {
                profileVisibility: event.target.value as ProfileVisibility,
              })
            }
          >
            {visibilityOptions.map((value) => (
              <option key={value} value={value}>
                {t(`options.profileVisibility.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={ui.settingsCard} aria-labelledby="presence-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="presence-heading" className={ui.settingsCardTitle}>
            {t("sections.presence")}
          </h2>
        </div>
        <ToggleControl
          label={t("settings.showOnline")}
          checked={privacy.showOnline}
          disabled={savingField === "showOnline"}
          onChange={(value) => onToggle("showOnline", value)}
        />
        <ToggleControl
          label={t("settings.showLastSeen")}
          checked={privacy.showLastSeen}
          disabled={savingField === "showLastSeen"}
          onChange={(value) => onToggle("showLastSeen", value)}
        />
        <ToggleControl
          label={t("settings.sendReadReceipts")}
          checked={privacy.sendReadReceipts}
          disabled={savingField === "sendReadReceipts"}
          onChange={(value) => onToggle("sendReadReceipts", value)}
        />
      </section>

      <section className={ui.settingsCard} aria-labelledby="messaging-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="messaging-heading" className={ui.settingsCardTitle}>
            {t("sections.messaging")}
          </h2>
        </div>
        <label className={ui.setting} htmlFor="who-can-message">
          <span className={ui.settingBody}>{t("settings.whoCanMessage")}</span>
          <select
            id="who-can-message"
            className={`${ui.input} ${styles.select}`}
            value={privacy.whoCanMessage}
            disabled={savingField === "whoCanMessage"}
            onChange={(event) =>
              void savePrivacyField("whoCanMessage", {
                whoCanMessage: event.target.value as WhoCanMessage,
              })
            }
          >
            {messageOptions.map((value) => (
              <option key={value} value={value}>
                {t(`options.whoCanMessage.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={ui.settingsCard} aria-labelledby="groups-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="groups-heading" className={ui.settingsCardTitle}>
            {t("sections.groups")}
          </h2>
        </div>
        <label className={ui.setting} htmlFor="who-can-add">
          <span className={ui.settingBody}>{t("settings.whoCanAddToGroups")}</span>
          <select
            id="who-can-add"
            className={`${ui.input} ${styles.select}`}
            value={privacy.whoCanAddToGroups}
            disabled={savingField === "whoCanAddToGroups"}
            onChange={(event) =>
              void savePrivacyField("whoCanAddToGroups", {
                whoCanAddToGroups: event.target.value as WhoCanAddToGroups,
              })
            }
          >
            {groupOptions.map((value) => (
              <option key={value} value={value}>
                {t(`options.whoCanAddToGroups.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <BlockedMembersSection />
      <MyReportsSection />
    </div>
  );
});
