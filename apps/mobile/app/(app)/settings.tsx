import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Globe, KeyRound, Lock, LogOut, Palette, UserRound } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useTranslations } from "use-intl";

import { useMyProfile } from "@/contacts/queries";
import { avatarUrl, signOut } from "@/data";
import { usePreferences } from "@/settings/PreferencesProvider";
import { AppHeader, Avatar, Banner, ListRow, Screen, Text, useTheme } from "@/ui";

/** Mirrors the web SettingsSidebar: profile card, one row per settings page, then sign out. */
export default function SettingsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { colors, spacing, radii, fontSizes } = useTheme();
  const { language, restartRequired } = usePreferences();
  const profile = useMyProfile();
  const queryClient = useQueryClient();
  const [logoutFailed, setLogoutFailed] = useState(false);

  async function logout() {
    setLogoutFailed(false);
    const result = await signOut();
    // Drop cached server state so the next account never sees this one's data.
    queryClient.clear();
    if (!result.ok) setLogoutFailed(true);
  }

  function confirmLogout() {
    Alert.alert(t("mobile.logout.submit"), t("mobile.settings.logoutConfirm"), [
      { text: t("mobile.settings.cancel"), style: "cancel" },
      { text: t("mobile.logout.submit"), style: "destructive", onPress: () => void logout() },
    ]);
  }

  const me = profile.data;
  const name = me ? (me.display_name ?? me.username) : null;

  return (
    <Screen edges={["start", "end"]} background="panel" scroll contentStyle={{ paddingBottom: spacing.s24 }}>
      <AppHeader title={t("mobile.settings.title")} />
      {restartRequired ? <Banner kind="info" message={t("mobile.settings.restartRequired")} /> : null}
      <View style={{ paddingHorizontal: spacing.s8 }}>
        {me && name ? (
          <Pressable
            onPress={() => router.push("/profile")}
            accessibilityRole="button"
            accessibilityLabel={name}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.s16,
              padding: spacing.s12,
              borderRadius: radii.card,
              backgroundColor: pressed ? colors.hover : "transparent",
            })}
          >
            <Avatar name={name} seed={me.id} src={avatarUrl(me.avatar_url)} size="lg" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: fontSizes.xl, color: colors.text, writingDirection: "auto" }}>
                {name}
              </Text>
              <Text variant="muted" numberOfLines={1} style={{ fontSize: fontSizes.sm }}>
                @{me.username}
                {me.bio ? ` · ${me.bio}` : ""}
              </Text>
            </View>
          </Pressable>
        ) : null}
        <ListRow
          icon={UserRound}
          title={t("routes.settingsAccount")}
          subtitle={t("settings.accountDesc")}
          chevron
          onPress={() => router.push("/profile")}
        />
        <ListRow
          icon={Lock}
          title={t("routes.settingsPrivacy")}
          subtitle={t("settings.privacyDesc")}
          chevron
          onPress={() => router.push("/settings-privacy")}
        />
        <ListRow
          icon={KeyRound}
          title={t("routes.settingsSecurity")}
          subtitle={t("settings.securityDesc")}
          chevron
          onPress={() => router.push("/settings-security")}
        />
        <ListRow
          icon={Palette}
          title={t("routes.settingsAppearance")}
          subtitle={t("settings.appearanceDesc")}
          chevron
          onPress={() => router.push("/settings-appearance")}
        />
        <ListRow
          icon={Globe}
          title={t("routes.settingsLanguage")}
          subtitle={t(`mobile.settings.languages.${language}`)}
          chevron
          onPress={() => router.push("/settings-language")}
        />
        {logoutFailed ? <Banner kind="error" message={t("mobile.logout.error")} /> : null}
        <ListRow icon={LogOut} title={t("mobile.logout.submit")} destructive onPress={confirmLogout} />
      </View>
    </Screen>
  );
}
