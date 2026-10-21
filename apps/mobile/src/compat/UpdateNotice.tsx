import { isBelowMinimum, isUpdateAvailable } from "@pulse/core";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Linking } from "react-native";
import { useTranslations } from "use-intl";

import { getMobileCompat } from "@/data";
import { Banner, Button } from "@/ui";

import { APP_VERSION } from "./UpdateGate";

/** Dismissible banner shown when a newer (but not required) release exists. */
export function UpdateNotice() {
  const t = useTranslations();
  const [dismissed, setDismissed] = useState(false);
  const compat = useQuery({
    queryKey: ["mobile-compat"],
    queryFn: async () => {
      const r = await getMobileCompat();
      if (!r.ok) throw new Error(r.error.code);
      return r.value;
    },
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const data = compat.data;
  if (dismissed || !data || !isUpdateAvailable(APP_VERSION, data.latestVersion)) return null;
  if (isBelowMinimum(APP_VERSION, data.minVersion)) return null;

  return (
    <Banner
      kind="info"
      message={t("mobile.update.notice", { latest: data.latestVersion ?? "", current: APP_VERSION })}
      action={
        <>
          {data.downloadUrl ? (
            <Button
              size="sm"
              variant="ghost"
              title={t("mobile.update.download")}
              onPress={() => void Linking.openURL(data.downloadUrl as string)}
            />
          ) : null}
          <Button size="sm" variant="ghost" title={t("mobile.update.dismiss")} onPress={() => setDismissed(true)} />
        </>
      }
    />
  );
}
