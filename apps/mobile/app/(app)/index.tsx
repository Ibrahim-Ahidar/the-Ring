import { useRouter } from "expo-router";
import { Archive, FolderPlus, Inbox, MessageSquare, MessageSquarePlus, MoreVertical, UsersRound } from "lucide-react-native";
import { memo, useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { Chip } from "@/chats/Chip";
import { listTime } from "@/chats/format";
import { useChatList } from "@/chats/queries";
import { useMyProfile } from "@/contacts/queries";
import { useOnline } from "@/net/useOnline";
import { ChatActionsSheet } from "@/organization/ChatActionsSheet";
import { useArchivedSummary, useFolders } from "@/organization/queries";
import { timingChatOpenStart, timingColdStartPainted } from "@/timing";
import { avatarUrl, type ChatListFilter, type ConversationSummary } from "@/data";
import {
  AppHeader,
  Avatar,
  Banner,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  Screen,
  Spinner,
  UnreadCount,
  useTheme,
} from "@/ui";

function chatTitle(chat: ConversationSummary, fallback: string): string {
  return chat.type === "group"
    ? (chat.title ?? fallback)
    : (chat.other_display_name ?? chat.other_username ?? fallback);
}

type RowProps = {
  chat: ConversationSummary;
  untitled: string;
  deleted: string;
  noMessages: string;
  hint: string;
  optionsLabel: string;
  onOpen: (id: string) => void;
  onActions: (chat: ConversationSummary) => void;
};

/** Mirrors the web `.chatRow`: 12 gap, 8/12 padding, name + time on top, preview + badges below, kebab at the end. */
const ChatRow = memo(function ChatRow({ chat, untitled, deleted, noMessages, hint, optionsLabel, onOpen, onActions }: RowProps) {
  const { colors, spacing, radii, fontSizes, fontWeights, controlHeights } = useTheme();
  const title = chatTitle(chat, untitled);
  const [nowMs] = useState(() => Date.now());
  const muted = chat.muted_until !== null && new Date(chat.muted_until).getTime() > nowMs;
  const unread = chat.unread_count > 0;
  const isDeleted = chat.last_message_deletion_scope === "everyone";
  return (
    <Pressable
      onPress={() => onOpen(chat.id)}
      onLongPress={() => onActions(chat)}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.s12,
        minHeight: controlHeights.row,
        paddingVertical: spacing.s8,
        paddingStart: spacing.s12,
        paddingEnd: spacing.s4,
        borderRadius: radii.card,
        backgroundColor: pressed ? colors.hover : "transparent",
      })}
    >
      <Avatar name={title} seed={chat.other_user_id ?? chat.id} src={chat.other_avatar_url} />
      <View style={{ flex: 1, minWidth: 0, gap: spacing.s2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSizes.lg, color: colors.text, writingDirection: "auto" }}>
            {title}
          </Text>
          {chat.last_message_at ? (
            <Text
              style={{
                fontSize: 12,
                color: unread ? colors.accent : colors.textMuted,
                fontWeight: unread ? fontWeights.medium : fontWeights.regular,
              }}
            >
              {listTime(chat.last_message_at, new Date())}
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.s8 }}>
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 14, color: colors.textMuted, fontStyle: isDeleted ? "italic" : "normal" }}
          >
            {isDeleted ? deleted : (chat.last_message_preview ?? noMessages)}
          </Text>
          <UnreadCount count={chat.unread_count} muted={muted} />
        </View>
      </View>
      <IconButton icon={MoreVertical} label={optionsLabel} size="sm" onPress={() => onActions(chat)} />
    </Pressable>
  );
});

/** Web ArchivedRow: shown above the list on the "all" filter when something is archived. */
function ArchivedRow({ label, unread, onPress }: { label: string; unread: number; onPress: () => void }) {
  const { colors, spacing, radii, fontSizes, fontWeights, controlHeights } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: spacing.s12,
        minHeight: controlHeights.row,
        paddingVertical: spacing.s8,
        paddingHorizontal: spacing.s12,
        borderRadius: radii.card,
        backgroundColor: pressed ? colors.hover : "transparent",
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radii.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.hover,
        }}
      >
        <Icon icon={Archive} size={20} tone="textMuted" />
      </View>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSizes.lg, fontWeight: fontWeights.medium, color: colors.text }}>
        {label}
      </Text>
      <UnreadCount count={unread} />
    </Pressable>
  );
}

