import { useRouter } from "expo-router";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { AuthLink, AuthShell } from "@/auth/AuthShell";
import { signInWithPassword } from "@/data";
import { Button, TextField } from "@/ui";

export default function LoginScreen() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setErrorKey("mobile.login.errors.required");
      return;
    }
    setBusy(true);
    setErrorKey(null);
    const result = await signInWithPassword(email.trim(), password);
    setBusy(false);
    // On success the auth gate redirects to the (app) group.
    if (!result.ok) setErrorKey(result.error.code);
  }

  return (
    <AuthShell
      title={t("mobile.login.title")}
      error={errorKey ? t(errorKey) : null}
      footer={
        <>
          <AuthLink label={t("mobile.account.forgot")} onPress={() => router.push("/forgot-password")} />
          <AuthLink label={t("mobile.account.createAccount")} onPress={() => router.push("/signup")} />
        </>
      }
    >
      <TextField
        label={t("mobile.login.email")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label={t("mobile.login.password")}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        secure
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button title={t("mobile.login.submit")} onPress={() => void submit()} loading={busy} block />
    </AuthShell>
  );
}
