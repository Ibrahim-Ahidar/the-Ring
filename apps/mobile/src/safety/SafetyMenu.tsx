import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { REPORT_CATEGORIES } from "@/data";
import { useSafetyActions } from "@/safety/queries";
import { Banner, Button, ListRow, Sheet, useTheme } from "@/ui";

/**
 * Block / report actions for the other user of a direct chat. Uncontrolled it renders its own "More"
 * button; pass `visible` + `onClose` to drive it from another trigger (the chat header kebab), and
 * `extraRows` to list more entries above block/report.
 */
export function SafetyMenu({
  userId,
  onBlocked,
  visible,
  onClose,
  extraRows,
}: {
  userId?: string | null;
  onBlocked?: () => void;
  visible?: boolean;
  onClose?: () => void;
  extraRows?: ReactNode;
}) {
  const t = useTranslations();
  const { spacing } = useTheme();
  const actions = useSafetyActions();
  const [ownOpen, setOpen] = useState(false);
  const controlled = visible !== undefined;
  const open = controlled ? visible : ownOpen;
  const [reporting, setReporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setReporting(false);
    onClose?.();
  }

  return (
    <>
      {controlled ? null : (
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
      )}
      <Sheet visible={open} onClose={close} title={t("mobile.safety.menu")}>
        {notice ? <Banner kind="error" message={notice} /> : null}
        {reporting ? (
          REPORT_CATEGORIES.map((category) => (
            <ListRow
              key={category}
              title={t(`mobile.safety.categories.${category}`)}
              onPress={() =>
                actions.report.mutate(
                  { userId: userId as string, category },
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
            {extraRows}
            {userId ? (
              <>
            <ListRow
              title={t("mobile.safety.block")}
              destructive
              onPress={() =>
                actions.block.mutate(userId as string, {
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
            ) : null}
          </>
        )}
        <View style={{ paddingTop: spacing.s8 }}>
          <Button title={t("mobile.groups.cancel")} variant="secondary" block onPress={close} />
        </View>
      </Sheet>
    </>
  );
}
