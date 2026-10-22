import { IMAGE_MAX_BYTES } from "@pulse/core";
import { useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Check, ChevronDown } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, TextInput, View } from "react-native";
import { useFormatter, useTranslations } from "use-intl";

import { useMyProfile, useProfileActions } from "@/contacts/queries";
import { avatarUrl, BIO_MAX, deleteMyAccount, DISPLAY_NAME_MAX, signOut } from "@/data";
import { AppHeader, Avatar, Banner, Button, ErrorState, Icon, LoadingState, Screen, Text, TextField, useTheme } from "@/ui";

const COOLDOWN_DAYS = 14;
const AVATAR_MAX_MB = Math.round(IMAGE_MAX_BYTES / (1024 * 1024));

type Feedback = { kind: "error" | "info"; message: string } | null;

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function timezoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    zones = intl.supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const set = new Set(zones);
  set.add(current);
  set.add(deviceTimezone());
  set.add("UTC");
  return [...set].sort();
}

/** Mirrors the web /app/settings/account AccountSettings: avatar, profile, username, export, delete account. */
export default function ProfileScreen() {
  const t = useTranslations("mobile.identity");
  const tc = useTranslations("mobile.chats");
  const format = useFormatter();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors, spacing, radii, fontSizes } = useTheme();
  const profile = useMyProfile();
  const actions = useProfileActions();

  const [edits, setEdits] = useState<{ displayName?: string; bio?: string; timezone?: string }>({});
  const [profileFeedback, setProfileFeedback] = useState<Feedback>(null);
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<Feedback>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback>(null);
  const [zoneOpen, setZoneOpen] = useState(false);
  const [zoneQuery, setZoneQuery] = useState("");

  const p = profile.data;
  const displayName = edits.displayName ?? p?.display_name ?? "";
  const bio = edits.bio ?? p?.bio ?? "";
  const timezone = edits.timezone ?? (p?.timezone || deviceTimezone());
  const zones = useMemo(() => timezoneOptions(timezone), [timezone]);
  const query = zoneQuery.trim().toLowerCase();
  const filteredZones = query ? zones.filter((z) => z.toLowerCase().includes(query)) : zones;

  const messageForCode = (code: string | undefined) =>
    code && t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.platform.unexpected");
  const errorMessageFor = (e: unknown) => messageForCode(e instanceof Error ? e.message : undefined);
  const longDate = (d: Date) => format.dateTime(d, { dateStyle: "long" });

  async function pickAvatar() {
    if (!p) return;
    setAvatarFeedback(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (asset.fileSize && asset.fileSize > IMAGE_MAX_BYTES) {
      const sizeMb = (asset.fileSize / (1024 * 1024)).toFixed(1);
      setAvatarFeedback({ kind: "error", message: t("avatarTooLarge", { sizeMb, maxMb: String(AVATAR_MAX_MB) }) });
      return;
    }
    actions.upload.mutate(
      { userId: p.id, uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" },
      {
        onSuccess: () => setAvatarFeedback({ kind: "info", message: t("avatarSaved") }),
        onError: (e) => setAvatarFeedback({ kind: "error", message: errorMessageFor(e) }),
      },
    );
  }

  function removeAvatar() {
    setAvatarFeedback(null);
    actions.remove.mutate(undefined, {
      onSuccess: () => setAvatarFeedback({ kind: "info", message: t("avatarRemoved") }),
      onError: (e) => setAvatarFeedback({ kind: "error", message: errorMessageFor(e) }),
    });
  }

  function saveProfile() {
    setProfileFeedback(null);
    actions.save.mutate(
      { displayName: displayName.trim(), bio: bio.trim(), timezone },
      {
        onSuccess: () => setProfileFeedback({ kind: "info", message: t("savedProfile") }),
        onError: (e) => setProfileFeedback({ kind: "error", message: errorMessageFor(e) }),
      },
    );
  }

  const changedAt = p?.username_changed_at ? new Date(p.username_changed_at) : null;
  const nextChange = changedAt ? new Date(changedAt.getTime() + COOLDOWN_DAYS * 86_400_000) : null;
  const coolingDown = nextChange !== null && nextChange.getTime() > Date.now();
  const usernameValue = username ?? p?.username ?? "";
  const usernameTarget = usernameValue.trim().replace(/^@/, "");

  function submitUsername() {
    setUsernameFeedback(null);
    actions.changeUsername.mutate(usernameTarget, {
      onSuccess: () => {
        setUsername(null);
        const again = new Date(Date.now() + COOLDOWN_DAYS * 86_400_000);
        setUsernameFeedback({ kind: "info", message: t("usernameChanged", { date: longDate(again) }) });
      },
      onError: (e) => setUsernameFeedback({ kind: "error", message: errorMessageFor(e) }),
    });
  }

  const deleteMatches = !!p && deleteConfirm === `@${p.username}`;

  async function onDelete() {
    setDeleteBusy(true);
    setDeleteFeedback(null);
    const result = await deleteMyAccount(deleteConfirm.replace(/^@/, "")).catch(() => null);
    if (!result?.ok) {
      setDeleteBusy(false);
      setDeleteFeedback({ kind: "error", message: messageForCode(result?.error.code) });
      return;
    }
    await signOut();
    queryClient.clear();
  }

  function confirmDelete() {
    if (!p) return;
    Alert.alert(t("deleteConfirmTitle"), t("deleteConfirmBody", { username: p.username }), [
      { text: t("cancel"), style: "cancel" },
      { text: t("deleteSubmit"), style: "destructive", onPress: () => void onDelete() },
    ]);
  }

  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginHorizontal: spacing.s16,
    marginTop: spacing.s16,
    padding: spacing.s16,
    gap: spacing.s12,
  };
  const input = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s8,
  };
  const feedback = (f: Feedback) => (f ? <Banner kind={f.kind} message={f.message} /> : null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/settings"));
  const header = <AppHeader title={t("accountTitle")} onBack={back} backLabel={tc("back")} />;
  if (profile.isPending) {
    return (
      <Screen edges={["start", "end"]} background="panel">
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (profile.isError || !p) {
    return (
      <Screen edges={["start", "end"]} background="panel">
        {header}
        <ErrorState message={t("errors.platform.unexpected")} onRetry={() => void profile.refetch()} />
      </Screen>
    );
  }

  const name = p.display_name ?? p.username;
  const src = avatarUrl(p.avatar_url);
  const avatarBusy = actions.upload.isPending || actions.remove.isPending;

  return (
    <Screen edges={["bottom", "start", "end"]} background="panel">
      {header}
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.s24 }} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s16 }}>
            <Avatar name={name} seed={p.id} src={src ?? undefined} size="xl" />
            <View style={{ flex: 1, gap: spacing.s8 }}>
              <Text variant="bodyStrong">{t("avatarLabel")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.s8 }}>
                <Button
                  size="sm"
                  variant="secondary"
                  title={actions.upload.isPending ? t("avatarUploading") : t("uploadAvatar")}
                  loading={actions.upload.isPending}
                  disabled={avatarBusy}
                  onPress={() => void pickAvatar()}
                />
                {src ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    title={t("removeAvatar")}
                    loading={actions.remove.isPending}
                    disabled={avatarBusy}
                    onPress={removeAvatar}
                  />
                ) : null}
              </View>
            </View>
          </View>
          <Text variant="caption" tone="textMuted">
            {t("avatarHint", { maxMb: String(AVATAR_MAX_MB) })}
          </Text>
          {feedback(avatarFeedback)}
        </View>

        <View style={card}>
          <TextField
            label={t("displayNameLabel")}
            value={displayName}
            onChangeText={(v) => setEdits((e) => ({ ...e, displayName: v }))}
            maxLength={DISPLAY_NAME_MAX}
          />
          <View style={{ gap: spacing.s4 }}>
            <TextField
              label={t("bioLabel")}
              value={bio}
              onChangeText={(v) => setEdits((e) => ({ ...e, bio: v }))}
              maxLength={BIO_MAX}
              multiline
            />
            <Text variant="caption" tone="textMuted" style={{ alignSelf: "flex-end" }}>
              {t("bioCount", { count: String(bio.length), max: String(BIO_MAX) })}
            </Text>
          </View>
          <View style={{ gap: spacing.s4 }}>
            <Text variant="label">{t("timezoneLabel")}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t("timezoneLabel")}: ${timezone}`}
              onPress={() => setZoneOpen((o) => !o)}
              style={[input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}
            >
              <Text>{timezone}</Text>
              <Icon icon={ChevronDown} size={16} tone="textMuted" />
            </Pressable>
            {zoneOpen ? (
              <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, overflow: "hidden" }}>
                <TextInput
                  value={zoneQuery}
                  onChangeText={setZoneQuery}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel={t("timezoneLabel")}
                  placeholder="Europe/Paris"
                  placeholderTextColor={colors.textMuted}
                  style={[input, { borderWidth: 0, borderRadius: 0, borderBottomWidth: 1 }]}
                />
                <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredZones.map((zone) => (
                    <Pressable
                      key={zone}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: zone === timezone }}
                      onPress={() => {
                        setEdits((e) => ({ ...e, timezone: zone }));
                        setZoneOpen(false);
                        setZoneQuery("");
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: spacing.s12,
                        paddingVertical: spacing.s8,
                      }}
                    >
                      <Text>{zone}</Text>
                      {zone === timezone ? <Icon icon={Check} size={16} tone="accent" /> : null}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
          {feedback(profileFeedback)}
          <Button
            title={actions.save.isPending ? t("submitting") : t("saveProfile")}
            loading={actions.save.isPending}
            disabled={actions.save.isPending}
            onPress={saveProfile}
          />
        </View>

        <View style={card}>
          <Text variant="bodyStrong">{t("changeUsername")}</Text>
          <Text variant="caption" tone="textMuted">
            {coolingDown && nextChange ? t("usernameNextChange", { date: longDate(nextChange) }) : t("usernameCooldownHint")}
          </Text>
          <View style={{ gap: spacing.s4 }}>
            <Text variant="label">{t("usernameLabel")}</Text>
            <View style={[input, { flexDirection: "row", alignItems: "center", gap: spacing.s4 }]}>
              <Text tone="textMuted">@</Text>
              <TextInput
                value={usernameValue}
                onChangeText={setUsername}
                editable={!coolingDown}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t("usernameLabel")}
                style={{ flex: 1, color: colors.text, fontSize: fontSizes.sm, padding: 0 }}
              />
            </View>
          </View>
          {feedback(usernameFeedback)}
          <Button
            title={actions.changeUsername.isPending ? t("submitting") : t("changeUsername")}
            variant="secondary"
            loading={actions.changeUsername.isPending}
            disabled={coolingDown || actions.changeUsername.isPending || usernameTarget === p.username}
            onPress={submitUsername}
          />
        </View>

        <View style={card}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8 }}>
            <Text variant="bodyStrong">{t("exportTitle")}</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radii.pill,
                paddingHorizontal: spacing.s8,
              }}
            >
              <Text variant="caption" tone="textMuted">
                {t("comingSoon")}
              </Text>
            </View>
          </View>
          <Text variant="caption" tone="textMuted">
            {t("exportHint")}
          </Text>
          <Button title={t("exportSubmit")} variant="secondary" disabled onPress={() => undefined} />
        </View>

        <View style={card}>
          <Text variant="bodyStrong" style={{ color: colors.danger }}>
            {t("deleteAccountTitle")}
          </Text>
          <Text variant="caption" tone="textMuted">
            {t("deleteAccountHint")}
          </Text>
          <View style={{ gap: spacing.s4 }}>
            <Text variant="label">{t("deleteConfirmLabel")}</Text>
            <TextInput
              value={deleteConfirm}
              onChangeText={setDeleteConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={`@${p.username}`}
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={t("deleteConfirmLabel")}
              style={input}
            />
          </View>
          {feedback(deleteFeedback)}
          <Button
            title={t("deleteSubmit")}
            variant="danger"
            loading={deleteBusy}
            disabled={!deleteMatches || deleteBusy}
            onPress={confirmDelete}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}
