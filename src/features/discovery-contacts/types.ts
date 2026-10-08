export type SearchCard = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

export type SharedGroup = {
  id: string;
  title: string | null;
};

export type ProfileView = SearchCard & {
  isOnline?: boolean;
  lastSeenAt?: string | null;
  sharedGroups?: SharedGroup[];
  isFavorited?: boolean;
};

export type RecentSearch = {
  id: string;
  normalizedUsername: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type FavoriteContact = {
  favoriteUserId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
};
