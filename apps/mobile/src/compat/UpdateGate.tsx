import { isBelowMinimum } from "@pulse/core";
import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import type { ReactNode } from "react";
import { Linking, View } from "react-native";
import { useTranslations } from "use-intl";

import { getMobileCompat, unwrap } from "@/data";
import { Button, Screen, Text, useTheme } from "@/ui";

export const APP_VERSION = Constants.expoConfig?.version ?? "0.0.0";

/** Blocks the whole app when this build is older than the backend minimum. Fails open offline. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const { spacing } = useTheme();
  const compat = useQuery({
    queryKey: ["mobile-compat"],
    queryFn: async () => unwrap(await getMobileCompat()),
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const data = compat.data;
  if (!data || !isBelowMinimum(APP_VERSION, data.minVersion)) return <>{children}</>;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: spacing.s12, paddingHorizontal: spacing.s24 }}>
        <Text variant="title">{t("mobile.update.title")}</Text>
        <Text variant="body">
          {t("mobile.update.body", { current: APP_VERSION, minimum: data.minVersion ?? "" })}
        </Text>
        {data.downloadUrl ? (
          <Button
            block
            title={t("mobile.update.download")}
            onPress={() => void Linking.openURL(data.downloadUrl as string)}
          />
        ) : null}
      </View>
    </Screen>
  );
}
