export type MembershipOrganization = {
  pinnedAt: string | null;
  mutedUntil: string | null;
  archivedAt: string | null;
};

export type ChatFolder = {
  id: string;
  name: string;
  position: number;
};

export type MuteDurationKey = "1h" | "8h" | "24h" | "7d" | "forever";
