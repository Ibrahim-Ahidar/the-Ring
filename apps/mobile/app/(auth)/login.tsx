import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { signInWithPassword } from "@/data";

export default function LoginScreen() {
  const t = useTranslations();
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.form}>
        <Text style={styles.title}>{t("mobile.login.title")}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder={t("mobile.login.email")}
          accessibilityLabel={t("mobile.login.email")}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={t("mobile.login.password")}
          accessibilityLabel={t("mobile.login.password")}
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          textContentType="password"
          onSubmitEditing={submit}
        />
        {errorKey ? (
          <Text style={styles.error} accessibilityRole="alert">
            {t(errorKey)}
          </Text>
        ) : null}
        <Pressable
          style={[styles.button, busy && styles.buttonBusy]}
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t("mobile.login.submit")}</Text>}
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
  error: { color: "#b00020" },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
