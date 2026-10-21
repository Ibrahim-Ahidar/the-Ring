import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { createDeviceLifecycle } from "./devices-core";
import { rpc } from "./rpc";

const DEVICE_ID_KEY = "pulse.device_id";

async function getPushToken(): Promise<string | null> {
  // Push tokens need a physical device.
  if (!Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("messages", {
      name: "Messages",
      // eslint-disable-next-line import/namespace -- enum re-exported via export *
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  return data;
}

export const devices = createDeviceLifecycle({
  getPushToken,
  callRpc: (fn, args) => rpc(fn, args),
  idStore: {
    get: () => SecureStore.getItemAsync(DEVICE_ID_KEY),
    set: (id) => SecureStore.setItemAsync(DEVICE_ID_KEY, id),
    clear: () => SecureStore.deleteItemAsync(DEVICE_ID_KEY),
  },
  platform: Platform.OS,
  appVersion: Constants.expoConfig?.version ?? null,
  log: (message, cause) => console.warn(`[devices] ${message}`, cause),
});

export const registerDevice = () => devices.register();
export const unregisterDevice = () => devices.unregister();
