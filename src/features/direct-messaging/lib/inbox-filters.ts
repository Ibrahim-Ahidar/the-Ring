export type InboxFilters = {
  includeArchived: boolean;
  folderId: string | null;
};

export function parseInboxFilters(input: {
  archived?: string | string[];
  folder?: string | string[];
}): InboxFilters {
  const archivedRaw = Array.isArray(input.archived)
    ? input.archived[0]
    : input.archived;
  const folderRaw = Array.isArray(input.folder) ? input.folder[0] : input.folder;
  return {
    includeArchived: archivedRaw === "1",
    folderId: folderRaw?.trim() ? folderRaw : null,
  };
}

export function inboxFiltersToListArgs(filters: InboxFilters): {
  includeArchived?: boolean;
  folderId?: string | null;
} {
  return {
    includeArchived: filters.includeArchived,
    folderId: filters.folderId,
  };
}
