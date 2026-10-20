import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { signOut } from "@/data";

export default function HomeScreen() {
  const t = useTranslations();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [failed, setFailed] = useState(false);

  async function logout() {
    setFailed(false);
    const result = await signOut();
    // Drop cached server state so the next account never sees this one's data.
    queryClient.clear();
    if (!result.ok) setFailed(true);
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.body}>
        <Text style={styles.title}>{t("mobile.home.title")}</Text>
        <Text>{t("mobile.home.signedInAs", { email: session?.email ?? session?.userId ?? "" })}</Text>
        {failed ? <Text style={styles.error}>{t("mobile.logout.error")}</Text> : null}
        <Pressable style={styles.button} onPress={logout} accessibilityRole="button">
          <Text style={styles.buttonText}>{t("mobile.logout.submit")}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  body: { gap: 12 },
  title: { fontSize: 28, fontWeight: "600" },
  error: { color: "#b00020" },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
