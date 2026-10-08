import type { NotificationRow } from "../types";

export type NotificationsState = {
  items: NotificationRow[];
  unreadCount: number;
  nextCursor: { createdAt: string; id: string } | null;
  loading: boolean;
  loadingMore: boolean;
  errorCode: string | null;
};

export type NotificationsAction =
  | { type: "load_start" }
  | {
      type: "load_success";
      items: NotificationRow[];
      unreadCount: number;
      nextCursor: { createdAt: string; id: string } | null;
    }
  | { type: "load_error"; code: string }
  | { type: "load_more_start" }
  | {
      type: "load_more_success";
      items: NotificationRow[];
      nextCursor: { createdAt: string; id: string } | null;
    }
  | { type: "prepend"; row: NotificationRow }
  | { type: "mark_read"; id: string; readAt: string }
  | { type: "mark_all_read"; readAt: string }
  | { type: "set_unread_count"; count: number };

export const initialNotificationsState: NotificationsState = {
  items: [],
  unreadCount: 0,
  nextCursor: null,
  loading: true,
  loadingMore: false,
  errorCode: null,
};

function mergeUnique(
  existing: NotificationRow[],
  incoming: NotificationRow[],
): NotificationRow[] {
  const seen = new Set(existing.map((row) => row.id));
  const merged = [...existing];
  for (const row of incoming) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      merged.push(row);
    }
  }
  return merged;
}

export function notificationsReducer(
  state: NotificationsState,
  action: NotificationsAction,
): NotificationsState {
  switch (action.type) {
    case "load_start":
      return {
        ...state,
        loading: true,
        errorCode: null,
      };
    case "load_success":
      return {
        ...state,
        loading: false,
        errorCode: null,
        items: action.items,
        unreadCount: action.unreadCount,
        nextCursor: action.nextCursor,
      };
    case "load_error":
      return {
        ...state,
        loading: false,
        loadingMore: false,
        errorCode: action.code,
      };
    case "load_more_start":
      return { ...state, loadingMore: true, errorCode: null };
    case "load_more_success":
      return {
        ...state,
        loadingMore: false,
        items: mergeUnique(state.items, action.items),
        nextCursor: action.nextCursor,
      };
    case "prepend": {
      if (state.items.some((row) => row.id === action.row.id)) {
        return state;
      }
      const unreadDelta = action.row.readAt ? 0 : 1;
      return {
        ...state,
        items: [action.row, ...state.items],
        unreadCount: state.unreadCount + unreadDelta,
      };
    }
    case "mark_read":
      return {
        ...state,
        items: state.items.map((row) =>
          row.id === action.id ? { ...row, readAt: action.readAt } : row,
        ),
        unreadCount: Math.max(
          0,
          state.unreadCount -
            (state.items.find((row) => row.id === action.id && !row.readAt)
              ? 1
              : 0),
        ),
      };
    case "mark_all_read":
      return {
        ...state,
        unreadCount: 0,
        items: state.items.map((row) =>
          row.readAt ? row : { ...row, readAt: action.readAt },
        ),
      };
    case "set_unread_count":
      return { ...state, unreadCount: action.count };
    default:
      return state;
  }
}
