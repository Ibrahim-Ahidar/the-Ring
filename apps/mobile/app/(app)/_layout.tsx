import { Stack, usePathname, useRouter } from "expo-router";
import { MessageCircle, Settings, UserRound } from "lucide-react-native";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { useNotificationRouting } from "@/notifications/useNotificationRouting";
import { BottomNav, useTheme } from "@/ui";

/** Web phone shell: the tab bar shows on the top-level pages only, never inside a conversation. */
const TABS = [
  { key: "chats", href: "/", icon: MessageCircle, labelKey: "mobile.chats.title" },
  { key: "contacts", href: "/contacts", icon: UserRound, labelKey: "mobile.contacts.title" },
  { key: "settings", href: "/settings", icon: Settings, labelKey: "mobile.settings.title" },
] as const;

export default function AppLayout() {
  useNotificationRouting();
  const { colors } = useTheme();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const current = TABS.find((tab) => tab.href === pathname);
  return (
    <View style={{ flex: 1, backgroundColor: colors.panel }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" options={{ animation: "none" }} />
        <Stack.Screen name="contacts" options={{ animation: "none" }} />
        <Stack.Screen name="settings" options={{ animation: "none" }} />
      </Stack>
      {current ? (
        <BottomNav
          items={TABS.map((tab) => ({
            key: tab.key,
            label: t(tab.labelKey),
            icon: tab.icon,
            active: tab.key === current.key,
            onPress: () => {
              if (tab.key !== current.key) router.replace(tab.href);
            },
          }))}
        />
      ) : null}
    </View>
  );
}
