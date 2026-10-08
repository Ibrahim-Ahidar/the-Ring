export type NotificationRow = {
  id: string;
  type: string;
  actorId: string | null;
  actorUsername: string | null;
  entityId: string | null;
  conversationId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationCursor = {
  createdAt: string;
  id: string;
};

export type NotificationPreferences = {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  mentionsOnly: boolean;
};

export type NotificationListPage = {
  items: NotificationRow[];
  nextCursor: NotificationCursor | null;
};
