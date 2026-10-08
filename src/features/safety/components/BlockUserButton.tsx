"use client";

import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { requestBlockDialog } from "../safety-events";
import styles from "./PrivacySettings.module.css";

type BlockUserButtonProps = {
  userId: string;
  username: string;
  displayName?: string | null;
};

export const BlockUserButton = memo(function BlockUserButton({
  userId,
  username,
  displayName = null,
}: BlockUserButtonProps) {
  const t = useTranslations("safety");

  const open = useCallback(() => {
    requestBlockDialog({ userId, username, displayName });
  }, [displayName, userId, username]);

  return (
    <button
      type="button"
      className={`${styles.button} ${styles.buttonDanger}`}
      onClick={open}
    >
      {t("block.action")}
    </button>
  );
});
