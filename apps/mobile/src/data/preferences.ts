import { parsePreferences, type Preferences } from "@pulse/core";
import * as SecureStore from "expo-secure-store";

const KEY = "pulse.preferences";

export async function loadPreferences(): Promise<Preferences> {
  try {
    return parsePreferences(await SecureStore.getItemAsync(KEY));
  } catch {
    return parsePreferences(null);
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(prefs));
  } catch {
    // Not persisting is acceptable; the choice still applies for this session.
  }
}
