import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type NotificationsModule = typeof import("expo-notifications");

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications throws at import time when its native module is missing
 * (e.g. an Expo Go build that predates it). Load it lazily so the app still boots.
 */
export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  // Probe the native module first: requiring expo-notifications without it
  // throws during module init, which Metro reports as an error even if caught.
  if (Platform.OS === "android" && !requireOptionalNativeModule("ExpoTopicSubscriptionModule")) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as NotificationsModule;
  } catch (cause) {
    console.warn("[notifications] native module unavailable; push disabled", cause);
    cached = null;
  }
  return cached;
}
