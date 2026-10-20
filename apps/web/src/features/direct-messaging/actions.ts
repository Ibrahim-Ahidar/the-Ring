"use server";

import { readPageLimit } from "./page-limit-server";
import { getSessionContext } from "@/platform/session";
import type { Result } from "@pulse/core/result";

import {
  getArchivedSummary,
  getConversation,
  listConversations,
  listMessages,
  markRead,
  markDelivered,
  getConversationReceipts,
  openDirect,
  sendText,
} from "./service";
import type {
  ArchivedSummary,
  ConversationDetail,
  ConversationReceipt,
  ListConversationsResult,
  ListMessagesResult,
} from "./types";
import type { TimelineMessage } from "@pulse/core/timeline";

async function requireRpc() {
  const session = await getSessionContext();
  if (!session) {
    return null;
  }
  return session;
}

export async function openDirectAction(input: {
  username: string;
}): Promise<Result<{ conversationId: string }>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return openDirect(session.rpc, input);
}

export async function sendTextAction(input: {
  conversationId: string;
  clientId: string;
  body: string;
  replyToId?: string | null;
}): Promise<Result<TimelineMessage>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return sendText(session.rpc, input);
}

export async function listConversationsAction(input: {
  cursor?: string | null;
  archivedOnly?: boolean;
  unreadOnly?: boolean;
  folderId?: string | null;
  type?: "direct" | "group" | null;
}): Promise<Result<ListConversationsResult>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return listConversations(session.rpc, input);
}

export async function getArchivedSummaryAction(): Promise<Result<ArchivedSummary>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return getArchivedSummary(session.rpc);
}

export async function listMessagesAction(input: {
  conversationId: string;
  cursor?: string | null;
}): Promise<Result<ListMessagesResult>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return listMessages(session.rpc, { ...input, limit: await readPageLimit() });
}

export async function markReadAction(input: {
  conversationId: string;
  messageId: string;
}): Promise<Result<{ last_read_message_id: string | null; last_read_at: string | null }>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return markRead(session.rpc, input);
}

export async function markDeliveredAction(input: {
  conversationId?: string | null;
}): Promise<Result<null>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return markDelivered(session.rpc, input);
}

export async function getConversationReceiptsAction(input: {
  conversationIds: string[];
}): Promise<Result<Record<string, ConversationReceipt>>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return getConversationReceipts(session.rpc, input);
}

export async function getConversationAction(input: {
  conversationId: string;
}): Promise<Result<ConversationDetail>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return getConversation(session.rpc, input);
}
