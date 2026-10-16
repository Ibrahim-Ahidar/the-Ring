export type InboxFilters = {
  includeArchived: boolean;
  folderId: string | null;
  /** `"group"` for the Groups filter; `null` shows every conversation. */
  type: "group" | null;
};

export const DEFAULT_INBOX_FILTERS: InboxFilters = {
  includeArchived: false,
  folderId: null,
  type: null,
};

export function parseInboxFilters(input: {
  archived?: string | string[];
  folder?: string | string[];
  filter?: string | string[];
}): InboxFilters {
  const archivedRaw = Array.isArray(input.archived)
    ? input.archived[0]
    : input.archived;
  const folderRaw = Array.isArray(input.folder) ? input.folder[0] : input.folder;
  const filterRaw = Array.isArray(input.filter) ? input.filter[0] : input.filter;
  return {
    includeArchived: archivedRaw === "1",
    folderId: folderRaw?.trim() ? folderRaw : null,
    type: filterRaw === "groups" ? "group" : null,
  };
}

export function inboxFiltersToListArgs(filters: InboxFilters): {
  includeArchived?: boolean;
  folderId?: string | null;
  type?: "group" | null;
} {
  return {
    includeArchived: filters.includeArchived,
    folderId: filters.folderId,
    type: filters.type,
  };
}
