import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createChatGroup,
  getChatGroup,
  inviteGroupMember,
  leaveChatGroup,
  listGroupMembers,
  removeGroupMember,
  updateChatGroup,
  createGroupInviteLink,
  joinGroupByCode,
  setGroupMessagingRestricted,
  setGroupRole,
  transferGroupOwnership,
  unwrap,
} from "@/data";

const groupKey = (id: string) => ["group", id] as const;
const membersKey = (id: string) => ["group-members", id] as const;

export function useGroup(id: string) {
  return useQuery({ queryKey: groupKey(id), queryFn: async () => unwrap(await getChatGroup(id)) });
}

export function useGroupMembers(id: string) {
  return useQuery({ queryKey: membersKey(id), queryFn: async () => unwrap(await listGroupMembers(id)) });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string | null; members?: string }) =>
      unwrap(await createChatGroup(input)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["chats"] }),
  });
}

export function useGroupActions(id: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: groupKey(id) });
    void queryClient.invalidateQueries({ queryKey: membersKey(id) });
    void queryClient.invalidateQueries({ queryKey: ["chat", id] });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  };
  return {
    update: useMutation({
      mutationFn: async (input: { name: string; description: string | null }) =>
        unwrap(await updateChatGroup({ conversationId: id, ...input })),
      onSuccess: refresh,
    }),
    invite: useMutation({
      mutationFn: async (username: string) => unwrap(await inviteGroupMember(id, username)),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (userId: string) => unwrap(await removeGroupMember(id, userId)),
      onSuccess: refresh,
    }),
    leave: useMutation({
      mutationFn: async () => unwrap(await leaveChatGroup(id)),
      onSuccess: refresh,
    }),
    setRole: useMutation({
      mutationFn: async (input: { userId: string; role: "member" | "admin" }) =>
        unwrap(await setGroupRole({ conversationId: id, ...input })),
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: async (userId: string) => unwrap(await transferGroupOwnership({ conversationId: id, userId })),
      onSuccess: refresh,
    }),
    restrict: useMutation({
      mutationFn: async (input: { userId: string; restricted: boolean }) =>
        unwrap(await setGroupMessagingRestricted({ conversationId: id, ...input })),
      onSuccess: refresh,
    }),
    inviteLink: useMutation({
      mutationFn: async () => unwrap(await createGroupInviteLink(id)),
    }),
  };
}
