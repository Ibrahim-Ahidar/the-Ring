import {
  createGroup,
  createInviteLink,
  getGroup,
  inviteMember,
  joinByCode,
  leaveGroup,
  listMembers,
  removeMember,
  setMessagingRestricted,
  setRole,
  transferOwnership,
  updateGroup,
} from "@pulse/core/groups";
import type { FailedInvite } from "@pulse/core/groups";
import type { GroupMember, GroupSummary } from "@pulse/core/groups-types";
import type { Result } from "@pulse/core";

import { rpcClient } from "./rpc";

export type { FailedInvite, GroupMember, GroupSummary };

export function createChatGroup(input: {
  name: string;
  description?: string | null;
  members?: string;
}): Promise<Result<{ conversationId: string; failedInvites: FailedInvite[] }>> {
  return createGroup(rpcClient, input);
}

export const getChatGroup = (conversationId: string) => getGroup(rpcClient, conversationId);
export const listGroupMembers = (conversationId: string) => listMembers(rpcClient, conversationId);
export const updateChatGroup = (input: { conversationId: string; name?: string | null; description?: string | null }) =>
  updateGroup(rpcClient, input);
export const inviteGroupMember = (conversationId: string, username: string) =>
  inviteMember(rpcClient, { conversationId, username });
export const removeGroupMember = (conversationId: string, userId: string) =>
  removeMember(rpcClient, { conversationId, userId });
export const leaveChatGroup = (conversationId: string) => leaveGroup(rpcClient, conversationId);
export const setGroupRole = (input: { conversationId: string; userId: string; role: "member" | "admin" }) =>
  setRole(rpcClient, input);
export const transferGroupOwnership = (input: { conversationId: string; userId: string }) =>
  transferOwnership(rpcClient, input);
export const setGroupMessagingRestricted = (input: { conversationId: string; userId: string; restricted: boolean }) =>
  setMessagingRestricted(rpcClient, input);
export const createGroupInviteLink = (conversationId: string) => createInviteLink(rpcClient, { conversationId });
export const joinGroupByCode = (code: string) => joinByCode(rpcClient, code);
