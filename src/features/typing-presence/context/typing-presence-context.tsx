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

import {
  fetchSubjectPresence,
  touchLastSeenForMember,
} from "@/features/typing-presence/service";
import type { SubjectPresenceRow } from "@/features/typing-presence/presence";

const TYPING_IDLE_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 3000;
const PRESENCE_HEARTBEAT_MS = 60_000;
const HIDDEN_UNTRACK_MS = 30_000;
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
  | { type: "online_set"; userIds: Set<string> }
  | { type: "viewer"; userId: string };

type State = {
  subjectPresence: SubjectPresenceRow | null;
  onlineUserIds: Set<string>;
  viewerId: string | null;
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "presence_row":
      return { ...state, subjectPresence: action.row };
    case "online_set":
      if (state.onlineUserIds.size === 0 && action.userIds.size === 0) {
        return state;
      }
      return { ...state, onlineUserIds: action.userIds };
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
    onlineUserIds: new Set<string>(),
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
    let subscribed = false;
    let tracked = false;
    let prevHadPeer = false;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    // Bumped on every stop so a slow name lookup cannot resurrect a typer.
    const stopSeq = new Map<string, number>();

    const touch = () => {
      void touchLastSeenForMember(rpc);
    };

    const track = () => {
      if (!subscribed || tracked || disposed) {
        return;
      }
      tracked = true;
      void handle.track({ online: true, at: Date.now() });
    };

    const untrack = () => {
      if (!tracked) {
        return;
      }
      tracked = false;
      void handle.untrack();
    };

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
      if (event === "typing.started") {
        const name = cachedName(userId);
        if (name) {
          // Synchronous when cached, so a later "stopped" cannot be overtaken.
          setTypingEvent(conversationId, {
            type: "started",
            userId,
            displayName: name,
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
          });
        });
      } else if (event === "typing.stopped") {
        stopSeq.set(userId, (stopSeq.get(userId) ?? 0) + 1);
        setTypingEvent(conversationId, { type: "stopped", userId });
      }
    });

    const removePresence = handle.onPresence((presenceState) => {
      if (!subscribed) {
        return;
      }
      const ids = new Set(Object.keys(presenceState));
      dispatch({ type: "online_set", userIds: ids });

      const peer = otherUserIdRef.current;
      const hasPeer = peer != null && ids.has(peer);
      if (prevHadPeer && !hasPeer) {
        // The peer just went offline: their last_seen_at moved, refresh once.
        if (refetchTimer !== null) {
          clearTimeout(refetchTimer);
        }
        refetchTimer = setTimeout(() => {
          refetchTimer = null;
          refetchSubject();
        }, SUBJECT_REFETCH_DEBOUNCE_MS);
      }
      prevHadPeer = hasPeer;
    });

    const removeStatus = handle.onStatus((status) => {
      if (status === "SUBSCRIBED") {
        subscribed = true;
        tracked = false;
        if (document.visibilityState !== "hidden") {
          track();
        }
        touch();
        refetchSubject();
        return;
      }
      subscribed = false;
      tracked = false;
      prevHadPeer = false;
      dispatch({ type: "online_set", userIds: new Set() });
    });

    const onPageHide = () => {
      untrack();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        track();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (hiddenTimer === null) {
          hiddenTimer = setTimeout(() => {
            hiddenTimer = null;
            untrack();
          }, HIDDEN_UNTRACK_MS);
        }
        return;
      }
      if (hiddenTimer !== null) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
      track();
    };

    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);

    touch();
    const heartbeat = window.setInterval(touch, PRESENCE_HEARTBEAT_MS);

    return () => {
      disposed = true;
      window.clearInterval(heartbeat);
      if (hiddenTimer !== null) {
        clearTimeout(hiddenTimer);
      }
      if (refetchTimer !== null) {
        clearTimeout(refetchTimer);
      }
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      removeBroadcast();
      removePresence();
      removeStatus();
      untrack();
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
      if (isComposing) {
        sendStopped();
      }
    };
  }, [conversationId, state.viewerId]);

  const subjectOnline =
    otherUserId != null &&
    state.subjectPresence?.presence_allowed === true &&
    state.onlineUserIds.has(otherUserId);

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
