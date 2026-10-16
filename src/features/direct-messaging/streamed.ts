import type { RpcClient } from "@/platform/rpc";

import type { InboxPage, ThreadPage } from "./lib/streamed-pages";
import { listConversations, listMessages, mapMessageRow } from "./service";

/**
 * Server pages pass these promises to client components un-awaited, so the
 * page frame renders at once and the data streams in behind it. They never
 * reject: a rejected promise would surface as an opaque stream error.
 */

export function streamInbox(
  rpc: RpcClient,
  args: Parameters<typeof listConversations>[1],
): Promise<InboxPage> {
  return listConversations(rpc, args).then(
    (list) => (list.ok ? list.value : { items: [], hasMore: false }),
    (error: unknown) => {
      console.error("[chats] list_conversations threw", error);
      return { items: [], hasMore: false };
    },
  );
}

export function streamThread(rpc: RpcClient, conversationId: string): Promise<ThreadPage> {
  return listMessages(rpc, { conversationId }).then(
    (result): ThreadPage => {
      if (!result.ok) {
        console.error("[chats] list_messages failed", {
          conversationId,
          code: result.error.code,
        });
        return { ok: false, code: result.error.code };
      }
      return {
        ok: true,
        items: result.value.items.map(mapMessageRow),
        hasMore: result.value.hasMore,
      };
    },
    (error: unknown): ThreadPage => {
      console.error("[chats] list_messages threw", { conversationId, error });
      return { ok: false, code: "unexpected" };
    },
  );
}
