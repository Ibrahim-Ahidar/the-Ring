import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { MessageSquare, Settings, UsersRound } from "lucide-react-native";
import { memo, useCallback, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";

import { useSession } from "@/auth/session";
import { Chip } from "@/chats/Chip";
import { listTime } from "@/chats/format";
import { useChatList } from "@/chats/queries";
import { useOnline } from "@/net/useOnline";
import { ChatActionsSheet } from "@/organization/ChatActionsSheet";
import { useArchivedSummary, useFolders } from "@/organization/queries";
import { signOut, type ChatListFilter, type ConversationSummary } from "@/data";
import {
  AppHeader,
  Avatar,
  Banner,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
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
  onOpen: (id: string) => void;
  onActions: (chat: ConversationSummary) => void;
};

const ChatRow = memo(function ChatRow({ chat, untitled, deleted, noMessages, hint, onOpen, onActions }: RowProps) {
  const { controlHeights } = useTheme();
  const title = chatTitle(chat, untitled);
  const [nowMs] = useState(() => Date.now());
  const muted = chat.muted_until !== null && new Date(chat.muted_until).getTime() > nowMs;
  return (
    <View style={{ minHeight: controlHeights.row, justifyContent: "center" }}>
      <ListRow
        title={title}
        subtitle={chat.last_message_deletion_scope === "everyone" ? deleted : (chat.last_message_preview ?? noMessages)}
        leading={<Avatar name={title} seed={chat.id} src={chat.other_avatar_url} />}
        meta={chat.last_message_at ? listTime(chat.last_message_at, new Date()) : undefined}
        trailing={<UnreadCount count={chat.unread_count} muted={muted} />}
        onPress={() => onOpen(chat.id)}
        onLongPress={() => onActions(chat)}
        accessibilityHint={hint}
      />
    </View>
  );
});

export default function ChatListScreen() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { spacing } = useTheme();
  const { session } = useSession();
  const online = useOnline();
  const [logoutFailed, setLogoutFailed] = useState(false);
  const [filter, setFilter] = useState<ChatListFilter>({ kind: "all" });
  const [actionsFor, setActionsFor] = useState<ConversationSummary | null>(null);
  const list = useChatList(session?.userId ?? "", filter);
  const folders = useFolders();
  const archived = useArchivedSummary();

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
    {
      key: "archived",
      label:
        archived.data && archived.data.count > 0
          ? t("mobile.organization.filters.archivedCount", { count: archived.data.count })
          : t("mobile.organization.filters.archived"),
      value: { kind: "archived" },
    },
  ];

  async function logout() {
    setLogoutFailed(false);
    const result = await signOut();
    // Drop cached server state so the next account never sees this one's data.
    queryClient.clear();
    if (!result.ok) setLogoutFailed(true);
  }

  const chats = list.data?.pages.flatMap((p) => p.items) ?? [];
  const open = useCallback((id: string) => router.push({ pathname: "/chats/[id]", params: { id } }), [router]);
  const untitled = t("mobile.chats.untitled");
  const deleted = t("mobile.chats.deleted");
  const noMessages = t("mobile.chats.noMessages");
  const hint = t("mobile.organization.longPressHint");

  const rowStyle = {
    gap: spacing.s8,
    paddingHorizontal: spacing.s16,
    paddingVertical: spacing.s8,
    alignItems: "center",
  } as const;

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader
        title={t("mobile.chats.title")}
        actions={
          <>
            <IconButton icon={UsersRound} label={t("mobile.groups.newGroup")} onPress={() => router.push("/groups/new")} />
            <IconButton icon={Settings} label={t("mobile.settings.title")} onPress={() => router.push("/settings")} />
          </>
        }
      />
      {!online ? <Banner kind="offline" message={t("mobile.offline.banner")} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rowStyle} style={{ flexGrow: 0 }}>
        {chips.map((c) => (
          <Chip key={c.key} label={c.label} active={isActive(c.value)} onPress={() => setFilter(c.value)} />
        ))}
        <Chip label={t("mobile.organization.manageFolders")} onPress={() => router.push("/folders")} />
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rowStyle} style={{ flexGrow: 0 }}>
        <Chip label={t("mobile.safety.requests")} onPress={() => router.push("/requests")} />
        <Chip label={t("mobile.safety.blocked")} onPress={() => router.push("/blocked")} />
        <Chip label={t("mobile.contacts.link")} onPress={() => router.push("/contacts")} />
        <Chip label={t("mobile.profile.link")} onPress={() => router.push("/profile")} />
        <Chip label={t("mobile.logout.submit")} onPress={logout} />
      </ScrollView>
      {logoutFailed ? <Banner kind="error" message={t("mobile.logout.error")} /> : null}
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
            onOpen={open}
            onActions={setActionsFor}
          />
        )}
      />
      <ChatActionsSheet chat={actionsFor} onClose={() => setActionsFor(null)} />
    </Screen>
  );
}
