export type MemberRole = "owner" | "admin" | "member";

export type GroupSummary = {
  id: string;
  title: string | null;
  description: string | null;
  avatarUrl: string | null;
  myRole: MemberRole;
};

export type GroupMember = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: MemberRole;
  joinedAt: string;
  messagingRestricted: boolean;
};

export type InviteLink = {
  id: string;
  code: string;
};
