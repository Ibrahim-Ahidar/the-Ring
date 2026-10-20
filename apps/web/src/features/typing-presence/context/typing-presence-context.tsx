"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { onComposerActivity } from "@/platform/composer-events";
import { asRpcClient } from "@/platform/rpc";
import { joinConversation, type TopicHandle } from "@/platform/realtime-hub";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import { clearTyping, setTypingEvent } from "@/platform/typing-store";

import { usePeerOnline } from "@/features/typing-presence/use-peer-online";
import { fetchSubjectPresence } from "@/features/typing-presence/service";
import type { SubjectPresenceRow } from "@/features/typing-presence/presence";

const TYPING_IDLE_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 3000;
const SUBJECT_REFETCH_DEBOUNCE_MS = 1000;

/** Typing lives in `@/platform/typing-store`, so it never re-renders this context. */
type TypingPresenceContextValue = {
  subjectPresence: SubjectPresenceRow | null;
  subjectOnline: boolean;
  viewerId: string | null;
  conversationId: string;
};

const TypingPresenceContext = createContext<TypingPresenceContextValue | null>(
  null,
);

export function useTypingPresence(): TypingPresenceContextValue {
  const value = useContext(TypingPresenceContext);
  if (!value) {
    throw new Error("useTypingPresence requires TypingPresenceProvider");
  }
  return value;
}

type ProviderProps = {
  conversationId: string;
  otherUserId?: string;
  children: ReactNode;
};

type Action =
  | { type: "presence_row"; row: SubjectPresenceRow | null }
  | { type: "viewer"; userId: string };

type State = {
  subjectPresence: SubjectPresenceRow | null;
  viewerId: string | null;
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "presence_row":
      return { ...state, subjectPresence: action.row };
    case "viewer":
      return { ...state, viewerId: action.userId };
    default:
      return state;
  }
}

