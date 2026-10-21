import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useMyProfile, useProfileActions } from "@/contacts/queries";
import { avatarUrl, BIO_MAX, DISPLAY_NAME_MAX } from "@/data";

export default function ProfileScreen() {
  const t = useTranslations();
  const router = useRouter();
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
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <Text style={styles.title}>{t("mobile.profile.title")}</Text>
      </View>
      {profile.isPending ? <ActivityIndicator /> : null}
      {profile.isError ? <Text style={styles.error}>{t("mobile.profile.loadError")}</Text> : null}
      {profile.data ? (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.avatarRow}>
            {src ? (
              <Image source={{ uri: src }} style={styles.avatar} accessibilityLabel={t("mobile.profile.avatar")} />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.initial}>{(profile.data.display_name ?? profile.data.username).slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.flex}>
              <Text style={styles.name}>@{profile.data.username}</Text>
              <Pressable onPress={() => void pickAvatar()} accessibilityRole="button" disabled={actions.upload.isPending}>
                <Text style={styles.link}>{t("mobile.profile.changeAvatar")}</Text>
              </Pressable>
              {src ? (
                <Pressable onPress={() => actions.remove.mutate()} accessibilityRole="button" disabled={actions.remove.isPending}>
                  <Text style={styles.link}>{t("mobile.profile.removeAvatar")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={styles.label}>{t("mobile.profile.displayName")}</Text>
          <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} maxLength={DISPLAY_NAME_MAX} />
          <Text style={styles.label}>{t("mobile.profile.bio")}</Text>
          <TextInput style={[styles.input, styles.bio]} value={bio} onChangeText={setBio} maxLength={BIO_MAX} multiline />
          {failed ? <Text style={styles.error}>{t("mobile.profile.error")}</Text> : null}
          {saved ? <Text style={styles.ok}>{t("mobile.profile.saved")}</Text> : null}
          <Pressable style={styles.button} onPress={() => void save()} accessibilityRole="button" disabled={actions.save.isPending}>
            <Text style={styles.buttonText}>{t("mobile.profile.save")}</Text>
          </Pressable>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1, gap: 6 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  link: { color: "#4f46e5", fontSize: 16 },
  error: { color: "#b00020" },
  ok: { color: "#1b7a3d" },
  body: { padding: 16, gap: 8 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarEmpty: { backgroundColor: "#e0e0f0", alignItems: "center", justifyContent: "center" },
  initial: { fontSize: 32, fontWeight: "600" },
  name: { fontSize: 18, fontWeight: "600" },
  label: { fontWeight: "600", marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10 },
  bio: { minHeight: 90, textAlignVertical: "top" },
  button: { backgroundColor: "#4f46e5", borderRadius: 8, padding: 14, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
