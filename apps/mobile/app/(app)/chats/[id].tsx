import { setStringAsync } from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, Images, Pin, SendHorizontal, UsersRound, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, TextInput, View } from "react-native";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { canSend } from "@/chats/composer";
import { dayKey, dayLabel } from "@/chats/format";
import { MediaComposer } from "@/chats/MediaComposer";
import { MessageBubble } from "@/chats/MessageBubble";
import { MessageMenu } from "@/chats/MessageMenu";
import {
  useChatDetail,
  useChatMessages,
  useMarkRead,
  useMessageActions,
  useReactions,
  useSendMedia,
  useSendText,
} from "@/chats/queries";
import { snippet } from "@/chats/snippet";
import { flattenPages, shouldLoadMoreForLanding } from "@/chats/timeline";
import { formatLastSeen } from "@/chats/last-seen";
import { useSubtitle, useTyping } from "@/chats/usePresence";
import { SafetyMenu } from "@/safety/SafetyMenu";
import { useOnline } from "@/net/useOnline";
import {
  availableActions,
  initialScrollTarget,
  reactionToggle,
  type InitialScroll,
  type MessageReaction,
  type RpcMessageRow,
} from "@/data";
import { AppHeader, Avatar, Banner, ErrorState, Icon, IconButton, Screen, Spinner, Text, useTheme } from "@/ui";

