import type { MessageRequestsAction, MessageRequestsState } from "./types";

export const initialMessageRequestsState: MessageRequestsState = {
  incoming: [],
  outgoing: [],
  pendingIncomingCount: 0,
  loading: true,
  errorCode: null,
  actingRequestId: null,
};

export function messageRequestsReducer(
  state: MessageRequestsState,
  action: MessageRequestsAction,
): MessageRequestsState {
  switch (action.type) {
    case "load_start":
      return { ...state, loading: true, errorCode: null };
    case "load_success":
      return {
        ...state,
        loading: false,
        incoming: action.incoming,
        outgoing: action.outgoing,
        pendingIncomingCount: action.pendingIncomingCount,
        errorCode: null,
      };
    case "load_error":
      return { ...state, loading: false, errorCode: action.code };
    case "act_start":
      return { ...state, actingRequestId: action.requestId };
    case "act_end":
      return { ...state, actingRequestId: null };
    case "patch_incoming": {
      const incoming = state.incoming.map((row) =>
        row.id === action.requestId ? { ...row, ...action.patch } : row,
      );
      return {
        ...state,
        incoming,
        pendingIncomingCount: incoming.filter((row) => row.status === "pending").length,
      };
    }
    case "patch_outgoing":
      return {
        ...state,
        outgoing: state.outgoing.map((row) =>
          row.id === action.requestId ? { ...row, ...action.patch } : row,
        ),
      };
    default:
      return state;
  }
}
