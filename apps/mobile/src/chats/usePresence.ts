import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useOnline } from "@/net/useOnline";
import {
  deriveSubtitle,
  initialTypingState,
  openTypingChannel,
  readPeerOnline,
  readPeerPresence,
  reduceTyping,
  touchMyLastSeen,
  visibleTypers,
  type ConversationDetail,
  type Subtitle,
  type TypingState,
} from "@/data";
import { createTypingSender } from "./typing-sender";

const ONLINE_POLL_MS = 30_000;
const HEARTBEAT_MS = 25_000;

/** Typing/recording peers, plus a sender for the viewer's own typing. */
export function useTyping(conversationId: string, viewerId: string, nameOf: (userId: string) => string) {
  const [state, setState] = useState<TypingState>(initialTypingState);
  const [now, setNow] = useState(() => Date.now());
  const sendRef = useRef<((e: "typing.started" | "typing.stopped") => void) | null>(null);
  const nameRef = useRef(nameOf);
  useEffect(() => {
    nameRef.current = nameOf;
  });

  useEffect(() => {
    if (!conversationId || !viewerId) return;
    const open = openTypingChannel(conversationId, viewerId, (e) => {
      const t = Date.now();
      const activity = e.event.startsWith("recording") ? "recording" : "typing";
      setState((s) =>
        e.event.endsWith(".started")
          ? reduceTyping(s, { type: "started", userId: e.userId, displayName: nameRef.current(e.userId), activity }, t, viewerId)
          : reduceTyping(s, { type: "stopped", userId: e.userId, activity }, t, viewerId),
      );
      setNow(t);
    });
    sendRef.current = open.send;
    const tick = setInterval(() => {
      const t = Date.now();
      setState((s) => reduceTyping(s, { type: "expire", now: t }, t, viewerId));
      setNow(t);
    }, 1000);
    return () => {
      clearInterval(tick);
      sendRef.current = null;
      open.close();
    };
  }, [conversationId, viewerId]);

  // The closure only reads the ref when an event is sent, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [sender] = useState(() => createTypingSender({ send: (event) => sendRef.current?.(event) }));
  useEffect(() => () => sender.stop(), [sender]);

  const typers = useMemo(() => visibleTypers(state, now, viewerId), [state, now, viewerId]);
  return { typers, sender };
}

/** Polls the peer's online flag and keeps our own last-seen fresh while online. */
export function useSubtitle(
  detail: ConversationDetail | undefined,
  viewerId: string,
  typers: readonly { userId: string; displayName: string; activity?: "typing" | "recording" }[],
): Subtitle {
  const online = useOnline();
  const peerId = detail?.type === "direct" ? (detail.other_user_id ?? null) : null;
  const conversationId = detail?.id ?? "";

  useEffect(() => {
    if (!online) return;
    void touchMyLastSeen();
    const h = setInterval(() => void touchMyLastSeen(), HEARTBEAT_MS);
    return () => clearInterval(h);
  }, [online]);

  const presence = useQuery({
    queryKey: ["presence", conversationId, peerId],
    enabled: !!peerId && online,
    queryFn: async () => {
      const r = await readPeerPresence(conversationId, peerId!);
      return r.ok ? r.value : null;
    },
    refetchInterval: ONLINE_POLL_MS,
  });
  const peerOnline = useQuery({
    queryKey: ["peer-online", peerId],
    enabled: !!peerId && online,
    queryFn: async () => {
      const r = await readPeerOnline(peerId!);
      return r.ok ? r.value : false;
    },
    refetchInterval: ONLINE_POLL_MS,
  });

  return deriveSubtitle({
    conversationType: detail?.type === "group" ? "group" : "direct",
    otherUserId: peerId ?? undefined,
    viewerId,
    typers,
    subjectPresence: presence.data ?? null,
    subjectOnline: peerOnline.data ?? false,
  });
}
