import { describe, expect, it } from "vitest";

import {
  aggregateEmojiCounts,
  createInitialReactionsState,
  reactionsReducer,
} from "./reactions-reducer";

describe("reactionsReducer", () => {
  it("optimistic add rolls back on failure path", () => {
    let state = createInitialReactionsState();
    const reaction = {
      message_id: "m1",
      user_id: "u1",
      emoji: "👍",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    state = reactionsReducer(state, { type: "optimistic_add", reaction });
    expect(state.byMessage.m1).toHaveLength(1);
    state = reactionsReducer(state, {
      type: "rollback_add",
      messageId: "m1",
      userId: "u1",
      emoji: "👍",
    });
    expect(state.byMessage.m1 ?? []).toHaveLength(0);
  });

  it("aggregates counts and reactedByMe", () => {
    const rows = [
      {
        message_id: "m1",
        user_id: "u1",
        emoji: "👍",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        message_id: "m1",
        user_id: "u2",
        emoji: "👍",
        created_at: "2026-01-01T00:00:01.000Z",
      },
      {
        message_id: "m1",
        user_id: "u1",
        emoji: "❤️",
        created_at: "2026-01-01T00:00:02.000Z",
      },
    ];
    const summary = aggregateEmojiCounts(rows, "u1");
    expect(summary).toEqual([
      { emoji: "❤️", count: 1, reactedByMe: true },
      { emoji: "👍", count: 2, reactedByMe: true },
    ]);
  });
});
