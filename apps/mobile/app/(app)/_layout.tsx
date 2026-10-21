import { Stack } from "expo-router";
import { useNotificationRouting } from "@/notifications/useNotificationRouting";

export default function AppLayout() {
  useNotificationRouting();
  return <Stack screenOptions={{ headerShown: false }} />;
}
