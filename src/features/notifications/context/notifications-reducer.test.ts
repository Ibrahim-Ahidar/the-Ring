import { describe, expect, it } from "vitest";

import type { NotificationRow } from "../types";
import {
  initialNotificationsState,
  notificationsReducer,
} from "./notifications-reducer";

const sample = (id: string): NotificationRow => ({
  id,
  type: "message.created",
  actorId: "a",
  actorUsername: "actor",
  entityId: "e",
  conversationId: null,
  readAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("notificationsReducer", () => {
  it("prepends once when the same id is delivered twice", () => {
    const row = sample("n1");
    const afterFirst = notificationsReducer(initialNotificationsState, {
      type: "prepend",
      row,
    });
    const afterSecond = notificationsReducer(afterFirst, {
      type: "prepend",
      row,
    });
    expect(afterSecond.items).toHaveLength(1);
    expect(afterSecond.unreadCount).toBe(1);
  });
});
