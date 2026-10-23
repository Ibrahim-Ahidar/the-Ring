import { callRpc, type RpcClient } from "./rpc";
import { err, ok, type Result } from "./result";

import type { ChatFolder, MembershipOrganization } from "./organization-types";

type DbMembershipRow = {
  pinned_at: string | null;
  muted_until: string | null;
  archived_at: string | null;
};

type DbFolderRow = {
  id: string;
  name: string;
  folder_position: number;
};

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data;
}

function mapMembership(row: DbMembershipRow): MembershipOrganization {
  return {
    pinnedAt: row.pinned_at,
    mutedUntil: row.muted_until,
    archivedAt: row.archived_at,
  };
}

function mapFolder(row: DbFolderRow): ChatFolder {
  return {
    id: row.id,
    name: row.name,
    position: row.folder_position,
  };
}

async function membershipRpc(
  rpc: RpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<Result<MembershipOrganization>> {
  const result = await callRpc<DbMembershipRow[]>(rpc, fn, args);
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("organization.not_found");
  }
  return ok(mapMembership(row));
}

export async function pinConversation(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<MembershipOrganization>> {
  return membershipRpc(rpc, "pin_conversation", {
    p_conversation_id: conversationId,
  });
}

export async function unpinConversation(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<MembershipOrganization>> {
  return membershipRpc(rpc, "unpin_conversation", {
    p_conversation_id: conversationId,
  });
}

export async function archiveConversation(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<MembershipOrganization>> {
  return membershipRpc(rpc, "archive_conversation", {
    p_conversation_id: conversationId,
  });
}

export async function unarchiveConversation(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<MembershipOrganization>> {
  return membershipRpc(rpc, "unarchive_conversation", {
    p_conversation_id: conversationId,
  });
}

export async function muteConversation(
  rpc: RpcClient,
  input: { conversationId: string; until: string },
): Promise<Result<MembershipOrganization>> {
  return membershipRpc(rpc, "mute_conversation", {
    p_conversation_id: input.conversationId,
    p_muted_until: input.until,
  });
}

export async function unmuteConversation(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<MembershipOrganization>> {
  return membershipRpc(rpc, "unmute_conversation", {
    p_conversation_id: conversationId,
  });
}

export async function listFolders(rpc: RpcClient): Promise<Result<ChatFolder[]>> {
  const result = await callRpc<DbFolderRow[]>(rpc, "list_chat_folders", {});
  if (!result.ok) {
    return result;
  }
  return ok((result.value ?? []).map(mapFolder));
}

export async function createFolder(
  rpc: RpcClient,
  name: string,
): Promise<Result<ChatFolder>> {
  const result = await callRpc<DbFolderRow[]>(rpc, "create_chat_folder", {
    p_name: name,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapFolder(row));
}

export async function renameFolder(
  rpc: RpcClient,
  input: { folderId: string; name: string },
): Promise<Result<ChatFolder>> {
  const result = await callRpc<DbFolderRow[]>(rpc, "rename_chat_folder", {
    p_folder_id: input.folderId,
    p_name: input.name,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("organization.not_found");
  }
  return ok(mapFolder(row));
}

export async function deleteFolder(
  rpc: RpcClient,
  folderId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "delete_chat_folder", {
    p_folder_id: folderId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function reorderFolders(
  rpc: RpcClient,
  folderIds: string[],
): Promise<Result<ChatFolder[]>> {
  const result = await callRpc<DbFolderRow[]>(rpc, "reorder_chat_folders", {
    p_folder_ids: folderIds,
  });
  if (!result.ok) {
    return result;
  }
  return ok((result.value ?? []).map(mapFolder));
}

export async function moveToFolder(
  rpc: RpcClient,
  input: { conversationId: string; folderId: string },
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "move_conversation_to_folder", {
    p_conversation_id: input.conversationId,
    p_folder_id: input.folderId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function removeFromFolder(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "remove_conversation_from_folder", {
    p_conversation_id: conversationId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function clearChat(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<null>> {
  const result = await callRpc<unknown>(rpc, "clear_chat", {
    p_conversation_id: conversationId,
  });
  return result.ok ? ok(null) : result;
}

export async function deleteChatForMe(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<null>> {
  const result = await callRpc<unknown>(rpc, "delete_chat_for_me", {
    p_conversation_id: conversationId,
  });
  return result.ok ? ok(null) : result;
}

export async function setConversationUnread(
  rpc: RpcClient,
  input: { conversationId: string; unread: boolean },
): Promise<Result<null>> {
  const result = await callRpc<unknown>(rpc, "set_conversation_unread", {
    p_conversation_id: input.conversationId,
    p_unread: input.unread,
  });
  return result.ok ? ok(null) : result;
}
