"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  acceptRequestAction,
  countPendingIncomingAction,
  declineRequestAction,
  listIncomingAction,
  listOutgoingAction,
} from "../actions";
import type { IncomingMessageRequest, OutgoingMessageRequest } from "../types";
import { initialMessageRequestsState, messageRequestsReducer } from "./reducer";
import type { MessageRequestsState } from "./types";

type MessageRequestsContextValue = {
  state: MessageRequestsState;
  refresh: () => Promise<void>;
  accept: (requestId: string) => Promise<
    | { ok: true; conversationId: string }
    | { ok: false; code: string }
  >;
  decline: (requestId: string) => Promise<{ ok: true } | { ok: false; code: string }>;
};

const MessageRequestsContext = createContext<MessageRequestsContextValue | null>(
  null,
);

export function MessageRequestsProvider({
  children,
  initialIncoming,
  initialOutgoing,
  initialPendingCount,
}: {
  children: ReactNode;
  initialIncoming: IncomingMessageRequest[];
  initialOutgoing: OutgoingMessageRequest[];
  initialPendingCount: number;
}) {
  const [state, dispatch] = useReducer(messageRequestsReducer, {
    ...initialMessageRequestsState,
    loading: false,
    incoming: initialIncoming,
    outgoing: initialOutgoing,
    pendingIncomingCount: initialPendingCount,
  });

  const refresh = useCallback(async () => {
    dispatch({ type: "load_start" });
    const [incoming, outgoing, pending] = await Promise.all([
      listIncomingAction(),
      listOutgoingAction(),
      countPendingIncomingAction(),
    ]);
    if (!incoming.ok || !outgoing.ok || !pending.ok) {
      const code =
        (!incoming.ok && incoming.error.code) ||
        (!outgoing.ok && outgoing.error.code) ||
        (!pending.ok && pending.error.code) ||
        "platform.unexpected";
      dispatch({ type: "load_error", code });
      return;
    }
    dispatch({
      type: "load_success",
      incoming: incoming.value,
      outgoing: outgoing.value,
      pendingIncomingCount: pending.value,
    });
  }, []);

  const accept = useCallback(async (requestId: string) => {
    dispatch({ type: "act_start", requestId });
    const result = await acceptRequestAction(requestId);
    dispatch({ type: "act_end" });
    if (!result.ok) {
      return { ok: false as const, code: result.error.code };
    }
    dispatch({
      type: "patch_incoming",
      requestId,
      patch: {
        status: "accepted",
        conversationId: result.value.conversationId,
      },
    });
    return { ok: true as const, conversationId: result.value.conversationId };
  }, []);

  const decline = useCallback(async (requestId: string) => {
    dispatch({ type: "act_start", requestId });
    const result = await declineRequestAction(requestId);
    dispatch({ type: "act_end" });
    if (!result.ok) {
      return { ok: false as const, code: result.error.code };
    }
    dispatch({
      type: "patch_incoming",
      requestId,
      patch: { status: "declined" },
    });
    return { ok: true as const };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ state, refresh, accept, decline }),
    [state, refresh, accept, decline],
  );

  return (
    <MessageRequestsContext.Provider value={value}>
      {children}
    </MessageRequestsContext.Provider>
  );
}

export function useMessageRequests(): MessageRequestsContextValue {
  const ctx = useContext(MessageRequestsContext);
  if (!ctx) {
    throw new Error("useMessageRequests requires MessageRequestsProvider");
  }
  return ctx;
}

export function usePendingIncomingBadge(): number {
  const ctx = useContext(MessageRequestsContext);
  return ctx?.state.pendingIncomingCount ?? 0;
}
