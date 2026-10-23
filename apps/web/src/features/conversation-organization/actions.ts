"use server";

import { getSessionContext } from "@/platform/session";

import {
  archiveConversation,
  clearChat,
  createFolder,
  deleteChatForMe,
  deleteFolder,
  listFolders,
  moveToFolder,
  muteConversation,
  pinConversation,
  removeFromFolder,
  renameFolder,
  reorderFolders,
  setConversationUnread,
  unarchiveConversation,
  unmuteConversation,
  unpinConversation,
} from "./service";
import type { MuteDurationKey } from "./types";
import { muteUntilForDuration } from "./mute-until";

async function requireSession() {
  return getSessionContext();
}

export async function pinConversationAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return pinConversation(session.rpc, conversationId);
}

export async function unpinConversationAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return unpinConversation(session.rpc, conversationId);
}

export async function archiveConversationAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return archiveConversation(session.rpc, conversationId);
}

export async function unarchiveConversationAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return unarchiveConversation(session.rpc, conversationId);
}

export async function muteConversationAction(input: {
  conversationId: string;
  duration: MuteDurationKey;
}) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return muteConversation(session.rpc, {
    conversationId: input.conversationId,
    until: muteUntilForDuration(input.duration),
  });
}

export async function unmuteConversationAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return unmuteConversation(session.rpc, conversationId);
}

export async function listFoldersAction() {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listFolders(session.rpc);
}

export async function createFolderAction(name: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return createFolder(session.rpc, name);
}

export async function renameFolderAction(input: { folderId: string; name: string }) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return renameFolder(session.rpc, input);
}

export async function deleteFolderAction(folderId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return deleteFolder(session.rpc, folderId);
}

export async function reorderFoldersAction(folderIds: string[]) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return reorderFolders(session.rpc, folderIds);
}

export async function moveToFolderAction(input: {
  conversationId: string;
  folderId: string;
}) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return moveToFolder(session.rpc, input);
}

export async function removeFromFolderAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return removeFromFolder(session.rpc, conversationId);
}

export async function clearChatAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return clearChat(session.rpc, conversationId);
}

export async function deleteChatAction(conversationId: string) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return deleteChatForMe(session.rpc, conversationId);
}

export async function setConversationUnreadAction(input: {
  conversationId: string;
  unread: boolean;
}) {
  const session = await requireSession();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return setConversationUnread(session.rpc, input);
}
