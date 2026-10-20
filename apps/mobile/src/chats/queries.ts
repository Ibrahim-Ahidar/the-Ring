import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  getChat,
  listChatMessages,
  listChats,
  markChatDelivered,
  markChatRead,
  newClientId,
  sendChatText,
  subscribeChat,
  subscribeChatList,
} from "@/data";

const chatsKey = ["chats"] as const;
const chatKey = (id: string) => ["chat", id] as const;
const messagesKey = (id: string) => ["messages", id] as const;

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

/** Chat list pages; refreshes on inbox realtime changes. */
export function useChatList(userId: string) {
  const queryClient = useQueryClient();
  useEffect(
    () => subscribeChatList(userId, () => void queryClient.invalidateQueries({ queryKey: chatsKey })),
    [userId, queryClient],
  );
  return useInfiniteQuery({
    queryKey: chatsKey,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => unwrap(await listChats(pageParam)),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useChatDetail(conversationId: string) {
  return useQuery({
    queryKey: chatKey(conversationId),
    queryFn: async () => unwrap(await getChat(conversationId)),
  });
}

/** Message pages (newest first, older pages follow); refetches on conversation realtime changes. */
export function useChatMessages(conversationId: string) {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeChat(conversationId, () => {
        void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
        void queryClient.invalidateQueries({ queryKey: chatKey(conversationId) });
        void queryClient.invalidateQueries({ queryKey: chatsKey });
      }),
    [conversationId, queryClient],
  );
  return useInfiniteQuery({
    queryKey: messagesKey(conversationId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => unwrap(await listChatMessages(conversationId, pageParam)),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useSendText(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) =>
      unwrap(await sendChatText({ conversationId, clientId: newClientId(), body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatsKey });
    },
  });
}

/** Marks the conversation delivered and read up to `newestIncomingId` whenever it changes. */
export function useMarkRead(conversationId: string, newestIncomingId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!newestIncomingId) return;
    let active = true;
    void (async () => {
      await markChatDelivered(conversationId);
      const result = await markChatRead(conversationId, newestIncomingId);
      if (active && result.ok) {
        void queryClient.invalidateQueries({ queryKey: chatsKey });
      }
    })();
    return () => {
      active = false;
    };
  }, [conversationId, newestIncomingId, queryClient]);
}