export default function ChatListScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const { session } = useSession();
  const online = useOnline();
  const [filter, setFilter] = useState<ChatListFilter>({ kind: "all" });
  const [actionsFor, setActionsFor] = useState<ConversationSummary | null>(null);
  const list = useChatList(session?.userId ?? "", filter);
  const folders = useFolders();
  const archived = useArchivedSummary();
  const me = useMyProfile().data;

  function isActive(f: ChatListFilter): boolean {
    return f.kind === filter.kind && (f.kind !== "folder" || (filter.kind === "folder" && filter.folderId === f.folderId));
  }
  const chips: { key: string; label: string; value: ChatListFilter }[] = [
    { key: "all", label: t("mobile.organization.filters.all"), value: { kind: "all" } },
    { key: "unread", label: t("mobile.organization.filters.unread"), value: { kind: "unread" } },
    { key: "groups", label: t("mobile.organization.filters.groups"), value: { kind: "groups" } },
    ...(folders.data ?? []).map((f) => ({
      key: f.id,
      label: f.name,
      value: { kind: "folder", folderId: f.id } as ChatListFilter,
    })),
  ];

  const chats = list.data?.pages.flatMap((p) => p.items) ?? [];
  useEffect(() => {
    if (list.data) timingColdStartPainted();
  }, [list.data]);
  const open = useCallback((id: string) => {
    timingChatOpenStart(id);
    router.push({ pathname: "/chats/[id]", params: { id } });
  }, [router]);
  const untitled = t("mobile.chats.untitled");
  const deleted = t("mobile.chats.deleted");
  const noMessages = t("mobile.chats.noMessages");
  const hint = t("mobile.organization.longPressHint");
  const optionsLabel = t("mobile.organization.chatOptions");
  const inArchive = filter.kind === "archived";
  const archivedCount = archived.data?.count ?? 0;
  const myName = me ? (me.display_name ?? me.username) : "";

  return (
    <Screen edges={["start", "end"]} background="panel">
      {inArchive ? (
        <AppHeader
          title={t("mobile.organization.filters.archived")}
          onBack={() => setFilter({ kind: "all" })}
          backLabel={t("mobile.chats.back")}
        />
      ) : (
        <AppHeader
          large
          title={t("mobile.chats.title")}
          leading={
            me ? (
              <Pressable
                onPress={() => router.push("/settings")}
                accessibilityRole="button"
                accessibilityLabel={t("mobile.settings.title")}
                hitSlop={spacing.s8}
              >
                <Avatar name={myName} seed={me.id} src={avatarUrl(me.avatar_url)} size="sm" />
              </Pressable>
            ) : undefined
          }
          actions={
            <>
              {filter.kind === "groups" ? (
                <IconButton icon={UsersRound} label={t("mobile.groups.newGroup")} onPress={() => router.push("/groups/new")} />
              ) : null}
              <IconButton icon={Inbox} label={t("mobile.safety.requests")} onPress={() => router.push("/requests")} />
              <IconButton
                icon={MessageSquarePlus}
                label={t("mobile.organization.newChat")}
                onPress={() => router.push("/chats/new")}
              />
            </>
          }
        />
      )}
      {!online ? <Banner kind="offline" message={t("mobile.offline.banner")} /> : null}
      {inArchive ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{
            gap: spacing.s8,
            paddingHorizontal: spacing.s16,
            paddingTop: spacing.s4,
            paddingBottom: spacing.s8,
            alignItems: "center",
          }}
        >
          {chips.map((c) => (
            <Chip key={c.key} label={c.label} active={isActive(c.value)} onPress={() => setFilter(c.value)} />
          ))}
          <Chip icon={FolderPlus} label={t("mobile.organization.manageFolders")} onPress={() => router.push("/folders")} />
        </ScrollView>
      )}
      {list.isPending ? <LoadingState /> : null}
      {list.isError ? <ErrorState title={t("mobile.chats.loadError")} onRetry={() => list.refetch()} /> : null}
      <FlatList
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: spacing.s8, flexGrow: 1 }}
        data={chats}
        keyExtractor={(c) => c.id}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListHeaderComponent={
          filter.kind === "all" && archivedCount > 0 ? (
            <ArchivedRow
              label={t("mobile.organization.archivedRow", { count: archivedCount })}
              unread={archived.data?.unread ?? 0}
              onPress={() => setFilter({ kind: "archived" })}
            />
          ) : undefined
        }
        ListFooterComponent={list.isFetchingNextPage ? <Spinner /> : undefined}
        ListEmptyComponent={
          list.isPending || list.isError ? undefined : <EmptyState icon={MessageSquare} title={t("mobile.chats.empty")} />
        }
        renderItem={({ item }) => (
          <ChatRow
            chat={item}
            untitled={untitled}
            deleted={deleted}
            noMessages={noMessages}
            hint={hint}
            optionsLabel={optionsLabel}
            onOpen={open}
            onActions={setActionsFor}
          />
        )}
      />
      <ChatActionsSheet chat={actionsFor} onClose={() => setActionsFor(null)} />
    </Screen>
  );
}
