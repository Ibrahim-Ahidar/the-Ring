"use client";

import { useTranslations } from "next-intl";

import type { LoginReason } from "@/platform/login-redirect";

import styles from "../identity.module.css";

function LoginReasonBannerInner({ reason }: { reason: LoginReason }) {
  const t = useTranslations("identity");
  const key = reason.replace(/^identity\./, "") as "session_revoked";

  return (
    <p className={styles.reasonBanner} role="status">
      {t(`reasons.${key}`)}
    </p>
  );
}

export const LoginReasonBanner = LoginReasonBannerInner;
