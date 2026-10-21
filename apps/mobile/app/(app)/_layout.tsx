import { Stack } from "expo-router";

import { useNotificationRouting } from "@/notifications/useNotificationRouting";
import { useTheme } from "@/ui";

export default function AppLayout() {
  useNotificationRouting();
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: "slide_from_right",
      }}
    />
  );
}
