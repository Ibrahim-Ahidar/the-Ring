import type { MessageReaction } from "@/platform/timeline";

export type ReactionsState = {
  byMessage: Record<string, MessageReaction[]>;
};

export type ReactionsAction =
  | { type: "seed"; messageId: string; reactions: MessageReaction[] }
  | { type: "apply_server"; reactions: MessageReaction[] }
  | { type: "optimistic_add"; reaction: MessageReaction }
  | { type: "optimistic_remove"; messageId: string; userId: string; emoji: string }
  | { type: "rollback_add"; messageId: string; userId: string; emoji: string }
  | { type: "rollback_remove"; reaction: MessageReaction };

function reactionKey(reaction: MessageReaction): string {
  return `${reaction.message_id}:${reaction.user_id}:${reaction.emoji}`;
}

function upsertReaction(
  list: MessageReaction[],
  reaction: MessageReaction,
): MessageReaction[] {
  const key = reactionKey(reaction);
  const next = list.filter((row) => reactionKey(row) !== key);
  next.push(reaction);
  return next.sort((a, b) => {
    if (a.emoji !== b.emoji) {
      return a.emoji < b.emoji ? -1 : 1;
    }
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? -1 : 1;
    }
    return a.user_id < b.user_id ? -1 : 1;
  });
}

function removeReaction(
  list: MessageReaction[],
  messageId: string,
  userId: string,
  emoji: string,
): MessageReaction[] {
  return list.filter(
    (row) =>
      !(
        row.message_id === messageId &&
        row.user_id === userId &&
        row.emoji === emoji
      ),
  );
}

export function createInitialReactionsState(): ReactionsState {
  return { byMessage: {} };
}

export function reactionsReducer(
  state: ReactionsState,
  action: ReactionsAction,
): ReactionsState {
  switch (action.type) {
    case "seed": {
      const existing = state.byMessage[action.messageId] ?? [];
      if (existing.length > 0) {
        return state;
      }
      return {
        ...state,
        byMessage: {
          ...state.byMessage,
          [action.messageId]: [...action.reactions],
        },
      };
    }
    case "apply_server": {
      const byMessage = { ...state.byMessage };
      for (const reaction of action.reactions) {
        const list = byMessage[reaction.message_id] ?? [];
        byMessage[reaction.message_id] = upsertReaction(list, reaction);
      }
      return { ...state, byMessage };
    }
    case "optimistic_add": {
      const list = state.byMessage[action.reaction.message_id] ?? [];
      return {
        ...state,
        byMessage: {
          ...state.byMessage,
          [action.reaction.message_id]: upsertReaction(list, action.reaction),
        },
      };
    }
    case "optimistic_remove": {
      const list = state.byMessage[action.messageId] ?? [];
      return {
        ...state,
        byMessage: {
          ...state.byMessage,
          [action.messageId]: removeReaction(
            list,
            action.messageId,
            action.userId,
            action.emoji,
          ),
        },
      };
    }
    case "rollback_add": {
      const list = state.byMessage[action.messageId] ?? [];
      return {
        ...state,
        byMessage: {
          ...state.byMessage,
          [action.messageId]: removeReaction(
            list,
            action.messageId,
            action.userId,
            action.emoji,
          ),
        },
      };
    }
    case "rollback_remove": {
      const list = state.byMessage[action.reaction.message_id] ?? [];
      return {
        ...state,
        byMessage: {
          ...state.byMessage,
          [action.reaction.message_id]: upsertReaction(list, action.reaction),
        },
      };
    }
    default:
      return state;
  }
}

export function aggregateEmojiCounts(
  reactions: MessageReaction[],
  currentUserId: string,
): { emoji: string; count: number; reactedByMe: boolean }[] {
  const map = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const row of reactions) {
    const entry = map.get(row.emoji) ?? { count: 0, reactedByMe: false };
    entry.count += 1;
    if (row.user_id === currentUserId) {
      entry.reactedByMe = true;
    }
    map.set(row.emoji, entry);
  }
  return [...map.entries()]
    .map(([emoji, meta]) => ({
      emoji,
      count: meta.count,
      reactedByMe: meta.reactedByMe,
    }))
    .sort((a, b) => (a.emoji < b.emoji ? -1 : 1));
}
