import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { accountErrorKey } from "@/account/errors";
import { AuthLink, AuthShell } from "@/auth/AuthShell";
import { resendSignupCode, signUpWithPassword, verifySignupCode } from "@/data";
import { Button, TextField } from "@/ui";

export default function SignupScreen() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setErrorCode(null);
    setInfo(null);
    const result = codeSent
      ? await verifySignupCode(email, code)
      : await signUpWithPassword({ email, password, username });
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.error.code);
      return;
    }
    // After the code is accepted the auth gate opens the app.
    if (!codeSent) setCodeSent(true);
  }

  async function resend() {
    setErrorCode(null);
    const result = await resendSignupCode(email);
    if (result.ok) setInfo(t("mobile.account.codeResent"));
    else setErrorCode(result.error.code);
  }

  return (
    <AuthShell
      title={t("mobile.account.signupTitle")}
      subtitle={codeSent ? t("mobile.account.codeSentTo", { email: email.trim() }) : undefined}
      error={errorCode ? t(accountErrorKey(errorCode, t.has)) : null}
      info={info}
      footer={<AuthLink label={t("mobile.account.haveAccount")} onPress={() => router.replace("/login")} />}
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
          <Button title={t("mobile.account.verify")} onPress={() => void submit()} loading={busy} block />
          <Button title={t("mobile.account.resend")} variant="ghost" onPress={() => void resend()} block />
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
            returnKeyType="next"
          />
          <TextField
            label={t("mobile.account.username")}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="next"
          />
          <TextField
            label={t("mobile.login.password")}
            hint={t("mobile.account.passwordHint")}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secure
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          <Button title={t("mobile.account.signupSubmit")} onPress={() => void submit()} loading={busy} block />
        </>
      )}
    </AuthShell>
  );
}
