import { getArchivedSummary } from "@pulse/core";
import {
  archiveConversation,
  createFolder,
  deleteFolder,
  listFolders,
  moveToFolder,
  removeFromFolder,
  renameFolder,
  reorderFolders,
  unarchiveConversation,
} from "@pulse/core/organization";
import type { ChatFolder } from "@pulse/core/organization-types";

import { rpcClient } from "./rpc";

export type { ChatFolder };

export const archiveChat = (conversationId: string) => archiveConversation(rpcClient, conversationId);
export const unarchiveChat = (conversationId: string) => unarchiveConversation(rpcClient, conversationId);
export const getArchivedChatsSummary = () => getArchivedSummary(rpcClient);
export const listChatFolders = () => listFolders(rpcClient);
export const createChatFolder = (name: string) => createFolder(rpcClient, name);
export const renameChatFolder = (folderId: string, name: string) => renameFolder(rpcClient, { folderId, name });
export const deleteChatFolder = (folderId: string) => deleteFolder(rpcClient, folderId);
export const reorderChatFolders = (folderIds: string[]) => reorderFolders(rpcClient, folderIds);
export const moveChatToFolder = (conversationId: string, folderId: string) =>
  moveToFolder(rpcClient, { conversationId, folderId });
export const removeChatFromFolder = (conversationId: string) => removeFromFolder(rpcClient, conversationId);
