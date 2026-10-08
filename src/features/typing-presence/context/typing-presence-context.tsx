"use client";

import {
  createContext,
  useCallback,
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

import {
  fetchSubjectPresence,
  touchLastSeenForMember,
} from "@/features/typing-presence/service";
import {
  initialTypingState,
  reduceTyping,
  type TypingState,
} from "@/features/typing-presence/typing-reducer";
import type { SubjectPresenceRow } from "@/features/typing-presence/presence";

const TYPING_IDLE_MS = 3000;
const TYPING_BROADCAST_THROTTLE_MS = 3000;
const PRESENCE_HEARTBEAT_MS = 60_000;

type TypingPresenceContextValue = {
  typing: TypingState;
  subjectPresence: SubjectPresenceRow | null;
  subjectOnline: boolean;
  viewerId: string | null;
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
  | {
      type: "typing";
      event: Parameters<typeof reduceTyping>[1];
      now: number;
    }
  | { type: "presence_row"; row: SubjectPresenceRow | null }
  | { type: "online_set"; userIds: Set<string> }
  | { type: "viewer"; userId: string };

type State = {
  typing: TypingState;
  subjectPresence: SubjectPresenceRow | null;
  onlineUserIds: Set<string>;
  viewerId: string | null;
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "typing":
      return {
        ...state,
        typing: reduceTyping(
          state.typing,
          action.event,
          action.now,
          state.viewerId ?? undefined,
        ),
      };
    case "presence_row":
      return { ...state, subjectPresence: action.row };
    case "online_set":
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
    typing: initialTypingState,
    subjectPresence: null,
    onlineUserIds: new Set<string>(),
    viewerId: null,
  });

  const nameCacheRef = useRef(new Map<string, string>());

  const resolveDisplayName = useCallback(
    async (userId: string): Promise<string> => {
      const cached = nameCacheRef.current.get(userId);
      if (cached) {
        return cached;
      }
      if (otherUserId === userId && state.subjectPresence?.display_name) {
        nameCacheRef.current.set(userId, state.subjectPresence.display_name);
        return state.subjectPresence.display_name;
      }
      const result = await fetchSubjectPresence(rpc, conversationId, userId);
      if (result.ok && result.value?.display_name) {
        nameCacheRef.current.set(userId, result.value.display_name);
        return result.value.display_name;
      }
      return userId.slice(0, 8);
    },
    [conversationId, otherUserId, rpc, state.subjectPresence?.display_name],
  );

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
    let subscribed = false;

    const touch = () => {
      void touchLastSeenForMember(rpc);
    };

    touch();

    const removeBroadcast = handle.onBroadcast((event, payload) => {
      const userId = payload.userId;
      if (typeof userId !== "string") {
        return;
      }
      const now = Date.now();
      if (event === "typing.started") {
        void resolveDisplayName(userId).then((displayName) => {
          dispatch({
            type: "typing",
            event: { type: "started", userId, displayName },
            now,
          });
        });
      } else if (event === "typing.stopped") {
        dispatch({
          type: "typing",
          event: { type: "stopped", userId },
          now,
        });
      }
    });

    const removePresence = handle.onPresence((presenceState) => {
      const ids = new Set<string>();
      for (const key of Object.keys(presenceState)) {
        ids.add(key);
      }
      dispatch({ type: "online_set", userIds: ids });
    });

    const removeStatus = handle.onStatus((status) => {
      if (status === "SUBSCRIBED" && !subscribed) {
        subscribed = true;
        void handle.track({ online: true, at: Date.now() });
        touch();
      }
    });

    const heartbeat = window.setInterval(touch, PRESENCE_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeat);
      removeBroadcast();
      removePresence();
      removeStatus();
      void handle.untrack();
      handle.leave();
      channelRef.current = null;
    };
  }, [conversationId, rpc, resolveDisplayName, state.viewerId, supabase]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      dispatch({
        type: "typing",
        event: { type: "expire", now },
        now,
      });
    }, 500);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

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

      if (activity.kind === "closed") {
        clearIdle();
        isComposing = false;
        sendStopped();
        return;
      }

      if (activity.kind === "sent") {
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

        if (!isComposing) {
          isComposing = true;
          sendStarted();
        } else {
          sendStarted();
        }
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
      typing: state.typing,
      subjectPresence: state.subjectPresence,
      subjectOnline,
      viewerId: state.viewerId,
    }),
    [state.typing, state.subjectPresence, state.viewerId, subjectOnline],
  );

  return (
    <TypingPresenceContext.Provider value={value}>
      {children}
    </TypingPresenceContext.Provider>
  );
}
