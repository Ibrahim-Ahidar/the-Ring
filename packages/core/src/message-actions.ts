import { mapMessageRow } from "./messaging";
import type { RpcMessageRow } from "./messaging-types";
import { err, ok, type Result } from "./result";
import { callRpc, type RpcClient } from "./rpc";
import type { TimelineMessage } from "./timeline";

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

export type MessageAction = "reply" | "react" | "copy" | "edit" | "delete";

type MessageLike = Pick<
  TimelineMessage,
  "id" | "type" | "body" | "sender_id" | "created_at" | "deletion_scope"
>;

function isLiveText(m: MessageLike): boolean {
  return m.type === "text" && m.deletion_scope !== "everyone";
}

function withinWindow(createdAt: string, windowMs: number, now: number): boolean {
  const created = Date.parse(createdAt);
  return !Number.isNaN(created) && now - created <= windowMs;
}

/** Actions for the long-press menu. Edit and delete are for the sender's own messages only. */
export function availableActions(
  m: MessageLike,
  viewerId: string,
  now: number = Date.now(),
): MessageAction[] {
  if (m.deletion_scope === "everyone" || m.id.startsWith("pending-")) return [];
  const mine = m.sender_id === viewerId;
  const actions: MessageAction[] = [];
  if (isLiveText(m)) actions.push("reply");
  actions.push("react");
  if (isLiveText(m) && m.body?.trim()) actions.push("copy");
  if (mine && isLiveText(m) && withinWindow(m.created_at, EDIT_WINDOW_MS, now)) {
    actions.push("edit");
  }
  if (mine && withinWindow(m.created_at, DELETE_EVERYONE_WINDOW_MS, now)) {
    actions.push("delete");
  }
  return actions;
}

async function messageRpc(
  rpc: RpcClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<Result<TimelineMessage>> {
  const result = await callRpc<RpcMessageRow[] | RpcMessageRow | null>(rpc, fn, args);
  if (!result.ok) return result;
  const v = result.value;
  const row = Array.isArray(v) ? v[0] : v;
  return row ? ok(mapMessageRow(row)) : err("platform.unexpected");
}

export function editMessage(
  rpc: RpcClient,
  input: { messageId: string; body: string },
): Promise<Result<TimelineMessage>> {
  const body = input.body.trim();
  if (!body) return Promise.resolve(err("message_actions.invalid_body"));
  return messageRpc(rpc, "edit_message", { p_message_id: input.messageId, p_body: body });
}

export function deleteForEveryone(
  rpc: RpcClient,
  input: { messageId: string },
): Promise<Result<TimelineMessage>> {
  return messageRpc(rpc, "delete_for_everyone", { p_message_id: input.messageId });
}
