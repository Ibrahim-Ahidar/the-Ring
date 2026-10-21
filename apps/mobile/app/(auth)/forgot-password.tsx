import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { accountErrorKey } from "@/account/errors";
import { requestPasswordReset, resetPasswordWithCode } from "@/data";

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
    <SafeAreaView style={styles.screen}>
      <View style={styles.form}>
        <Text style={styles.title}>{t("mobile.account.resetTitle")}</Text>
        {codeSent ? (
          <>
            <Text>{t("mobile.account.codeSentTo", { email: email.trim() })}</Text>
            <TextInput
              style={styles.input}
              value={code}
              onChangeText={setCode}
              placeholder={t("mobile.account.code")}
              accessibilityLabel={t("mobile.account.code")}
              keyboardType="number-pad"
              maxLength={6}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t("mobile.account.newPassword")}
              accessibilityLabel={t("mobile.account.newPassword")}
              autoCapitalize="none"
              secureTextEntry
              textContentType="newPassword"
            />
            <Text style={styles.hint}>{t("mobile.account.passwordHint")}</Text>
          </>
        ) : (
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t("mobile.login.email")}
            accessibilityLabel={t("mobile.login.email")}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
        )}
        {errorCode ? (
          <Text style={styles.error} accessibilityRole="alert">
            {t(accountErrorKey(errorCode, t.has))}
          </Text>
        ) : null}
        <Pressable style={[styles.button, busy && styles.busy]} onPress={() => void submit()} disabled={busy} accessibilityRole="button">
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{codeSent ? t("mobile.account.resetSubmit") : t("mobile.account.sendCode")}</Text>
          )}
        </Pressable>
        <Pressable onPress={() => router.replace("/login")} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.account.backToLogin")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  form: { gap: 12 },
  title: { fontSize: 28, fontWeight: "600", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#999", borderRadius: 8, padding: 12, fontSize: 16 },
  hint: { color: "#666" },
  error: { color: "#b00020" },
  link: { color: "#4f46e5", fontSize: 16 },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  busy: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
