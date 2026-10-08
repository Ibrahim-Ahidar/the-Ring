"use client";

import { memo, useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

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

export const PrivacySettingsView = memo(function PrivacySettingsView() {
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
      <h1 className={styles.title}>{t("pageTitle")}</h1>

      {privacyError ? (
        <p className={styles.errorBanner} role="alert">
          {t(privacyErrorKey(privacyError))}
        </p>
      ) : null}

      <section className={styles.section} aria-labelledby="discovery-heading">
        <h2 id="discovery-heading" className={styles.sectionTitle}>
          {t("sections.discovery")}
        </h2>
        <ToggleControl
          label={t("settings.discoverable")}
          checked={privacy.discoverable}
          disabled={savingField === "discoverable"}
          onChange={(value) => onToggle("discoverable", value)}
        />
        <label className={styles.row} htmlFor="profile-visibility">
          <span className={styles.rowLabel}>{t("settings.profileVisibility")}</span>
          <select
            id="profile-visibility"
            className={styles.select}
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

      <section className={styles.section} aria-labelledby="presence-heading">
        <h2 id="presence-heading" className={styles.sectionTitle}>
          {t("sections.presence")}
        </h2>
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

      <section className={styles.section} aria-labelledby="messaging-heading">
        <h2 id="messaging-heading" className={styles.sectionTitle}>
          {t("sections.messaging")}
        </h2>
        <label className={styles.row} htmlFor="who-can-message">
          <span className={styles.rowLabel}>{t("settings.whoCanMessage")}</span>
          <select
            id="who-can-message"
            className={styles.select}
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

      <section className={styles.section} aria-labelledby="groups-heading">
        <h2 id="groups-heading" className={styles.sectionTitle}>
          {t("sections.groups")}
        </h2>
        <label className={styles.row} htmlFor="who-can-add">
          <span className={styles.rowLabel}>{t("settings.whoCanAddToGroups")}</span>
          <select
            id="who-can-add"
            className={styles.select}
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
