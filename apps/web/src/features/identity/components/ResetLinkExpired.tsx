import Link from "next/link";
import { getTranslations } from "next-intl/server";

import ui from "@/shell/styles/ui.module.css";
import styles from "../identity.module.css";

/** Shown on /reset-password without a session: the code or link expired or was already used. */
export async function ResetLinkExpired() {
  const t = await getTranslations("identity");

  return (
    <div className={styles.authFormBody}>
      <div className={styles.authNotice} role="alert">
        <h2 className={styles.authNoticeTitle}>{t("resetExpiredTitle")}</h2>
        <p>{t("resetExpiredBody")}</p>
      </div>
      <Link className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`} href="/forgot-password">
        {t("requestNewCode")}
      </Link>
      <p className={styles.authSwitch}>
        <Link href="/login">{t("backToLogin")}</Link>
      </p>
    </div>
  );
}
