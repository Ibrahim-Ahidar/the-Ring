"use server";

import { getSessionContext } from "@/platform/session";
import { err, type Result } from "@pulse/core/result";

import * as requests from "./service";

export async function createRequestAction(input: {
  username: string;
  note?: string | null;
}): Promise<Result<{ id: string }>> {
  const session = await getSessionContext();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return requests.createRequest(session.rpc, input);
}

export async function acceptRequestAction(
  requestId: string,
): Promise<Result<{ conversationId: string }>> {
  const session = await getSessionContext();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return requests.acceptRequest(session.rpc, requestId);
}

export async function declineRequestAction(requestId: string): Promise<Result<void>> {
  const session = await getSessionContext();
  if (!session) {
    return err("platform.unauthenticated");
  }
  return requests.declineRequest(session.rpc, requestId);
}
