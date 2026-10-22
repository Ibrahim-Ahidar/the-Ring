import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { signOut } from "@/data";
import { AppHeader, Banner, ListRow, Screen, useTheme } from "@/ui";

/** Web /app/settings/security, phone subset: sign out of this device. */
export default function SecurityScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
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
    <Screen edges={["start", "end", "bottom"]} background="panel">
      <AppHeader title={t("routes.settingsSecurity")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {failed ? <Banner kind="error" message={t("mobile.logout.error")} /> : null}
      <View style={{ padding: spacing.s8 }}>
        <ListRow icon={LogOut} title={t("mobile.logout.submit")} destructive onPress={() => void logout()} />
      </View>
    </Screen>
  );
}
