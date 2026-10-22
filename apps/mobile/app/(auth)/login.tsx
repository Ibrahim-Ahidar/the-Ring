import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { accountErrorKey } from "@/account/errors";
import { AuthLink, AuthShell } from "@/auth/AuthShell";
import { resendSignupCode, signInWithPassword, verifySignupCode } from "@/data";
import { Button, Text, TextField, useTheme } from "@/ui";

export default function LoginScreen() {
  const t = useTranslations();
  const id = useTranslations("mobile.identity");
  const router = useRouter();
  const { spacing } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const errorText = (key: string) =>
    key.startsWith("mobile.")
      ? t(key)
      : t.has(`mobile.identity.errors.${key}`)
        ? t(`mobile.identity.errors.${key}`)
        : t(accountErrorKey(key, t.has));

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
    if (!result.ok) {
      // Like the web LoginForm, an unconfirmed account goes to the code step, which sends a fresh code.
      if (result.error.code === "mobile.login.errors.emailNotConfirmed") {
        setConfirming(true);
        void resend();
        return;
      }
      setErrorKey(result.error.code);
    }
  }

  async function resend() {
    setErrorKey(null);
    const result = await resendSignupCode(email.trim());
    if (result.ok) setInfo(t("mobile.account.codeResent"));
    else setErrorKey(result.error.code);
  }

  async function verify() {
    setBusy(true);
    setErrorKey(null);
    setInfo(null);
    const result = await verifySignupCode(email.trim(), code);
    setBusy(false);
    // After the code is accepted the auth gate opens the app.
    if (!result.ok) setErrorKey(result.error.code);
  }

  if (confirming) {
    return (
      <AuthShell
        title={id("loginTitle")}
        subtitle={`${t("mobile.login.errors.emailNotConfirmed")} ${t("mobile.account.codeSentTo", { email: email.trim() })}`}
        error={errorKey ? errorText(errorKey) : null}
        info={info}
        footer={
          <AuthLink
            label={t("mobile.chats.back")}
            onPress={() => {
              setConfirming(false);
              setErrorKey(null);
              setInfo(null);
              setCode("");
            }}
          />
        }
      >
        <TextField
          label={t("mobile.account.code")}
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          maxLength={6}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
        />
        <Button title={t("mobile.account.verify")} onPress={() => void verify()} loading={busy} block />
        <Button title={t("mobile.account.resend")} variant="ghost" onPress={() => void resend()} block />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={id("loginTitle")}
      subtitle={id("loginSubtitle")}
      error={errorKey ? errorText(errorKey) : null}
      footer={
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s4 }}>
          <Text tone="textMuted">{id("noAccount")}</Text>
          <AuthLink label={id("signupLink")} onPress={() => router.push("/signup")} />
        </View>
      }
    >
      <TextField
        label={id("emailLabel")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label={id("passwordLabel")}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoComplete="current-password"
        secure
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <View style={{ alignItems: "flex-end" }}>
        <AuthLink
          label={id("forgotPasswordLink")}
          onPress={() =>
            router.push(email.trim() ? { pathname: "/forgot-password", params: { email: email.trim() } } : "/forgot-password")
          }
        />
      </View>
      <Button
        title={busy ? id("submittingLogin") : id("submitLogin")}
        onPress={() => void submit()}
        loading={busy}
        block
      />
    </AuthShell>
  );
}
