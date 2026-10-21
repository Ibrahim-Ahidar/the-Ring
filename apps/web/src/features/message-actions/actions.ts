"use server";

import { getSessionContext } from "@/platform/session";
import type { Result } from "@pulse/core/result";
import type { TimelineMessage } from "@pulse/core/timeline";

import {
  deleteForEveryone,
  editMessage,
  forwardMessage,
  hideMessage,
  pinMessage,
  unpinMessage,
} from "./service";

async function requireRpc() {
  return getSessionContext();
}

export async function editMessageAction(input: {
  messageId: string;
  body: string;
}): Promise<Result<TimelineMessage>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return editMessage(session.rpc, input);
}

export async function hideMessageAction(input: {
  messageId: string;
}): Promise<Result<void>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return hideMessage(session.rpc, input);
}

export async function deleteForEveryoneAction(input: {
  messageId: string;
}): Promise<Result<TimelineMessage>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return deleteForEveryone(session.rpc, input);
}

export async function forwardMessageAction(input: {
  sourceMessageId: string;
  targetConversationId: string;
  clientId: string;
}): Promise<Result<TimelineMessage>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return forwardMessage(session.rpc, input);
}

export async function pinMessageAction(input: {
  messageId: string;
}): Promise<Result<TimelineMessage>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return pinMessage(session.rpc, input);
}

export async function unpinMessageAction(input: {
  messageId: string;
}): Promise<Result<TimelineMessage>> {
  const session = await requireRpc();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return unpinMessage(session.rpc, input);
}
