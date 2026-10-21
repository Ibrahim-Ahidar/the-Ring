import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { accountErrorKey } from "@/account/errors";
import { AuthLink, AuthShell } from "@/auth/AuthShell";
import { requestPasswordReset, resetPasswordWithCode } from "@/data";
import { Button, TextField } from "@/ui";

export default function ForgotPasswordScreen() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErrorCode(null);
    const result = codeSent
      ? await resetPasswordWithCode({ email, token: code, password })
      : await requestPasswordReset(email);
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    // After the password is set the session is active and the auth gate opens the app.
    if (!codeSent) setCodeSent(true);
  }

  return (
    <AuthShell
      title={t("mobile.account.resetTitle")}
      subtitle={codeSent ? t("mobile.account.codeSentTo", { email: email.trim() }) : undefined}
      error={errorCode ? t(accountErrorKey(errorCode, t.has)) : null}
      footer={<AuthLink label={t("mobile.account.backToLogin")} onPress={() => router.replace("/login")} />}
    >
      {codeSent ? (
        <>
          <TextField
            label={t("mobile.account.code")}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          <TextField
            label={t("mobile.account.newPassword")}
            hint={t("mobile.account.passwordHint")}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secure
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <Button title={t("mobile.account.resetSubmit")} onPress={() => void submit()} loading={busy} block />
        </>
      ) : (
        <>
          <TextField
            label={t("mobile.login.email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <Button title={t("mobile.account.sendCode")} onPress={() => void submit()} loading={busy} block />
        </>
      )}
    </AuthShell>
  );
}
