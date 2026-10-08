export type OwnProfile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  timezone: string;
  username_changed_at: string | null;
  locale: string;
};

export type DeviceSession = {
  id: string;
  device_label: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type SignUpInput = {
  email: string;
  password: string;
  username: string;
  displayName?: string;
};

export type SignInInput = {
  email: string;
  password: string;
  deviceLabel?: string;
};

export type SignUpResult = {
  needsEmailConfirmation: boolean;
};
