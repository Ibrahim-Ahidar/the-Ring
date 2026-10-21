import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { canSend } from "@/chats/composer";
import { useChatDetail, useChatMessages, useMarkRead, useSendText } from "@/chats/queries";
import { flattenPages, shouldLoadMoreForLanding, tickFor } from "@/chats/timeline";
import { formatLastSeen } from "@/chats/last-seen";
import { useSubtitle, useTyping } from "@/chats/usePresence";
import { OfflineBanner } from "@/net/OfflineBanner";
import { useOnline } from "@/net/useOnline";
import { initialScrollTarget, outboundDeliveryStatus, type InitialScroll, type RpcMessageRow } from "@/data";

export default function ChatScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.userId ?? "";

  const detail = useChatDetail(id);
  const messages = useChatMessages(id);
  const send = useSendText(id);
  const online = useOnline();
  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList<RpcMessageRow>>(null);

  const rows = flattenPages(messages.data?.pages.map((p) => p.items) ?? []);
  const pagesLoaded = messages.data?.pages.length ?? 0;

  // The read marker at open time; later refreshes must not move the landing spot.
  const [openedLastRead, setOpenedLastRead] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (openedLastRead === undefined && detail.data) setOpenedLastRead(detail.data.last_read_message_id);
  }, [detail.data, openedLastRead]);

  const ready = openedLastRead !== undefined && messages.data !== undefined;
  const [landing, setLanding] = useState<InitialScroll | null>(null);
  const needsHistory =
    ready &&
    landing === null &&
    shouldLoadMoreForLanding({
      loaded: rows,
      lastReadMessageId: openedLastRead ?? null,
      hasMore: messages.hasNextPage,
      pagesLoaded,
    });

  const { fetchNextPage, isFetchingNextPage } = messages;
  useEffect(() => {
    if (needsHistory && !isFetchingNextPage) void fetchNextPage();
  }, [needsHistory, isFetchingNextPage, fetchNextPage]);

  // Decide the landing spot once, after the history it needs has loaded.
  useEffect(() => {
    if (ready && !needsHistory && landing === null) {
      setLanding(initialScrollTarget(rows, openedLastRead ?? null, userId));
    }
  }, [ready, needsHistory, landing, rows, openedLastRead, userId]);

  const unreadId = landing?.kind === "unread" ? landing.messageId : null;
  const landingIndex = unreadId ? rows.findIndex((m) => m.id === unreadId) : -1;
  const scrolled = useRef(false);
  const scrollToLanding = useCallback(() => {
    if (scrolled.current || landingIndex < 0) return;
    scrolled.current = true;
    listRef.current?.scrollToIndex({ index: landingIndex, viewPosition: 0.5, animated: false });
  }, [landingIndex]);

  const newestIncoming = rows.find((m) => m.sender_id !== userId)?.id ?? null;
  useMarkRead(id, landing ? newestIncoming : null);

  const title = detail.data
    ? detail.data.type === "group"
      ? (detail.data.title ?? t("mobile.chats.untitled"))
      : (detail.data.other_display_name ?? detail.data.other_username ?? t("mobile.chats.untitled"))
    : "";

  const { typers, sender } = useTyping(id, userId, (uid) => {
    const other = detail.data?.other_user_id === uid ? detail.data.other_display_name : null;
    return other ?? t("mobile.presence.someone");
  });
  const subtitle = useSubtitle(detail.data, userId, typers);
  let subtitleText: string | null = null;
  if (subtitle.kind === "typing") subtitleText = t(`mobile.presence.${subtitle.key}`, subtitle.values);
  else if (subtitle.kind === "online") subtitleText = t("mobile.presence.online");
  else if (subtitle.kind === "offline") subtitleText = t("mobile.presence.offline");
  else if (subtitle.kind === "lastSeen") {
    const ls = formatLastSeen(subtitle.at, new Date());
    subtitleText =
      ls.key === "lastSeenJustNow"
        ? t("mobile.presence.lastSeenJustNow")
        : ls.key === "lastSeenDate"
          ? t("mobile.presence.lastSeenDate", { date: ls.date.toLocaleDateString() })
          : t(`mobile.presence.${ls.key}`, { count: ls.count });
  }

  const sendable = canSend({ online, draft, pending: send.isPending });

  function submit() {
    const body = draft.trim();
    if (!canSend({ online, draft, pending: send.isPending })) return;
    sender.stop();
    send.mutate(body, { onSuccess: () => setDraft("") });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>{t("mobile.chats.back")}</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitleText ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitleText}
            </Text>
          ) : null}
        </View>
      </View>
      <OfflineBanner />
      {messages.isPending || (ready && landing === null) ? <ActivityIndicator style={styles.center} /> : null}
      {messages.isError ? <Text style={styles.error}>{t("mobile.chats.loadError")}</Text> : null}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={listRef}
          style={styles.flex}
          inverted
          data={landing ? rows : []}
          keyExtractor={(m) => m.id}
          onContentSizeChange={scrollToLanding}
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(
              () => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.5, animated: false }),
              50,
            );
          }}
          onEndReached={() => {
            if (landing && messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
          }}
          ListFooterComponent={messages.isFetchingNextPage ? <ActivityIndicator /> : undefined}
          renderItem={({ item }) => {
            const mine = item.sender_id === userId;
            const tick = mine ? tickFor(outboundDeliveryStatus(item, detail.data)) : null;
            return (
              <View>
                {item.id === unreadId ? <Text style={styles.divider}>{t("mobile.chats.unreadDivider")}</Text> : null}
                <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                  <Text style={mine ? styles.mineText : undefined}>
                    {item.deletion_scope === "everyone"
                      ? t("mobile.chats.deleted")
                      : item.type === "text"
                        ? item.body
                        : t("mobile.chats.unsupported")}
                  </Text>
                  <View style={styles.meta}>
                    <Text style={[styles.time, mine && styles.mineText]}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                    {tick ? (
                      <Text
                        accessibilityLabel={t(tick.labelKey)}
                        style={[styles.time, tick.read ? styles.read : styles.mineText]}
                      >
                        {tick.glyph}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />
        {send.isError ? <Text style={styles.error}>{t("mobile.chats.sendError")}</Text> : null}
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              sender.input(text);
            }}
            placeholder={t("mobile.chats.composerPlaceholder")}
            multiline
          />
          <Pressable
            style={[styles.send, !sendable && styles.disabled]}
            onPress={submit}
            disabled={!sendable}
            accessibilityRole="button"
          >
            <Text style={styles.sendText}>{t("mobile.chats.send")}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  subtitle: { fontSize: 12, color: "#666" },
  link: { color: "#4f46e5", fontSize: 16 },
  center: { marginTop: 24 },
  error: { color: "#b00020", paddingHorizontal: 16 },
  divider: { alignSelf: "center", color: "#4f46e5", marginVertical: 8, fontSize: 12 },
  bubble: { maxWidth: "80%", marginHorizontal: 12, marginVertical: 3, padding: 10, borderRadius: 12 },
  mine: { alignSelf: "flex-end", backgroundColor: "#4f46e5" },
  theirs: { alignSelf: "flex-start", backgroundColor: "#e5e7eb" },
  mineText: { color: "#fff" },
  meta: { flexDirection: "row", gap: 6, alignSelf: "flex-end" },
  time: { fontSize: 11, color: "#666" },
  read: { fontSize: 11, color: "#7dd3fc" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 120,
  },
  send: { backgroundColor: "#4f46e5", borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12 },
  disabled: { opacity: 0.5 },
  sendText: { color: "#fff", fontWeight: "600" },
});
