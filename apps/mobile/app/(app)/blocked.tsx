import { useRouter } from "expo-router";
import { Ban } from "lucide-react-native";
import { FlatList } from "react-native";
import { useTranslations } from "use-intl";

import { useBlocks, useSafetyActions } from "@/safety/queries";
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
} from "@/ui";

export default function BlockedScreen() {
  const t = useTranslations();
  const router = useRouter();
  const blocks = useBlocks();
  const actions = useSafetyActions();

  return (
    <Screen edges={["bottom", "start", "end"]}>
      <AppHeader title={t("mobile.safety.blocked")} onBack={() => router.back()} backLabel={t("mobile.chats.back")} />
      {actions.unblock.isError ? <Banner kind="error" message={t("mobile.safety.error")} /> : null}
      {blocks.isPending ? (
        <LoadingState />
      ) : blocks.isError ? (
        <ErrorState message={t("mobile.safety.error")} onRetry={() => void blocks.refetch()} />
      ) : (
        <FlatList
          data={blocks.data}
          keyExtractor={(b) => b.blockedId}
          contentContainerStyle={{ flexGrow: 1 }}
          ListEmptyComponent={<EmptyState icon={Ban} title={t("mobile.safety.noBlocked")} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.displayName ?? item.username}
              subtitle={`@${item.username}`}
              leading={<Avatar name={item.displayName ?? item.username} seed={item.blockedId} />}
              trailing={
                <Button
                  title={t("mobile.safety.unblock")}
                  variant="secondary"
                  size="sm"
                  onPress={() => actions.unblock.mutate(item.blockedId)}
                />
              }
            />
          )}
        />
      )}
    </Screen>
  );
}
