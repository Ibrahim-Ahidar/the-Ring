import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";

import { useMyProfile, useProfileActions } from "@/contacts/queries";
import { avatarUrl, BIO_MAX, DISPLAY_NAME_MAX } from "@/data";
import { AppHeader, Avatar, Banner, Button, ErrorState, LoadingState, Screen, Text, TextField, useTheme } from "@/ui";

export default function ProfileScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const profile = useMyProfile();
  const actions = useProfileActions();
  const [edits, setEdits] = useState<{ displayName?: string; bio?: string }>({});
  const [saved, setSaved] = useState(false);
  const displayName = edits.displayName ?? profile.data?.display_name ?? "";
  const bio = edits.bio ?? profile.data?.bio ?? "";
  const setDisplayName = (v: string) => setEdits((e) => ({ ...e, displayName: v }));
  const setBio = (v: string) => setEdits((e) => ({ ...e, bio: v }));

  async function pickAvatar() {
    if (!profile.data) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    actions.upload.mutate({ userId: profile.data.id, uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
  }

  async function save() {
    setSaved(false);
    try {
      await actions.save.mutateAsync({ displayName: displayName.trim(), bio: bio.trim() });
      setSaved(true);
    } catch {
      // surfaced through actions.save.isError
    }
  }

  const src = avatarUrl(profile.data?.avatar_url);
  const failed = actions.save.isError || actions.upload.isError || actions.remove.isError;

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader title={t("mobile.profile.title")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {profile.isPending ? <LoadingState /> : null}
      {profile.isError ? <ErrorState title={t("mobile.profile.loadError")} onRetry={() => void profile.refetch()} /> : null}
      {profile.data ? (
        <ScrollView contentContainerStyle={{ gap: spacing.s16, padding: spacing.s16 }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: "center", gap: spacing.s8 }}>
            <Avatar
              name={profile.data.display_name ?? profile.data.username}
              seed={profile.data.id}
              src={src ?? undefined}
              size="lg"
            />
            <Text variant="heading">{profile.data.display_name ?? profile.data.username}</Text>
            <Text variant="muted">@{profile.data.username}</Text>
            <View style={{ flexDirection: "row", gap: spacing.s8 }}>
              <Button
                size="sm"
                variant="secondary"
                title={t("mobile.profile.changeAvatar")}
                onPress={() => void pickAvatar()}
                loading={actions.upload.isPending}
              />
              {src ? (
                <Button
                  size="sm"
                  variant="ghost"
                  title={t("mobile.profile.removeAvatar")}
                  onPress={() => actions.remove.mutate()}
                  loading={actions.remove.isPending}
                />
              ) : null}
            </View>
          </View>
          <TextField
            label={t("mobile.profile.displayName")}
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={DISPLAY_NAME_MAX}
          />
          <TextField label={t("mobile.profile.bio")} value={bio} onChangeText={setBio} maxLength={BIO_MAX} multiline />
          {failed ? <Banner kind="error" message={t("mobile.profile.error")} /> : null}
          {saved ? <Banner kind="info" message={t("mobile.profile.saved")} /> : null}
          <Button block title={t("mobile.profile.save")} onPress={() => void save()} loading={actions.save.isPending} />
        </ScrollView>
      ) : null}
    </Screen>
  );
}
