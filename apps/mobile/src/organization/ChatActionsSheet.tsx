import { Archive, ArchiveRestore, FolderInput, FolderMinus } from "lucide-react-native";
import { useTranslations } from "use-intl";

import type { ChatFolder, ConversationSummary } from "@/data";
import { useChatOrganization, useFolders } from "@/organization/queries";
import { ListRow, Sheet } from "@/ui";

type Props = { chat: ConversationSummary | null; onClose: () => void };

/** Long-press menu for a chat row: archive or unarchive, and folder membership. */
export function ChatActionsSheet({ chat, onClose }: Props) {
  const t = useTranslations();
  const folders = useFolders();
  const org = useChatOrganization();

  function run(action: () => Promise<unknown>) {
    void action()
      .catch(() => undefined)
      .finally(onClose);
  }

  return (
    <Sheet visible={chat !== null} onClose={onClose} closeLabel={t("mobile.organization.cancel")}>
      {chat ? (
        <>
          <ListRow
            icon={chat.archived_at ? ArchiveRestore : Archive}
            title={chat.archived_at ? t("mobile.organization.unarchive") : t("mobile.organization.archive")}
            onPress={() =>
              run(() => (chat.archived_at ? org.unarchive.mutateAsync(chat.id) : org.archive.mutateAsync(chat.id)))
            }
          />
          {(folders.data ?? []).map((f: ChatFolder) => (
            <ListRow
              key={f.id}
              icon={FolderInput}
              title={t("mobile.organization.moveTo", { name: f.name })}
              onPress={() => run(() => org.move.mutateAsync({ conversationId: chat.id, folderId: f.id }))}
            />
          ))}
          <ListRow
            icon={FolderMinus}
            title={t("mobile.organization.removeFromFolder")}
            onPress={() => run(() => org.removeFromFolder.mutateAsync(chat.id))}
          />
          <ListRow title={t("mobile.organization.cancel")} onPress={onClose} />
        </>
      ) : null}
    </Sheet>
  );
}
