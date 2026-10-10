"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { resendConfirmationAction, verifySignupCodeAction } from "../actions";
import styles from "../identity.module.css";
import { CodeEntry } from "./CodeEntry";

export { CODE_LENGTH, MAX_WRONG_CODES, normalizeCode, RESEND_COOLDOWN_SECONDS } from "./CodeEntry";

type Props = {
  email: string;
  onBack: () => void;
  /** Shown above the code field, e.g. why login sent the member here. */
  intro?: string;
  /** Login reaches this screen without a fresh email, so it asks for one first. */
  resendOnMount?: boolean;
  showLoginLink?: boolean;
};

function SignupCodeEntryInner({
  email,
  onBack,
  intro,
  resendOnMount = false,
  showLoginLink = false,
}: Props) {
  const t = useTranslations("identity");
  const router = useRouter();

  const verify = useCallback(
    (token: string) => verifySignupCodeAction({ email, token }),
    [email],
  );
  const resend = useCallback(() => resendConfirmationAction(email), [email]);
  const onVerified = useCallback(() => {
    router.push("/app");
    router.refresh();
  }, [router]);

  return (
    <CodeEntry
      email={email}
      title={t("confirmEmailTitle")}
      inputId="signup-code"
      verify={verify}
      resend={resend}
      onVerified={onVerified}
      onBack={onBack}
      intro={intro}
      resendOnMount={resendOnMount}
      footer={
        showLoginLink ? (
          <p className={styles.authSwitch}>
            {t("hasAccount")} <Link href="/login">{t("loginLink")}</Link>
          </p>
        ) : null
      }
    />
  );
}

export const SignupCodeEntry = memo(SignupCodeEntryInner);
