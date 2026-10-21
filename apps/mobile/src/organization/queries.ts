import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  archiveChat,
  createChatFolder,
  deleteChatFolder,
  getArchivedChatsSummary,
  listChatFolders,
  moveChatToFolder,
  removeChatFromFolder,
  renameChatFolder,
  reorderChatFolders,
  unarchiveChat,
} from "@/data";

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const foldersKey = ["folders"] as const;
const archivedKey = ["archived-summary"] as const;

export function useFolders() {
  return useQuery({ queryKey: foldersKey, queryFn: async () => unwrap(await listChatFolders()) });
}

export function useArchivedSummary() {
  return useQuery({ queryKey: archivedKey, queryFn: async () => unwrap(await getArchivedChatsSummary()) });
}

/** Per-chat organization actions. Each one refreshes the chat list and the Archived count. */
export function useChatOrganization() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
    void queryClient.invalidateQueries({ queryKey: archivedKey });
  };
  return {
    archive: useMutation({ mutationFn: async (id: string) => unwrap(await archiveChat(id)), onSuccess: refresh }),
    unarchive: useMutation({ mutationFn: async (id: string) => unwrap(await unarchiveChat(id)), onSuccess: refresh }),
    move: useMutation({
      mutationFn: async (input: { conversationId: string; folderId: string }) =>
        unwrap(await moveChatToFolder(input.conversationId, input.folderId)),
      onSuccess: refresh,
    }),
    removeFromFolder: useMutation({
      mutationFn: async (id: string) => unwrap(await removeChatFromFolder(id)),
      onSuccess: refresh,
    }),
  };
}

/** Folder management (create, rename, reorder, delete). */
export function useFolderActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: foldersKey });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  };
  return {
    create: useMutation({ mutationFn: async (name: string) => unwrap(await createChatFolder(name)), onSuccess: refresh }),
    rename: useMutation({
      mutationFn: async (input: { folderId: string; name: string }) =>
        unwrap(await renameChatFolder(input.folderId, input.name)),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: async (id: string) => unwrap(await deleteChatFolder(id)), onSuccess: refresh }),
    reorder: useMutation({
      mutationFn: async (ids: string[]) => unwrap(await reorderChatFolders(ids)),
      onSuccess: refresh,
    }),
  };
}
