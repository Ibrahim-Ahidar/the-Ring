"use server";

import { getSessionContext } from "@/platform/session";

import {
  acceptRequest,
  countPendingIncoming,
  createRequest,
  declineRequest,
  listIncoming,
  listOutgoing,
} from "./service";

export async function createRequestAction(input: {
  username: string;
  note?: string | null;
}) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return createRequest(session.rpc, input);
}

export async function listIncomingAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listIncoming(session.rpc);
}

export async function listOutgoingAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return listOutgoing(session.rpc);
}

export async function countPendingIncomingAction() {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return countPendingIncoming(session.rpc);
}

export async function acceptRequestAction(requestId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return acceptRequest(session.rpc, requestId);
}

export async function declineRequestAction(requestId: string) {
  const session = await getSessionContext();
  if (!session) {
    return { ok: false as const, error: { code: "platform.unauthenticated" } };
  }
  return declineRequest(session.rpc, requestId);
}
