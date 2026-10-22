import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";

import { sendMessageRequest, startDirectChat } from "@/data";
import { AppHeader, Button, Screen, Text, useTheme } from "@/ui";

const NOTE_MAX = 300;

/** Mirrors the web /app/chats/new NewChatClient: open a direct chat by @username, or send a request when required. */
export default function NewChatScreen() {
  const t = useTranslations("mobile.newChat");
  const tr = useTranslations("mobile.requests");
  const router = useRouter();
  const { colors, spacing, radii, fontSizes } = useTheme();
  const { username: fromQuery } = useLocalSearchParams<{ username?: string }>();
  const [username, setUsername] = useState(fromQuery ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [autoOpening, setAutoOpening] = useState(Boolean(fromQuery));
  const [note, setNote] = useState("");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);
  const target = username.trim().replace(/^@/, "");

  const open = async (name: string, navigate: "push" | "replace") => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const result = await startDirectChat(name).catch(() => null);
    if (result?.ok) {
      const href = { pathname: "/chats/[id]" as const, params: { id: result.value.conversationId } };
      if (navigate === "replace") router.replace(href);
      else router.push(href);
      return;
    }
    setError(result ? result.error.code : "platform.unexpected");
    inFlight.current = false;
    setPending(false);
    setAutoOpening(false);
  };

  useEffect(() => {
    if (fromQuery) void open(fromQuery.trim().replace(/^@/, ""), "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromQuery]);

  const sendRequest = async () => {
    setPending(true);
    setRequestError(null);
    const result = await sendMessageRequest(target, note).catch(() => null);
    setPending(false);
    if (result?.ok) setSent(true);
    else setRequestError(result ? result.error.code : "platform.unexpected");
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    margin: spacing.s16,
    padding: spacing.s16,
    gap: spacing.s12,
  };
  const field = {
    borderWidth: 1,
    borderRadius: radii.control,
    backgroundColor: colors.input,
    color: colors.text,
    fontSize: fontSizes.sm,
    paddingHorizontal: spacing.s12,
    paddingVertical: spacing.s8,
  };
  const errorText = (message: string) => (
    <Text variant="caption" style={{ color: colors.danger }} accessibilityRole="alert">
      {message}
    </Text>
  );

  const requestRequired = error === "messaging.request_required";
  const visibleError = error && !requestRequired ? error : null;

  let body;
  if (requestRequired && sent) {
    body = (
      <View style={card}>
        <Text tone="textMuted">{tr("sent", { username: target })}</Text>
        <Button title={tr("viewRequests")} variant="secondary" onPress={() => router.replace("/requests")} />
      </View>
    );
  } else if (requestRequired) {
    body = (
      <View style={card}>
        <Text tone="textMuted">{tr("requestRequired", { username: target })}</Text>
        <Text variant="label">{tr("noteLabel")}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
          numberOfLines={3}
          accessibilityLabel={tr("noteLabel")}
          style={[field, { borderColor: colors.border, minHeight: 80, textAlignVertical: "top" }]}
        />
        {requestError
          ? errorText(tr.has(`errors.${requestError}`) ? tr(`errors.${requestError}`) : tr("errors.generic"))
          : null}
        <Button title={tr("send")} loading={pending} disabled={pending} onPress={() => void sendRequest()} />
      </View>
    );
  } else if (autoOpening && !visibleError) {
    body = (
      <Text tone="textMuted" style={{ padding: spacing.s16 }} accessibilityRole="progressbar">
        {t("opening")}
      </Text>
    );
  } else {
    body = (
      <View style={card}>
        <Text variant="label">{t("usernameLabel")}</Text>
        <View
          style={[
            field,
            { flexDirection: "row", alignItems: "center", gap: spacing.s4, borderColor: visibleError ? colors.danger : colors.border },
          ]}
        >
          <Text tone="textMuted">@</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            accessibilityLabel={t("usernameLabel")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => void open(target, "push")}
            style={{ flex: 1, color: colors.text, fontSize: fontSizes.sm, padding: 0 }}
          />
        </View>
        {visibleError
          ? errorText(t.has(`errors.${visibleError}`) ? t(`errors.${visibleError}`) : t("errors.platform.unexpected"))
          : null}
        <Button
          title={pending ? t("opening") : t("openChat")}
          loading={pending}
          disabled={pending}
          onPress={() => void open(target, "push")}
        />
      </View>
    );
  }

  return (
    <Screen edges={["bottom", "start", "end"]} background="panel">
      <AppHeader title={t("title")} onBack={back} />
      <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView>
    </Screen>
  );
}
