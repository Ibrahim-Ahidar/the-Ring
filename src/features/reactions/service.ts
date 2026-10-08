import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import type { ReactionRow } from "./types";

type DbReactionRow = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

function mapRow(row: DbReactionRow): ReactionRow {
  return {
    message_id: row.message_id,
    user_id: row.user_id,
    emoji: row.emoji,
    created_at: row.created_at,
  };
}

function firstRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) {
    return null;
  }
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data;
}

function mapRows(data: DbReactionRow | DbReactionRow[] | null): ReactionRow[] {
  if (data == null) {
    return [];
  }
  const rows = Array.isArray(data) ? data : [data];
  return rows.map(mapRow);
}

export async function addReaction(
  rpc: RpcClient,
  input: { messageId: string; emoji: string },
): Promise<Result<ReactionRow>> {
  const result = await callRpc<DbReactionRow | DbReactionRow[]>(rpc, "add_reaction", {
    p_message_id: input.messageId,
    p_emoji: input.emoji,
  });
  if (!result.ok) {
    return result;
  }
  const row = firstRow(result.value);
  if (!row) {
    return err("platform.unexpected");
  }
  return ok(mapRow(row));
}

export async function removeReaction(
  rpc: RpcClient,
  input: { messageId: string; emoji: string },
): Promise<Result<void>> {
  return callRpc<void>(rpc, "remove_reaction", {
    p_message_id: input.messageId,
    p_emoji: input.emoji,
  });
}

export async function listReactions(
  rpc: RpcClient,
  input: { conversationId: string; messageIds: string[] },
): Promise<Result<ReactionRow[]>> {
  if (input.messageIds.length === 0) {
    return ok([]);
  }
  const result = await callRpc<DbReactionRow[]>(rpc, "list_reactions", {
    p_conversation_id: input.conversationId,
    p_message_ids: input.messageIds,
  });
  if (!result.ok) {
    return result;
  }
  return ok(mapRows(result.value));
}
