export type ProfileVisibility = "public" | "contacts" | "private";
export type WhoCanMessage = "everyone" | "requests" | "nobody";
export type WhoCanAddToGroups = "everyone" | "contacts" | "nobody";
export type ReportCategory = "spam" | "harassment" | "impersonation" | "other";
export type ReportStatus = "open" | "reviewed" | "dismissed";

export type PrivacySettings = {
  discoverable: boolean;
  profileVisibility: ProfileVisibility;
  showLastSeen: boolean;
  showOnline: boolean;
  sendReadReceipts: boolean;
  whoCanMessage: WhoCanMessage;
  whoCanAddToGroups: WhoCanAddToGroups;
};

export type BlockRow = {
  blockedId: string;
  username: string;
  displayName: string | null;
  createdAt: string;
};

export type ReportRow = {
  id: string;
  targetUserId: string | null;
  targetMessageId: string | null;
  category: ReportCategory;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
};

export type GroupReportRow = ReportRow & {
  reporterId: string;
};

export type PrivacyFieldKey = keyof PrivacySettings;

export type PrivacyPatch = Partial<PrivacySettings>;
