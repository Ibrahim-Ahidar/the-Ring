import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  addChatReaction,
  getAttachmentUrl,
  listMessageAttachments,
  sendChatMedia,
  type MediaUploadInput,
  deleteChatMessageForEveryone,
  editChatMessage,
  getChat,
  listChatReactions,
  removeChatReaction,
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
const reactionsKey = (id: string) => ["reactions", id] as const;

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
        void queryClient.invalidateQueries({ queryKey: reactionsKey(conversationId) });
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
    mutationFn: async (input: { body: string; replyToId?: string | null }) =>
      unwrap(
        await sendChatText({
          conversationId,
          clientId: newClientId(),
          body: input.body,
          replyToId: input.replyToId ?? null,
        }),
      ),
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

/** Reactions for the loaded messages, keyed by message id order. */
export function useReactions(conversationId: string, messageIds: string[]) {
  return useQuery({
    queryKey: [...reactionsKey(conversationId), messageIds.join(",")],
    queryFn: async () => unwrap(await listChatReactions(conversationId, messageIds)),
    enabled: messageIds.length > 0,
    placeholderData: (prev) => prev,
  });
}

/** Edit, delete-for-everyone and reaction toggles; each refreshes messages and reactions. */
export function useMessageActions(conversationId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
    void queryClient.invalidateQueries({ queryKey: reactionsKey(conversationId) });
    void queryClient.invalidateQueries({ queryKey: chatsKey });
  };
  const edit = useMutation({
    mutationFn: async (v: { messageId: string; body: string }) =>
      unwrap(await editChatMessage(v.messageId, v.body)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (messageId: string) => unwrap(await deleteChatMessageForEveryone(messageId)),
    onSuccess: refresh,
  });
  const react = useMutation({
    mutationFn: async (v: { messageId: string; emoji: string; op: "add" | "remove" }) =>
      unwrap(
        v.op === "add"
          ? await addChatReaction(v.messageId, v.emoji)
          : await removeChatReaction(v.messageId, v.emoji),
      ),
    onSuccess: refresh,
  });
  return { edit, remove, react };
}

/** Picks up an image or voice note from a local URI and sends it as a media message. */
export function useSendMedia(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<MediaUploadInput, "conversationId" | "clientId">) =>
      unwrap(await sendChatMedia({ ...input, conversationId, clientId: newClientId() })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messagesKey(conversationId) });
      void queryClient.invalidateQueries({ queryKey: chatsKey });
    },
  });
}

/** The attachment and a signed URL for one image or audio message. */
export function useMessageMedia(messageId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["media", messageId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const list = unwrap(await listMessageAttachments(messageId));
      const attachment = list[0];
      if (!attachment) throw new Error("media.missing");
      const { url } = unwrap(await getAttachmentUrl(attachment.id));
      return { attachment, url };
    },
  });
}
