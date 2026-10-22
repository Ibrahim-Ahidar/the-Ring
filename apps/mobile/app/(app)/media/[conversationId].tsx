import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Download, File, Image as ImageIcon, Link2 } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useTranslations } from "use-intl";

import { getAttachmentUrl, listSharedItems, sharedNextCursor, type SharedItem, type SharedTab } from "@/data";
import { AppHeader, Button, ErrorState, Icon, IconButton, ListRow, LoadingState, Screen, Text, useTheme } from "@/ui";

const TABS: SharedTab[] = ["media", "files", "links"];

/** Mirrors the web /app/media/[conversationId] SharedMediaBrowser: media grid, files list, links list. */
export default function SharedMediaScreen() {
  const t = useTranslations("mobile.sharedMedia");
  const router = useRouter();
  const { colors, spacing, radii } = useTheme();
  const { conversationId = "" } = useLocalSearchParams<{ conversationId: string }>();
  const [tab, setTab] = useState<SharedTab>("media");

  const query = useInfiniteQuery({
    queryKey: ["shared", conversationId, tab],
    enabled: Boolean(conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const result = await listSharedItems({ conversationId, tab, cursor: pageParam });
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    },
    getNextPageParam: (page) => (page.hasMore ? sharedNextCursor(page.items) : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const open = async (item: SharedItem) => {
    if (item.item_type === "links" && item.url) return void Linking.openURL(item.url);
    if (!item.attachment_id) return;
    const result = await getAttachmentUrl(item.attachment_id);
    if (result.ok) void Linking.openURL(result.value.url);
  };

  const back = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: "/chats/[id]", params: { id: conversationId } });

  let body;
  if (query.isPending) body = <LoadingState />;
  else if (query.isError) body = <ErrorState onRetry={() => void query.refetch()} />;
  else if (items.length === 0)
    body = (
      <Text tone="textMuted" style={{ padding: spacing.s16, textAlign: "center" }}>
        {t(`empty.${tab}`)}
      </Text>
    );
  else if (tab === "media")
    body = (
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.s4, padding: spacing.s16 }}>
        {items.map((item) => (
          <Pressable
            key={`${item.message_id}-${item.attachment_id}`}
            accessibilityRole="button"
            accessibilityLabel={item.file_name ?? t("openImage")}
            onPress={() => void open(item)}
            style={{
              width: "32%",
              aspectRatio: 1,
              borderRadius: radii.control,
              backgroundColor: colors.input,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon icon={ImageIcon} size={24} tone="textMuted" />
          </Pressable>
        ))}
      </View>
    );
  else
    body = items.map((item) => (
      <ListRow
        key={`${item.message_id}-${item.attachment_id ?? item.url}`}
        title={tab === "links" ? (item.url ?? "") : (item.file_name ?? t("download"))}
        leading={<Icon icon={tab === "links" ? Link2 : File} size={20} tone="icon" />}
        onPress={() => void open(item)}
        trailing={
          tab === "files" ? <IconButton icon={Download} size="sm" label={t("download")} onPress={() => void open(item)} /> : undefined
        }
      />
    ));

  return (
    <Screen edges={["bottom", "start", "end"]} background="panel">
      <AppHeader title={t("sharedMedia")} onBack={back} />
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t("sharedTabs")}
        style={{ flexDirection: "row", gap: spacing.s8, paddingHorizontal: spacing.s16, paddingVertical: spacing.s8 }}
      >
        {TABS.map((key) => {
          const selected = key === tab;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setTab(key)}
              style={{
                paddingHorizontal: spacing.s12,
                paddingVertical: spacing.s4,
                borderRadius: radii.pill,
                borderWidth: 1,
                borderColor: selected ? colors.accent : colors.border,
                backgroundColor: selected ? colors.accent : "transparent",
              }}
            >
              <Text variant="label" style={{ color: selected ? colors.accentContrast : colors.text }}>
                {t(`tabs.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.s24 }}>
        {body}
        {query.hasNextPage ? (
          <View style={{ padding: spacing.s16 }}>
            <Button
              title={query.isFetchingNextPage ? t("loading") : t("loadMore")}
              variant="secondary"
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
