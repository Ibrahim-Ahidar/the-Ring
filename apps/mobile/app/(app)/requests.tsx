import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";

import type { MessageRequest } from "@/data";
import { useMessageRequests, useRequestActions, useSentMessageRequests } from "@/safety/queries";
import { AppHeader, Avatar, Button, LoadingState, Screen, SectionHeader, Text, useTheme } from "@/ui";

/** Mirrors the web /app/chats/requests RequestsView: incoming (accept / confirm decline) and sent requests. */
export default function RequestsScreen() {
  const t = useTranslations("mobile.requests");
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const incoming = useMessageRequests();
  const outgoing = useSentMessageRequests();
  const actions = useRequestActions();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "platform.unexpected");
  const accept = (id: string) => {
    setError(null);
    actions.accept.mutate(id, {
      onSuccess: (r) => router.replace({ pathname: "/chats/[id]", params: { id: r.conversationId } }),
      onError: fail,
    });
  };
  const decline = (id: string) => {
    setError(null);
    actions.decline.mutate(id, { onSuccess: () => setConfirming(null), onError: fail });
  };
  const busy = actions.accept.isPending || actions.decline.isPending;
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const card = {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    marginHorizontal: spacing.s16,
    overflow: "hidden" as const,
  };
  const row = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.s12,
    padding: spacing.s12,
    paddingHorizontal: spacing.s16,
  };
  const note = (message: string, danger = false) => (
    <Text
      variant="caption"
      style={{ color: danger ? colors.danger : colors.textMuted, paddingHorizontal: spacing.s16, paddingVertical: spacing.s8 }}
    >
      {message}
    </Text>
  );
  const identity = (r: MessageRequest, name: string, withNote: boolean) => (
    <>
      <Avatar name={name} seed={r.userId} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" tone="textMuted" numberOfLines={1}>
          @{r.username}
        </Text>
        {withNote && r.note ? (
          <Text variant="caption" numberOfLines={2}>
            {r.note}
          </Text>
        ) : null}
      </View>
    </>
  );

  const pending = (incoming.data ?? []).filter((r) => r.status === "pending");
  const sent = outgoing.data ?? [];
  const divider = (i: number) => (i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null);

  return (
    <Screen edges={["bottom", "start", "end"]} background="panel">
      <AppHeader title={t("title")} onBack={back} />
      {incoming.isPending || outgoing.isPending ? (
        <LoadingState />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.s24 }}>
          {error ? note(t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic"), true) : null}

          <SectionHeader title={t("incomingTitle")} />
          {incoming.isError ? note(t("errors.generic"), true) : null}
          {incoming.isSuccess && pending.length === 0 ? note(t("emptyIncoming")) : null}
          {pending.length > 0 ? (
            <View style={card}>
              {pending.map((r, i) => {
                const name = r.displayName?.trim() || r.username;
                return (
                  <View key={r.id} style={[row, divider(i)]}>
                    {identity(r, name, true)}
                    {confirming === r.id ? (
                      <View accessibilityLabel={t("declineConfirm", { name })} style={{ flexDirection: "row", gap: spacing.s8 }}>
                        <Button title={t("declineConfirmAction")} variant="danger" size="sm" disabled={busy} onPress={() => decline(r.id)} />
                        <Button title={t("cancel")} variant="secondary" size="sm" disabled={busy} onPress={() => setConfirming(null)} />
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", gap: spacing.s8 }}>
                        <Button
                          title={t("accept")}
                          size="sm"
                          disabled={busy}
                          accessibilityLabel={`${t("accept")}: ${name}`}
                          onPress={() => accept(r.id)}
                        />
                        <Button
                          title={t("decline")}
                          variant="secondary"
                          size="sm"
                          disabled={busy}
                          accessibilityLabel={`${t("decline")}: ${name}`}
                          onPress={() => setConfirming(r.id)}
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}

          <SectionHeader title={t("outgoingTitle")} />
          {outgoing.isError ? note(t("errors.generic"), true) : null}
          {outgoing.isSuccess && sent.length === 0 ? note(t("emptyOutgoing")) : null}
          {sent.length > 0 ? (
            <View style={card}>
              {sent.map((r, i) => {
                const name = r.displayName?.trim() || r.username;
                const conversationId = r.conversationId;
                return (
                  <View key={r.id} style={[row, divider(i)]}>
                    {identity(r, name, false)}
                    {r.status === "accepted" && conversationId ? (
                      <Pressable
                        accessibilityRole="link"
                        hitSlop={8}
                        onPress={() => router.push({ pathname: "/chats/[id]", params: { id: conversationId } })}
                      >
                        <Text variant="caption" style={{ color: colors.accent }}>
                          {t("status.accepted")}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text variant="caption" tone="textMuted">
                        {t(`status.${r.status}`)}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