export function TypingPresenceProvider({
  conversationId,
  otherUserId,
  children,
}: ProviderProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const rpc = useMemo(() => asRpcClient(supabase), [supabase]);
  const channelRef = useRef<TopicHandle | null>(null);

  const [state, dispatch] = useReducer(reducer, {
    subjectPresence: null,
    viewerId: null,
  });

  // The channel effect reads these through refs so it never re-runs (and the
  // peer never sees us flap) when the subject row or peer id changes.
  const otherUserIdRef = useRef(otherUserId);
  const subjectPresenceRef = useRef(state.subjectPresence);
  useEffect(() => {
    otherUserIdRef.current = otherUserId;
    subjectPresenceRef.current = state.subjectPresence;
  });

  const nameCacheRef = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) {
        return;
      }
      dispatch({ type: "viewer", userId: data.user.id });
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!otherUserId || !state.viewerId) {
      return;
    }

    let cancelled = false;
    void fetchSubjectPresence(rpc, conversationId, otherUserId).then(
      (result) => {
        if (!cancelled && result.ok) {
          dispatch({ type: "presence_row", row: result.value });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [conversationId, otherUserId, rpc, state.viewerId]);

  useEffect(() => {
    if (!state.viewerId) {
      return;
    }

    const viewerId = state.viewerId;
    const handle = joinConversation(supabase, conversationId, viewerId);
    channelRef.current = handle;
    let disposed = false;
    // Bumped on every stop so a slow name lookup cannot resurrect a typer.
    const stopSeq = new Map<string, number>();

    const refetchSubject = () => {
      const peer = otherUserIdRef.current;
      if (!peer) {
        return;
      }
      void fetchSubjectPresence(rpc, conversationId, peer).then((result) => {
        if (!disposed && result.ok) {
          dispatch({ type: "presence_row", row: result.value });
        }
      });
    };

    const cachedName = (userId: string): string | null => {
      const cached = nameCacheRef.current.get(userId);
      if (cached) {
        return cached;
      }
      const subject = subjectPresenceRef.current?.display_name;
      if (otherUserIdRef.current === userId && subject) {
        nameCacheRef.current.set(userId, subject);
        return subject;
      }
      return null;
    };

    const removeBroadcast = handle.onBroadcast((event, payload) => {
      const userId = payload.userId;
      if (typeof userId !== "string" || userId === viewerId) {
        return;
      }
      const activity =
        event === "typing.started" || event === "typing.stopped"
          ? "typing"
          : event === "recording.started" || event === "recording.stopped"
            ? "recording"
            : null;
      if (!activity) {
        return;
      }
      if (event.endsWith(".started")) {
        const name = cachedName(userId);
        if (name) {
          // Synchronous when cached, so a later "stopped" cannot be overtaken.
          setTypingEvent(conversationId, {
            type: "started",
            userId,
            displayName: name,
            activity,
          });
          return;
        }
        const seq = stopSeq.get(userId) ?? 0;
        void fetchSubjectPresence(rpc, conversationId, userId).then((result) => {
          const fetched = result.ok ? result.value?.display_name : null;
          if (fetched) {
            nameCacheRef.current.set(userId, fetched);
          }
          if (disposed || (stopSeq.get(userId) ?? 0) !== seq) {
            return;
          }
          setTypingEvent(conversationId, {
            type: "started",
            userId,
            displayName: fetched || userId.slice(0, 8),
            activity,
          });
        });
      } else {
        stopSeq.set(userId, (stopSeq.get(userId) ?? 0) + 1);
        setTypingEvent(conversationId, { type: "stopped", userId, activity });
      }
    });

    const removeStatus = handle.onStatus((status) => {
      if (status === "SUBSCRIBED") {
        refetchSubject();
      }
    });

    return () => {
      disposed = true;
      removeBroadcast();
      removeStatus();
      handle.leave();
      channelRef.current = null;
      clearTyping(conversationId);
    };
  }, [conversationId, rpc, state.viewerId, supabase]);

  useEffect(() => {
    if (!state.viewerId) {
      return;
    }

    const viewerId = state.viewerId;
    let isComposing = false;
    let lastBroadcastAt = 0;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const sendStopped = () => {
      const handle = channelRef.current;
      if (!handle) {
        return;
      }
      void handle.send("typing.stopped", { conversationId, userId: viewerId });
    };

    const sendStarted = () => {
      const handle = channelRef.current;
      if (!handle) {
        return;
      }
      const now = Date.now();
      if (now - lastBroadcastAt < TYPING_BROADCAST_THROTTLE_MS) {
        return;
      }
      lastBroadcastAt = now;
      void handle.send("typing.started", { conversationId, userId: viewerId });
    };

    let recording = false;
    let recordingTimer: ReturnType<typeof setInterval> | null = null;

    const sendRecording = () => {
      const handle = channelRef.current;
      if (!handle) {
        return;
      }
      void handle.send("recording.started", { conversationId, userId: viewerId });
    };

    const stopRecording = () => {
      if (recordingTimer !== null) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }
      if (!recording) {
        return;
      }
      recording = false;
      const handle = channelRef.current;
      if (handle) {
        void handle.send("recording.stopped", { conversationId, userId: viewerId });
      }
    };

    const clearIdle = () => {
      if (idleTimer !== null) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
    };

    const scheduleIdle = () => {
      clearIdle();
      idleTimer = setTimeout(() => {
        isComposing = false;
        sendStopped();
      }, TYPING_IDLE_MS);
    };

    const removeComposer = onComposerActivity((activity) => {
      if (activity.conversationId !== conversationId) {
        return;
      }

      if (activity.kind === "recording") {
        if (activity.active) {
          if (!recording) {
            recording = true;
            sendRecording();
            // Repeat so late joiners see it and the peer's entry never expires.
            recordingTimer = setInterval(
              sendRecording,
              TYPING_BROADCAST_THROTTLE_MS,
            );
          }
        } else {
          stopRecording();
        }
        return;
      }

      if (activity.kind === "closed") {
        stopRecording();
      }

      if (activity.kind === "closed" || activity.kind === "sent") {
        clearIdle();
        isComposing = false;
        sendStopped();
        return;
      }

      if (activity.kind === "input") {
        if (activity.isEmpty) {
          clearIdle();
          if (isComposing) {
            isComposing = false;
            sendStopped();
          }
          return;
        }

        isComposing = true;
        sendStarted();
        scheduleIdle();
      }
    });

    return () => {
      removeComposer();
      clearIdle();
      stopRecording();
      if (isComposing) {
        sendStopped();
      }
    };
  }, [conversationId, state.viewerId]);

  const peerOnline = usePeerOnline(otherUserId, state.viewerId);
  const subjectOnline =
    otherUserId != null &&
    state.subjectPresence?.presence_allowed === true &&
    peerOnline;

  // The peer just went offline: their last_seen_at moved, refresh once.
  const prevPeerOnline = useRef(false);
  useEffect(() => {
    const was = prevPeerOnline.current;
    prevPeerOnline.current = peerOnline;
    if (!was || peerOnline || !otherUserId || !state.viewerId) {
      return;
    }
    const timer = setTimeout(() => {
      void fetchSubjectPresence(rpc, conversationId, otherUserId).then(
        (result) => {
          if (result.ok) {
            dispatch({ type: "presence_row", row: result.value });
          }
        },
      );
    }, SUBJECT_REFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [peerOnline, otherUserId, state.viewerId, conversationId, rpc]);

  const value = useMemo(
    (): TypingPresenceContextValue => ({
      subjectPresence: state.subjectPresence,
      subjectOnline,
      viewerId: state.viewerId,
      conversationId,
    }),
    [state.subjectPresence, state.viewerId, subjectOnline, conversationId],
  );

  return (
    <TypingPresenceContext.Provider value={value}>
      {children}
    </TypingPresenceContext.Provider>
  );
}
