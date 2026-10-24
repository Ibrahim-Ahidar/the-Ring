"use client";

import { useTranslations } from "next-intl";

import type { BackupFailure } from "../service";

export function useBackupErrorText() {
  const t = useTranslations("backup");
  return (code: BackupFailure) => t(`error.${code}`);
}
