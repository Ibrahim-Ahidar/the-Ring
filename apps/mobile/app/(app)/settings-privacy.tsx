import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";

import type { PrivacyPatch, PrivacySettings } from "@/data";
import { useBlocks, useMyReports, usePrivacy, useSafetyActions, useUpdatePrivacy } from "@/safety/queries";
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  Text,
  ToggleRow,
  useTheme,
} from "@/ui";

const VISIBILITY = ["public", "contacts", "private"] as const;
const MESSAGE = ["everyone", "requests", "nobody"] as const;
const GROUPS = ["everyone", "contacts", "nobody"] as const;

type ChoiceField = "profileVisibility" | "whoCanMessage" | "whoCanAddToGroups";

/** Mirrors the web /app/settings/privacy PrivacySettingsView: discovery, presence, messaging, groups, blocks, reports. */
export default function PrivacySettingsScreen() {
  const t = useTranslations("mobile.privacySettings");
  const format = useFormatter();
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const privacy = usePrivacy();
  const save = useUpdatePrivacy();
  const blocks = useBlocks();
  const reports = useMyReports();
  const safety = useSafetyActions();

  const saving = (field: keyof PrivacySettings) =>
    save.isPending && save.variables !== undefined && field in save.variables;
  const patch = (value: PrivacyPatch) => save.mutate(value);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));

  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginHorizontal: spacing.s16,
    marginTop: spacing.s16,
    paddingVertical: spacing.s8,
    overflow: "hidden" as const,
  };
  const cardTitle = (title: string) => (
    <Text variant="bodyStrong" style={{ paddingHorizontal: spacing.s16, paddingVertical: spacing.s8 }}>
      {title}
    </Text>
  );
  const note = (message: string, danger = false) => (
    <Text
      variant="caption"
      style={{ color: danger ? colors.danger : colors.textMuted, paddingHorizontal: spacing.s16, paddingVertical: spacing.s8 }}
    >
      {message}
    </Text>
  );
  const choice = (field: ChoiceField, options: readonly string[], current: string) => (
    <View style={{ paddingHorizontal: spacing.s16, paddingVertical: spacing.s8, gap: spacing.s8 }}>
      <Text>{t(`settings.${field}`)}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.s8 }}>
        {options.map((value) => {
          const selected = value === current;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: saving(field) }}
              disabled={saving(field)}
              onPress={() => patch({ [field]: value } as PrivacyPatch)}
              style={{
                paddingHorizontal: spacing.s12,
                paddingVertical: spacing.s4,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : "transparent",
              }}
            >
              <Text variant="label" style={{ color: selected ? colors.accentContrast : colors.text }}>
                {t(`options.${field}.${value}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const header = <AppHeader title={t("pageTitle")} onBack={back} />;
  if (privacy.isPending) {
    return (
      <Screen edges={["start", "end"]} background="panel">
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (privacy.isError) {
    return (
      <Screen edges={["start", "end"]} background="panel">
        {header}
        <ErrorState message={t("errors.generic")} onRetry={() => void privacy.refetch()} />
      </Screen>
    );
  }
  const p = privacy.data;

  return (
    <Screen edges={["start", "end"]} background="panel">
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.s24 }}>
        {save.isError ? <Banner kind="error" message={t("errors.generic")} /> : null}

        <View style={card}>
          {cardTitle(t("sections.discovery"))}
          <ToggleRow
            title={t("settings.discoverable")}
            value={p.discoverable}
            disabled={saving("discoverable")}
            onValueChange={(v) => patch({ discoverable: v })}
          />
          {choice("profileVisibility", VISIBILITY, p.profileVisibility)}
        </View>

        <View style={card}>
          {cardTitle(t("sections.presence"))}
          <ToggleRow
            title={t("settings.showOnline")}
            value={p.showOnline}
            disabled={saving("showOnline")}
            onValueChange={(v) => patch({ showOnline: v })}
          />
          <ToggleRow
            title={t("settings.showLastSeen")}
            value={p.showLastSeen}
            disabled={saving("showLastSeen")}
            onValueChange={(v) => patch({ showLastSeen: v })}
          />
          <ToggleRow
            title={t("settings.sendReadReceipts")}
            value={p.sendReadReceipts}
            disabled={saving("sendReadReceipts")}
            onValueChange={(v) => patch({ sendReadReceipts: v })}
          />
        </View>

        <View style={card}>
          {cardTitle(t("sections.messaging"))}
          {choice("whoCanMessage", MESSAGE, p.whoCanMessage)}
        </View>

        <View style={card}>
          {cardTitle(t("sections.groups"))}
          {choice("whoCanAddToGroups", GROUPS, p.whoCanAddToGroups)}
        </View>

        <View style={card}>
          {cardTitle(t("block.listTitle"))}
          {blocks.isPending ? note(t("states.loading")) : null}
          {blocks.isError || safety.unblock.isError ? note(t("errors.generic"), true) : null}
          {blocks.isSuccess && blocks.data.length === 0 ? note(t("block.empty")) : null}
          {(blocks.data ?? []).map((b) => (
            <ListRow
              key={b.blockedId}
              title={b.displayName ?? b.username}
              subtitle={`@${b.username}`}
              leading={<Avatar name={b.displayName ?? b.username} seed={b.blockedId} />}
              trailing={
                <Button
                  title={t("block.unblock")}
                  variant="secondary"
                  size="sm"
                  disabled={safety.unblock.isPending}
                  onPress={() => safety.unblock.mutate(b.blockedId)}
                />
              }
            />
          ))}
        </View>

        <View style={card}>
          {cardTitle(t("report.listTitle"))}
          {reports.isPending ? note(t("states.loading")) : null}
          {reports.isError ? note(t("errors.generic"), true) : null}
          {reports.isSuccess && reports.data.length === 0 ? note(t("report.empty")) : null}
          {(reports.data ?? []).map((r) => (
            <ListRow
              key={r.id}
              title={t(`report.categories.${r.category}`)}
              subtitle={format.dateTime(new Date(r.createdAt), { dateStyle: "medium", timeStyle: "short" })}
              trailing={
                <Text variant="caption" tone="textMuted">
                  {t(`report.status.${r.status}`)}
                </Text>
              }
            />
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}
