"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { useSafety } from "../context/safety-context";
import { UnblockConfirmDialog } from "./UnblockConfirmDialog";
import styles from "./PrivacySettings.module.css";

export const BlockedMembersSection = memo(function BlockedMembersSection() {
  const t = useTranslations("safety");
  const { state, confirmUnblock, refreshBlocks } = useSafety();
  const { blocks, blocksLoading, blocksError } = state;
  const [pendingUnblock, setPendingUnblock] = useState<string | null>(null);

  const handleUnblock = useCallback(async () => {
    if (!pendingUnblock) {
      return false;
    }
    return confirmUnblock(pendingUnblock);
  }, [confirmUnblock, pendingUnblock]);

  const pending = blocks.find((b) => b.blockedId === pendingUnblock);

  return (
    <section className={ui.settingsCard} aria-labelledby="blocked-heading">
      <div className={ui.settingsCardHead}>
        <h2 id="blocked-heading" className={ui.settingsCardTitle}>
          {t("block.listTitle")}
        </h2>
      </div>

      {blocksError ? (
        <p className={`${ui.errorText} ${styles.cardNote}`} role="alert">
          {t("errors.generic")}{" "}
          <button type="button" className={ui.linkBtn} onClick={() => void refreshBlocks()}>
            {t("actions.retry")}
          </button>
        </p>
      ) : null}

      {blocksLoading ? <p className={styles.cardNote}>{t("states.loading")}</p> : null}

      {!blocksLoading && blocks.length === 0 ? (
        <p className={styles.cardNote}>{t("block.empty")}</p>
      ) : null}

      {!blocksLoading && blocks.length > 0 ? (
        <ul className={styles.list}>
          {blocks.map((row) => {
            const label = row.displayName?.trim() || row.username;
            return (
              <li key={row.blockedId} className={ui.setting}>
                <Avatar name={label} seed={row.blockedId} size="sm" />
                <span className={`${ui.settingBody} bidi-auto`}>
                  {label}
                  <span className={`${ui.settingDesc} handle`}>@{row.username}</span>
                </span>
                <button
                  type="button"
                  className={`${ui.btn} ${ui.btnSm} ${ui.btnSecondary}`}
                  onClick={() => setPendingUnblock(row.blockedId)}
                >
                  {t("block.unblock")}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {pending ? (
        <UnblockConfirmDialog
          username={pending.username}
          displayName={pending.displayName}
          onConfirm={handleUnblock}
          onClose={() => setPendingUnblock(null)}
        />
      ) : null}
    </section>
  );
});
