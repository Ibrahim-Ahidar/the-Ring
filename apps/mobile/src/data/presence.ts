import {
  fetchPeerOnline,
  readSubjectPresence,
  touchLastSeen,
  type Result,
  type SubjectPresenceRow,
} from "@pulse/core";

import { acquireChatChannel } from "./chat-channel";
import { rpcClient } from "./rpc";

export type TypingBroadcast = {
  event: "typing.started" | "typing.stopped" | "recording.started" | "recording.stopped";
  userId: string;
};

const EVENTS = new Set(["typing.started", "typing.stopped", "recording.started", "recording.stopped"]);

/** Joins the shared conversation channel to send and receive typing broadcasts. */
export function openTypingChannel(
  conversationId: string,
  viewerId: string,
  onEvent: (e: TypingBroadcast) => void,
): { send: (event: TypingBroadcast["event"]) => void; close: () => void } {
  const handle = acquireChatChannel(conversationId, {
    onBroadcast: (event, payload) => {
      const userId = typeof payload.userId === "string" ? payload.userId : null;
      if (!userId || !EVENTS.has(event)) return;
      onEvent({ event: event as TypingBroadcast["event"], userId });
    },
  });
  return {
    send: (event) => handle.send(event, { conversationId, userId: viewerId }),
    close: handle.release,
  };
}

export function touchMyLastSeen(): Promise<Result<boolean>> {
  return touchLastSeen(rpcClient);
}

export function readPeerPresence(
  conversationId: string,
  peerId: string,
): Promise<Result<SubjectPresenceRow | null>> {
  return readSubjectPresence(rpcClient, conversationId, peerId);
}

export function readPeerOnline(peerId: string): Promise<Result<boolean>> {
  return fetchPeerOnline(rpcClient, peerId);
}
