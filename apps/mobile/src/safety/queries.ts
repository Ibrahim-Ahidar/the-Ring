import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  acceptMessageRequest,
  blockChatUser,
  getPrivacySettings,
  listMyReportRows,
  updatePrivacySettings,
  type PrivacyPatch,
  type PrivacySettings,
  declineMessageRequest,
  listBlockedUsers,
  listMessageRequests,
  listSentMessageRequests,
  reportChatUser,
  unblockChatUser,
  type ReportCategory,
  unwrap,
} from "@/data";

export function useMessageRequests() {
  return useQuery({ queryKey: ["message-requests"], queryFn: async () => unwrap(await listMessageRequests()) });
}

export function useSentMessageRequests() {
  return useQuery({ queryKey: ["message-requests", "sent"], queryFn: async () => unwrap(await listSentMessageRequests()) });
}

export function useRequestActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["message-requests"] });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  };
  return {
    accept: useMutation({
      mutationFn: async (id: string) => unwrap(await acceptMessageRequest(id)),
      onSuccess: refresh,
    }),
    decline: useMutation({
      mutationFn: async (id: string) => unwrap(await declineMessageRequest(id)),
      onSuccess: refresh,
    }),
  };
}

export function useBlocks() {
  return useQuery({ queryKey: ["blocks"], queryFn: async () => unwrap(await listBlockedUsers()) });
}

export function useSafetyActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["blocks"] });
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
  };
  return {
    block: useMutation({
      mutationFn: async (userId: string) => unwrap(await blockChatUser(userId)),
      onSuccess: refresh,
    }),
    unblock: useMutation({
      mutationFn: async (userId: string) => unwrap(await unblockChatUser(userId)),
      onSuccess: refresh,
    }),
    report: useMutation({
      mutationFn: async (input: { userId: string; category: ReportCategory }) =>
        unwrap(await reportChatUser(input.userId, input.category)),
    }),
  };
}

export function usePrivacy() {
  return useQuery({ queryKey: ["privacy"], queryFn: async () => unwrap(await getPrivacySettings()) });
}

export function useMyReports() {
  return useQuery({ queryKey: ["myReports"], queryFn: async () => unwrap(await listMyReportRows()) });
}

/** Saves one privacy field optimistically, like the web SafetyProvider, rolling back on error. */
export function useUpdatePrivacy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PrivacyPatch) => unwrap(await updatePrivacySettings(patch)),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ["privacy"] });
      const previous = queryClient.getQueryData<PrivacySettings>(["privacy"]);
      if (previous) queryClient.setQueryData(["privacy"], { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(["privacy"], context.previous);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["privacy"] }),
  });
}