export default function ChatScreen() {
  const t = useTranslations();
  const { colors, spacing, radii, shadows } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.userId ?? "";

  const detail = useChatDetail(id);
  const messages = useChatMessages(id);
  const send = useSendText(id);
  const sendMedia = useSendMedia(id);
  const messageActions = useMessageActions(id);
  const online = useOnline();
  const [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<RpcMessageRow | null>(null);
  const [replyTo, setReplyTo] = useState<RpcMessageRow | null>(null);
  const [editing, setEditing] = useState<RpcMessageRow | null>(null);
  const listRef = useRef<FlatList<RpcMessageRow>>(null);

  const rows = flattenPages(messages.data?.pages.map((p) => p.items) ?? []);
  const pagesLoaded = messages.data?.pages.length ?? 0;

  const reactionsQuery = useReactions(
    id,
    rows.map((m) => m.id),
  );
  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, MessageReaction[]>();
    for (const r of reactionsQuery.data ?? []) {
      const list = map.get(r.message_id) ?? [];
      list.push(r);
      map.set(r.message_id, list);
    }
    return map;
  }, [reactionsQuery.data]);
  const rowsById = new Map(rows.map((m) => [m.id, m]));

  // The read marker at open time; later refreshes must not move the landing spot.
  const [openedLastRead, setOpenedLastRead] = useState<string | null | undefined>(undefined);
  if (openedLastRead === undefined && detail.data) setOpenedLastRead(detail.data.last_read_message_id);

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
  if (ready && !needsHistory && landing === null) {
    setLanding(initialScrollTarget(rows, openedLastRead ?? null, userId));
  }

  const mediaErrorMessage = sendMedia.error?.message ?? "";
  const mediaErrorKey = mediaErrorMessage.startsWith("media.")
    ? `mobile.media.errors.${mediaErrorMessage.slice("media.".length)}`
    : null;

  const unreadId = landing?.kind === "unread" ? landing.messageId : null;
  const landingIndex = unreadId ? rows.findIndex((m) => m.id === unreadId) : -1;
  const scrolled = useRef(false);
  const scrollToLanding = () => {
    if (scrolled.current || landingIndex < 0) return;
    scrolled.current = true;
    listRef.current?.scrollToIndex({ index: landingIndex, viewPosition: 0.5, animated: false });
  };

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

  const busy = send.isPending || messageActions.edit.isPending;
  const sendable = canSend({ online, draft, pending: busy });

  function submit() {
    const body = draft.trim();
    if (!canSend({ online, draft, pending: busy })) return;
    sender.stop();
    if (editing) {
      messageActions.edit.mutate(
        { messageId: editing.id, body },
        {
          onSuccess: () => {
            setDraft("");
            setEditing(null);
          },
        },
      );
      return;
    }
    send.mutate(
      { body, replyToId: replyTo?.id ?? null },
      {
        onSuccess: () => {
          setDraft("");
          setReplyTo(null);
        },
      },
    );
  }

  function quoteText(replyToId: string): string {
    const original = rowsById.get(replyToId);
    if (!original) return "…";
    return original.deletion_scope === "everyone"
      ? t("mobile.actions.originalDeleted")
      : snippet(original.body);
  }

  const pinned = rows.find((m) => m.pinned_at && m.deletion_scope !== "everyone") ?? null;
  const pinnedPreview = pinned
    ? pinned.body ||
      (pinned.type === "image" ? t("mobile.media.photo") : pinned.type === "audio" ? t("mobile.media.voiceNote") : "")
    : "";

  function senderName(m: RpcMessageRow): string {
    if (m.sender_id === userId) return t("mobile.actions.you");
    return detail.data?.other_user_id === m.sender_id
      ? (detail.data.other_display_name ?? t("mobile.chats.untitled"))
      : t("mobile.presence.someone");
  }

  function runAction(action: "reply" | "copy" | "edit" | "delete") {
    const m = selected;
    setSelected(null);
    if (!m) return;
    if (action === "reply") {
      setEditing(null);
      setReplyTo(m);
    } else if (action === "copy") {
      void setStringAsync(m.body ?? "");
    } else if (action === "edit") {
      setReplyTo(null);
      setEditing(m);
      setDraft(m.body ?? "");
    } else {
      Alert.alert(t("mobile.actions.deleteTitle"), t("mobile.actions.deleteBody"), [
        { text: t("mobile.actions.cancel"), style: "cancel" },
        {
          text: t("mobile.actions.delete"),
          style: "destructive",
          onPress: () => messageActions.remove.mutate(m.id),
        },
      ]);
    }
  }

  function runReact(emoji: string) {
    const m = selected;
    setSelected(null);
    if (!m) return;
    const op = reactionToggle(reactionsByMessage.get(m.id) ?? [], userId, emoji);
    messageActions.react.mutate({ messageId: m.id, emoji, op });
  }

  const selectedMine = selected
    ? (reactionsByMessage.get(selected.id) ?? []).filter((r) => r.user_id === userId).map((r) => r.emoji)
    : [];

  const reactMutate = messageActions.react.mutate;
  const toggleReaction = useCallback(
    (messageId: string, emoji: string, op: "add" | "remove") => reactMutate({ messageId, emoji, op }),
    [reactMutate],
  );
  const now = new Date();
  const hasMoreHistory = !!messages.hasNextPage;
  const actionFailed = messageActions.edit.isError || messageActions.remove.isError || messageActions.react.isError;

  return (
    <Screen edges={["bottom", "start", "end"]} background="chatBg">
      <AppHeader
        title={title}
        subtitle={subtitleText ?? undefined}
        onBack={() => router.back()}
        backLabel={t("mobile.chats.back")}
        leading={<Avatar name={title || "?"} seed={id} src={detail.data?.other_avatar_url} size="sm" />}
        actions={
          <>
            {detail.data?.type === "direct" && detail.data.other_user_id ? (
              <SafetyMenu userId={detail.data.other_user_id} onBlocked={() => router.back()} />
            ) : null}
            <IconButton
              icon={Images}
              label={t("mobile.sharedMedia.sharedMedia")}
              onPress={() => router.push({ pathname: "/media/[conversationId]", params: { conversationId: id } })}
            />
            {detail.data?.type === "group" ? (
              <IconButton
                icon={UsersRound}
                label={t("mobile.groups.info")}
                onPress={() => router.push({ pathname: "/groups/[id]", params: { id } })}
              />
            ) : null}
          </>
        }
      />
      {!online ? <Banner kind="offline" message={t("mobile.offline.banner")} /> : null}
      {messages.isPending || (ready && landing === null) ? <Spinner /> : null}
      {messages.isError ? <ErrorState title={t("mobile.chats.loadError")} onRetry={() => messages.refetch()} /> : null}
      {pinned ? (
        <View
          accessibilityRole="summary"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.s12,
            paddingHorizontal: spacing.s16,
            paddingVertical: spacing.s8,
            backgroundColor: colors.panel,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Icon icon={Pin} size={16} tone="accent" />
          <View style={{ flex: 1, borderStartWidth: 3, borderStartColor: colors.accent, paddingStart: spacing.s8 }}>
            <Text variant="caption" tone="accentStrong" numberOfLines={1}>
              {t("mobile.chats.pinnedMessage")}
            </Text>
            <Text variant="caption" numberOfLines={1}>
              {snippet(pinnedPreview)}
            </Text>
          </View>
        </View>
      ) : null}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <FlatList
          ref={listRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: spacing.s8 }}
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
          ListFooterComponent={messages.isFetchingNextPage ? <Spinner /> : undefined}
          renderItem={({ item, index }) => {
            // Inverted list: the older neighbour sits at index + 1.
            const older = rows[index + 1];
            const sameDay = older ? dayKey(older.created_at) === dayKey(item.created_at) : false;
            const grouped = !!older && sameDay && older.sender_id === item.sender_id;
            const showDay = older ? !sameDay : !hasMoreHistory;
            return (
              <MessageBubble
                item={item}
                mine={item.sender_id === userId}
                userId={userId}
                detail={detail.data}
                reactions={reactionsByMessage.get(item.id)}
                quote={item.reply_to_id ? quoteText(item.reply_to_id) : null}
                quoteAuthor={item.reply_to_id && rowsById.get(item.reply_to_id) ? senderName(rowsById.get(item.reply_to_id) as RpcMessageRow) : null}
                quoteSelf={item.reply_to_id ? rowsById.get(item.reply_to_id)?.sender_id === userId : false}
                grouped={grouped}
                dayLabel={showDay ? dayLabel(item.created_at, now) : null}
                unreadDivider={item.id === unreadId}
                onLongPress={setSelected}
                onToggleReaction={toggleReaction}
              />
            );
          }}
        />
        {send.isError ? <Banner kind="error" message={t("mobile.chats.sendError")} /> : null}
        {sendMedia.isError ? (
          <Banner
            kind="error"
            message={mediaErrorKey && t.has(mediaErrorKey) ? t(mediaErrorKey) : t("mobile.media.mediaError")}
          />
        ) : null}
        {actionFailed ? <Banner kind="error" message={t("mobile.actions.actionError")} /> : null}
        {replyTo || editing ? (
          <View style={{ backgroundColor: colors.chatBg, paddingHorizontal: spacing.s16, paddingTop: spacing.s8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.s8,
                paddingStart: spacing.s12,
                paddingEnd: spacing.s4,
                paddingVertical: spacing.s8,
                borderRadius: radii.card,
                backgroundColor: colors.elevated,
                ...shadows.bubble,
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderStartWidth: 4,
                  borderStartColor: colors.accent,
                  borderRadius: 6,
                  backgroundColor: colors.quote,
                  paddingStart: spacing.s8,
                  paddingVertical: 6,
                }}
              >
                <Text variant="caption" tone="accentStrong" numberOfLines={1}>
                  {editing
                    ? t("mobile.actions.editing")
                    : t("mobile.actions.replyingTo", { name: senderName(replyTo as RpcMessageRow) })}
                </Text>
                <Text variant="caption" numberOfLines={1}>
                  {snippet((editing ?? replyTo)?.body)}
                </Text>
              </View>
              <IconButton
                icon={X}
                label={t("mobile.actions.cancel")}
                onPress={() => {
                  if (editing) setDraft("");
                  setEditing(null);
                  setReplyTo(null);
                }}
              />
            </View>
          </View>
        ) : null}
        <View style={{ backgroundColor: colors.chatBg, paddingHorizontal: spacing.s16, paddingTop: spacing.s8, paddingBottom: spacing.s12 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-end",
              gap: spacing.s4,
              minHeight: 52,
              paddingHorizontal: spacing.s8,
              paddingVertical: spacing.s4,
              borderRadius: 26,
              backgroundColor: colors.elevated,
              ...shadows.bubble,
            }}
          >
            {!editing ? (
              <MediaComposer disabled={!online || sendMedia.isPending} onUpload={(u) => sendMedia.mutate(u)} />
            ) : null}
            <TextInput
              style={{
                flex: 1,
                minHeight: 44,
                maxHeight: 140,
                paddingHorizontal: spacing.s8,
                paddingVertical: spacing.s12,
                backgroundColor: "transparent",
                color: colors.text,
                textAlign: "auto",
                writingDirection: "auto",
              }}
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                sender.input(text);
              }}
              placeholder={t("mobile.chats.composerPlaceholder")}
              multiline
            />
            <IconButton
              icon={editing ? Check : SendHorizontal}
              label={editing ? t("mobile.actions.save") : t("mobile.chats.send")}
              accent
              flipRtl={!editing}
              disabled={!sendable}
              onPress={submit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
      <MessageMenu
        visible={selected !== null}
        actions={selected ? availableActions(selected, userId) : []}
        mineEmoji={selectedMine}
        onReact={runReact}
        onAction={runAction}
        onClose={() => setSelected(null)}
      />
    </Screen>
  );
}
