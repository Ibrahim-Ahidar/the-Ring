import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { AuthLink, AuthShell } from "@/auth/AuthShell";
import { signInWithPassword } from "@/data";
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
      title={id("loginTitle")}
      subtitle={id("loginSubtitle")}
      error={errorKey ? t(errorKey) : null}
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
