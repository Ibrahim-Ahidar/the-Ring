import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { REPORT_CATEGORIES } from "@/data";
import { useSafetyActions } from "@/safety/queries";
import { Banner, Button, ListRow, Sheet, useTheme } from "@/ui";

/** Block / report actions for the other user of a direct chat. */
export function SafetyMenu({ userId, onBlocked }: { userId: string; onBlocked?: () => void }) {
  const t = useTranslations();
  const { spacing } = useTheme();
  const actions = useSafetyActions();
  const [open, setOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setReporting(false);
  }

  return (
    <>
      <Button
        title={t("mobile.safety.menu")}
        variant="ghost"
        size="sm"
        accessibilityLabel={t("mobile.safety.menu")}
        onPress={() => {
          setNotice(null);
          setOpen(true);
        }}
      />
      <Sheet visible={open} onClose={close} title={t("mobile.safety.menu")}>
        {notice ? <Banner kind="error" message={notice} /> : null}
        {reporting ? (
          REPORT_CATEGORIES.map((category) => (
            <ListRow
              key={category}
              title={t(`mobile.safety.categories.${category}`)}
              onPress={() =>
                actions.report.mutate(
                  { userId, category },
                  {
                    onSuccess: () => {
                      close();
                      setNotice(t("mobile.safety.reported"));
                    },
                    onError: () => setNotice(t("mobile.safety.error")),
                  },
                )
              }
            />
          ))
        ) : (
          <>
            <ListRow
              title={t("mobile.safety.block")}
              destructive
              onPress={() =>
                actions.block.mutate(userId, {
                  onSuccess: () => {
                    close();
                    onBlocked?.();
                  },
                  onError: () => setNotice(t("mobile.safety.error")),
                })
              }
            />
            <ListRow title={t("mobile.safety.report")} onPress={() => setReporting(true)} />
          </>
        )}
        <View style={{ paddingTop: spacing.s8 }}>
          <Button title={t("mobile.groups.cancel")} variant="secondary" block onPress={close} />
        </View>
      </Sheet>
    </>
  );
}
