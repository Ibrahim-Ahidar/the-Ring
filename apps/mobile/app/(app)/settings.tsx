import { useQueryClient } from "@tanstack/react-query";
import { ACCENTS, LANGUAGES, THEMES } from "@pulse/core";
import { useRouter } from "expo-router";
import { Check, FolderOpen, LogOut, UserRound } from "lucide-react-native";
import { useState } from "react";
import { Alert } from "react-native";
import { useTranslations } from "use-intl";

import { signOut } from "@/data";
import { usePreferences } from "@/settings/PreferencesProvider";
import { AppHeader, Banner, Divider, ListRow, Screen, SectionHeader, Surface, Icon, useTheme } from "@/ui";

function Tick({ on }: { on: boolean }) {
  return on ? <Icon icon={Check} tone="accent" /> : null;
}

export default function SettingsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const { prefs, language, restartRequired, update } = usePreferences();
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

  return (
    <Screen edges={["start", "end"]} background="panel" scroll contentStyle={{ paddingBottom: spacing.s24 }}>
      <AppHeader title={t("mobile.settings.title")} />
      {restartRequired ? <Banner kind="info" message={t("mobile.settings.restartRequired")} /> : null}

      <SectionHeader title={t("mobile.profile.title")} />
      <Surface style={{ marginHorizontal: spacing.s12 }}>
        <ListRow icon={UserRound} title={t("mobile.profile.title")} chevron onPress={() => router.push("/profile")} />
        <Divider inset={spacing.s12} />
        <ListRow
          icon={FolderOpen}
          title={t("mobile.organization.folders")}
          chevron
          onPress={() => router.push("/folders")}
        />
      </Surface>

      <SectionHeader title={t("mobile.settings.theme")} />
      <Surface style={{ marginHorizontal: spacing.s12 }}>
        {THEMES.map((v, i) => (
          <Divided key={v} first={i === 0}>
            <ListRow
              title={t(`mobile.settings.themes.${v}`)}
              selected={prefs.theme === v}
              trailing={<Tick on={prefs.theme === v} />}
              onPress={() => update({ theme: v })}
              accessibilityLabel={t(`mobile.settings.themes.${v}`)}
            />
          </Divided>
        ))}
      </Surface>

      <SectionHeader title={t("mobile.settings.accent")} />
      <Surface style={{ marginHorizontal: spacing.s12 }}>
        {ACCENTS.map((v, i) => (
          <Divided key={v} first={i === 0}>
            <ListRow
              title={t(`mobile.settings.accents.${v}`)}
              selected={prefs.accent === v}
              trailing={<Tick on={prefs.accent === v} />}
              onPress={() => update({ accent: v })}
            />
          </Divided>
        ))}
      </Surface>

      <SectionHeader title={t("mobile.settings.language")} />
      <Surface style={{ marginHorizontal: spacing.s12 }}>
        {LANGUAGES.map((v, i) => (
          <Divided key={v} first={i === 0}>
            <ListRow
              title={t(`mobile.settings.languages.${v}`)}
              selected={language === v}
              trailing={<Tick on={language === v} />}
              onPress={() => update({ language: v })}
            />
          </Divided>
        ))}
      </Surface>

      <SectionHeader title={t("mobile.settings.account")} />
      {logoutFailed ? <Banner kind="error" message={t("mobile.logout.error")} /> : null}
      <Surface style={{ marginHorizontal: spacing.s12 }}>
        <ListRow icon={LogOut} title={t("mobile.logout.submit")} destructive onPress={confirmLogout} />
      </Surface>
    </Screen>
  );
}

/** Divider above every row but the first. */
function Divided({ first, children }: { first: boolean; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <>
      {first ? null : <Divider inset={spacing.s12} />}
      {children}
    </>
  );
}
