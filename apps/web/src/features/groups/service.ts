import { IMAGE_MAX_BYTES, IMAGE_MIME_TYPES, validateAttachment } from "@/platform/media";
import { callRpc, type RpcClient } from "@pulse/core/rpc";
import { err, ok, type Result } from "@pulse/core/result";

import { parseMemberUsernames } from "./lib/member-usernames";
import type { GroupMember, GroupSummary, InviteLink, MemberRole } from "./types";

type DbGroupRow = {
  id: string;
  title: string | null;
  description: string | null;
  avatar_url: string | null;
  my_role: MemberRole;
};

type DbMemberRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: MemberRole;
  joined_at: string;
  messaging_restricted: boolean;
};

type DbInviteLinkRow = {
  id: string;
  code: string;
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

function mapGroup(row: DbGroupRow): GroupSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    avatarUrl: row.avatar_url,
    myRole: row.my_role,
  };
}

function mapMember(row: DbMemberRow): GroupMember {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    joinedAt: row.joined_at,
    messagingRestricted: row.messaging_restricted,
  };
}

async function callVoid(
  rpc: RpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, fn, args);
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export function validateGroupAvatarUpload(
  mimeType: string,
  sizeBytes: number,
): Result<{ kind: "image" }> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return err("groups.avatar_rejected");
  }
  const attachment = validateAttachment({ mimeType, sizeBytes });
  if (!attachment.ok) {
    return err("groups.avatar_rejected");
  }
  if (sizeBytes > IMAGE_MAX_BYTES) {
    return err("groups.avatar_rejected");
  }
  return ok({ kind: "image" });
}

export type FailedInvite = { username: string; code: string };

/**
 * Creates the group with the caller as owner, then adds each listed member.
 * `groups_create` only inserts the owner's membership, so without the invites
 * nobody else is in the group: it never reaches their inbox, realtime, or
 * message fetches (all gated on a `conversation_members` row).
 */
export async function createGroup(
  rpc: RpcClient,
  input: {
    name: string;
    description?: string | null;
    members?: string | readonly string[];
  },
): Promise<Result<{ conversationId: string; failedInvites: FailedInvite[] }>> {
  const result = await callRpc<string>(rpc, "groups_create", {
    p_name: input.name,
    p_description: input.description ?? null,
  });
  if (!result.ok) {
    return result;
  }
  if (!result.value) {
    return err("platform.unexpected");
  }
  const conversationId = result.value;

  const failedInvites: FailedInvite[] = [];
  for (const username of parseMemberUsernames(input.members ?? [])) {
    const invited = await inviteMember(rpc, { conversationId, username });
    if (!invited.ok) {
      failedInvites.push({ username, code: invited.error.code });
    }
  }
  return ok({ conversationId, failedInvites });
}

export async function updateGroup(
  rpc: RpcClient,
  input: {
    conversationId: string;
    name?: string | null;
    description?: string | null;
  },
): Promise<Result<void>> {
  return callVoid(rpc, "groups_update", {
    p_conversation_id: input.conversationId,
    p_name: input.name ?? null,
    p_description: input.description ?? null,
  });
}

export async function setGroupAvatarPath(
  rpc: RpcClient,
  conversationId: string,
  storagePath: string,
): Promise<Result<void>> {
  return callVoid(rpc, "groups_set_avatar_path", {
    p_conversation_id: conversationId,
    p_storage_path: storagePath,
  });
}

export async function getGroup(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<GroupSummary>> {
  const result = await callRpc<DbGroupRow[]>(rpc, "groups_get", {
    p_conversation_id: conversationId,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapGroup(row));
}

export async function listMembers(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<GroupMember[]>> {
  const result = await callRpc<DbMemberRow[]>(rpc, "groups_list_members", {
    p_conversation_id: conversationId,
  });
  if (!result.ok) {
    return result;
  }
  return ok((result.value ?? []).map(mapMember));
}

export async function inviteMember(
  rpc: RpcClient,
  input: { conversationId: string; username: string },
): Promise<Result<void>> {
  return callVoid(rpc, "groups_invite_member", {
    p_conversation_id: input.conversationId,
    p_username: input.username,
  });
}

export async function createInviteLink(
  rpc: RpcClient,
  input: {
    conversationId: string;
    expiresAt?: string | null;
    maxUses?: number | null;
  },
): Promise<Result<InviteLink>> {
  const result = await callRpc<DbInviteLinkRow[]>(rpc, "groups_create_invite_link", {
    p_conversation_id: input.conversationId,
    p_expires_at: input.expiresAt ?? null,
    p_max_uses: input.maxUses ?? null,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok({ id: row.id, code: row.code });
}

export async function revokeInviteLink(
  rpc: RpcClient,
  linkId: string,
): Promise<Result<void>> {
  return callVoid(rpc, "groups_revoke_invite_link", {
    p_link_id: linkId,
  });
}

export async function joinByCode(
  rpc: RpcClient,
  code: string,
): Promise<Result<{ conversationId: string }>> {
  const result = await callRpc<string>(rpc, "groups_join_by_code", {
    p_code: code,
  });
  if (!result.ok) {
    return result;
  }
  if (!result.value) {
    return err("platform.unexpected");
  }
  return ok({ conversationId: result.value });
}

export async function setRole(
  rpc: RpcClient,
  input: {
    conversationId: string;
    userId: string;
    role: "member" | "admin";
  },
): Promise<Result<void>> {
  return callVoid(rpc, "groups_set_role", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
    p_role: input.role,
  });
}

export async function transferOwnership(
  rpc: RpcClient,
  input: { conversationId: string; userId: string },
): Promise<Result<void>> {
  return callVoid(rpc, "groups_transfer_ownership", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
  });
}

export async function setMessagingRestricted(
  rpc: RpcClient,
  input: {
    conversationId: string;
    userId: string;
    restricted: boolean;
  },
): Promise<Result<void>> {
  return callVoid(rpc, "groups_set_messaging_restricted", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
    p_restricted: input.restricted,
  });
}

export async function removeMember(
  rpc: RpcClient,
  input: { conversationId: string; userId: string },
): Promise<Result<void>> {
  return callVoid(rpc, "groups_remove_member", {
    p_conversation_id: input.conversationId,
    p_user_id: input.userId,
  });
}

export async function leaveGroup(
  rpc: RpcClient,
  conversationId: string,
): Promise<Result<void>> {
  return callVoid(rpc, "groups_leave", {
    p_conversation_id: conversationId,
  });
}
