import type { createGroupSender } from "@pulse/core/e2ee/group-sender";
import type { RpcMessageRow } from "@pulse/core/messaging-types";
import { ok, type Result } from "@pulse/core/result";
import { callRpc, type RpcClient } from "@pulse/core/rpc";

import type { TextPayload } from "@/features/direct-messaging/lib/text-outbox";

type GroupMember = { user_id: string; role: string };

/** The `isConversationAdmin` lookup for the receiver: owners and admins may set the state key. */
export function createAdminLookup(client: RpcClient) {
  return async (conversationId: string, userId: string): Promise<boolean> => {
    const res = await callRpc<GroupMember[]>(client, "groups_list_members", {
      p_conversation_id: conversationId,
    });
    if (!res.ok) return false;
    return res.value.some(
      (m) => m.user_id === userId && (m.role === "owner" || m.role === "admin"),
    );
  };
}

/**
 * Routes an encrypted text send: group conversations go through the Megolm group sender,
 * everything else through the 1:1 (Olm) sender. A conversation is a group when `groups_get`
 * answers; `groups.not_found` means it is not one. Any other failure is surfaced so the
 * outbox retries instead of sending a group message down the 1:1 path.
 */
export function createConversationSendRouter(args: {
  client: RpcClient;
  userId: string;
  groupSender: Pick<ReturnType<typeof createGroupSender>, "send">;
  sendDirect(input: TextPayload): Promise<Result<RpcMessageRow>>;
  now?: () => Date;
}): (input: TextPayload) => Promise<Result<RpcMessageRow>> {
  const kinds = new Map<string, boolean>();
  const isGroup = async (conversationId: string): Promise<Result<boolean>> => {
    const known = kinds.get(conversationId);
    if (known !== undefined) return ok(known);
    const res = await callRpc<unknown>(
      args.client,
      "groups_get",
      { p_conversation_id: conversationId },
      { quiet: true },
    );
    if (res.ok) {
      kinds.set(conversationId, true);
      return ok(true);
    }
    if (res.error.code === "groups.not_found") {
      kinds.set(conversationId, false);
      return ok(false);
    }
    return res;
  };

  return async (input) => {
    const group = await isGroup(input.conversationId);
    if (!group.ok) return group;
    if (!group.value) return args.sendDirect(input);
    const now = (args.now?.() ?? new Date()).toISOString();
    const sent = await args.groupSender.send({
      v: 1,
      id: input.clientId,
      conversationId: input.conversationId,
      sentAt: now,
      kind: "text",
      body: input.body,
      ...(input.replyToId ? { replyToId: input.replyToId } : {}),
    });
    if (!sent.ok) return sent;
    return ok({
      id: input.clientId,
      conversation_id: input.conversationId,
      sender_id: args.userId,
      client_id: input.clientId,
      type: "text",
      body: input.body,
      reply_to_id: input.replyToId ?? null,
      created_at: now,
      edited_at: null,
      deleted_at: null,
      deletion_scope: null,
      pinned_at: null,
      forwarded: false,
      metadata: null,
    } as unknown as RpcMessageRow);
  };
}
