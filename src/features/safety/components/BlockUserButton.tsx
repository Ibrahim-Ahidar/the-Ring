"use client";

import { useCallback } from "react";
import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { requestBlockDialog } from "../safety-events";
import styles from "./PrivacySettings.module.css";

type BlockUserButtonProps = {
  userId: string;
  username: string;
  displayName?: string | null;
};

export function BlockUserButton({
  userId,
  username,
  displayName = null,
}: BlockUserButtonProps) {
  const t = useTranslations("safety");

  const open = useCallback(() => {
    requestBlockDialog({ userId, username, displayName });
  }, [displayName, userId, username]);

  return (
    <button type="button" className={`${ui.setting} ${styles.dangerRow}`} onClick={open}>
      <Ban size={20} aria-hidden />
      <span className={ui.settingBody}>{t("block.action")}</span>
    </button>
  );
}
