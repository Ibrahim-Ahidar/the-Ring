import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useTranslations } from "use-intl";

import { groupErrorKey } from "@/groups/errors";
import { useCreateGroup } from "@/groups/queries";
import { AppHeader, Banner, Button, Screen, TextField, useTheme } from "@/ui";

export default function NewGroupScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const create = useCreateGroup();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function submit() {
    const result = await create.mutateAsync({ name, description: description.trim() || null, members }).catch(() => null);
    if (!result) return;
    if (result.failedInvites.length > 0) {
      setFailed(result.failedInvites.map((f) => f.username));
      setCreatedId(result.conversationId);
      return;
    }
    router.replace({ pathname: "/chats/[id]", params: { id: result.conversationId } });
  }

  const code = create.error?.message ?? "";
  return (
    <Screen edges={["bottom", "start", "end"]} scroll>
      <AppHeader title={t("mobile.groups.newTitle")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      <View style={{ padding: spacing.s16, gap: spacing.s16 }}>
        <TextField
          label={t("mobile.groups.form.nameLabel")}
          value={name}
          onChangeText={setName}
          maxLength={80}
          accessibilityLabel={t("mobile.groups.form.nameLabel")}
        />
        <TextField
          label={t("mobile.groups.form.descriptionLabel")}
          value={description}
          onChangeText={setDescription}
          maxLength={300}
          multiline
          lines={3}
          accessibilityLabel={t("mobile.groups.form.descriptionLabel")}
        />
        <TextField
          label={t("mobile.groups.form.membersLabel")}
          hint={t("mobile.groups.form.membersHint")}
          value={members}
          onChangeText={setMembers}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t("mobile.groups.form.membersPlaceholder")}
          accessibilityLabel={t("mobile.groups.form.membersLabel")}
        />
        {create.isError ? <Banner kind="error" message={t(groupErrorKey(code, t.has))} /> : null}
        {failed.length > 0 && createdId ? (
          <View style={{ gap: spacing.s12 }}>
            <Banner kind="error" message={t("mobile.groups.invitesFailed", { names: failed.join(", ") })} />
            <Button
              title={t("mobile.groups.openGroup")}
              block
              onPress={() => router.replace({ pathname: "/chats/[id]", params: { id: createdId } })}
            />
          </View>
        ) : (
          <Button
            title={t("mobile.groups.create")}
            block
            loading={create.isPending}
            disabled={create.isPending || !name.trim()}
            onPress={() => void submit()}
          />
        )}
      </View>
    </Screen>
  );
}
