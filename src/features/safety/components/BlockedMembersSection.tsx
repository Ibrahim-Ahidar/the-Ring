"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

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
    <section
      className={`${styles.section} ${styles.dangerZone}`}
      aria-labelledby="blocked-heading"
    >
      <h2 id="blocked-heading" className={styles.sectionTitle}>
        {t("block.listTitle")}
      </h2>

      {blocksError ? (
        <p className={styles.errorBanner} role="alert">
          {t("errors.generic")}
          <button type="button" className={styles.button} onClick={() => void refreshBlocks()}>
            {t("actions.retry")}
          </button>
        </p>
      ) : null}

      {blocksLoading ? <p className={styles.muted}>{t("states.loading")}</p> : null}

      {!blocksLoading && blocks.length === 0 ? (
        <p className={styles.muted}>{t("block.empty")}</p>
      ) : null}

      {!blocksLoading && blocks.length > 0 ? (
        <ul className={styles.list}>
          {blocks.map((row) => {
            const label = row.displayName?.trim() || row.username;
            return (
              <li key={row.blockedId} className={styles.listItem}>
                <span>{label}</span>
                <button
                  type="button"
                  className={styles.button}
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
