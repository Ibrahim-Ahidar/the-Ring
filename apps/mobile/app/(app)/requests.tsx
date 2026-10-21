import { useRouter } from "expo-router";
import { Inbox } from "lucide-react-native";
import { FlatList, View } from "react-native";
import { useTranslations } from "use-intl";

import { useMessageRequests, useRequestActions } from "@/safety/queries";
import {
  AppHeader,
  Avatar,
  Banner,
  Button,
  EmptyState,
  ErrorState,
  ListRow,
  LoadingState,
  Screen,
  useTheme,
} from "@/ui";

export default function RequestsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { spacing } = useTheme();
  const requests = useMessageRequests();
  const actions = useRequestActions();
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const failed = actions.accept.isError || actions.decline.isError;

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader title={t("mobile.safety.requests")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {failed ? <Banner kind="error" message={t("mobile.safety.error")} /> : null}
      {requests.isPending ? (
        <LoadingState />
      ) : requests.isError ? (
        <ErrorState message={t("mobile.safety.error")} onRetry={() => void requests.refetch()} />
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={Inbox} title={t("mobile.safety.noRequests")} />}
          renderItem={({ item }) => (
            <View>
              <ListRow
                title={item.displayName ?? item.username}
                subtitle={item.note ? `@${item.username} · ${item.note}` : `@${item.username}`}
                subtitleLines={2}
                leading={<Avatar name={item.displayName ?? item.username} seed={item.id} />}
              />
              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.s8,
                  paddingStart: spacing.s16,
                  paddingEnd: spacing.s16,
                  paddingBottom: spacing.s12,
                }}
              >
                <Button
                  title={t("mobile.safety.accept")}
                  size="sm"
                  onPress={() =>
                    actions.accept.mutate(item.id, {
                      onSuccess: (r) => router.replace({ pathname: "/chats/[id]", params: { id: r.conversationId } }),
                    })
                  }
                />
                <Button
                  title={t("mobile.safety.decline")}
                  variant="danger"
                  size="sm"
                  onPress={() => actions.decline.mutate(item.id)}
                />
              </View>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
