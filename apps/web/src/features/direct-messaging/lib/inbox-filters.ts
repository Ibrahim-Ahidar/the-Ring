/**
 * The chat list shows exactly one view: the archived chats, one folder, or a
 * built-in filter (All, Unread, Groups). The URL carries it as `?archived=1`,
 * `?folder=<id>` or `?filter=unread|groups`; at most one of them applies.
 */
export type InboxFilters = {
  /** Only archived chats. Every other view excludes them. */
  archivedOnly: boolean;
  folderId: string | null;
  /** Only chats with unread messages. */
  unreadOnly: boolean;
  /** `"group"` for the Groups filter; `null` shows every conversation. */
  type: "group" | null;
};

export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  archivedOnly: false,
  folderId: null,
  unreadOnly: false,
  type: null,
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseInboxFilters(input: {
  archived?: string | string[];
  folder?: string | string[];
  filter?: string | string[];
}): InboxFilters {
  if (first(input.archived) === "1") {
    return { ...DEFAULT_INBOX_FILTERS, archivedOnly: true };
  }
  const folderRaw = first(input.folder);
  if (folderRaw?.trim()) {
    return { ...DEFAULT_INBOX_FILTERS, folderId: folderRaw };
  }
  const filterRaw = first(input.filter);
  return {
    ...DEFAULT_INBOX_FILTERS,
    unreadOnly: filterRaw === "unread",
    type: filterRaw === "groups" ? "group" : null,
  };
}

/** Whether the filters differ from the unfiltered default list. */
export function isFiltered(filters: InboxFilters): boolean {
  return (
    filters.archivedOnly ||
    filters.unreadOnly ||
    filters.folderId !== null ||
    filters.type !== null
  );
}

export function inboxFiltersToListArgs(filters: InboxFilters): {
  archivedOnly?: boolean;
  unreadOnly?: boolean;
  folderId?: string | null;
  type?: "group" | null;
} {
  return {
    archivedOnly: filters.archivedOnly,
    unreadOnly: filters.unreadOnly,
    folderId: filters.folderId,
    type: filters.type,
  };
}
