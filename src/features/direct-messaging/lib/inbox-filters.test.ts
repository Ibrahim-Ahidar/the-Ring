import { describe, expect, it } from "vitest";

import {
  DEFAULT_INBOX_FILTERS,
  inboxFiltersToListArgs,
  isFiltered,
  parseInboxFilters,
} from "./inbox-filters";

describe("parseInboxFilters", () => {
  it("reads archived=1 as the archived-only view", () => {
    expect(parseInboxFilters({ archived: "1" })).toEqual({
      ...DEFAULT_INBOX_FILTERS,
      archivedOnly: true,
    });
  });

  it("reads a folder id", () => {
    expect(parseInboxFilters({ folder: "abc-123" })).toEqual({
      ...DEFAULT_INBOX_FILTERS,
      folderId: "abc-123",
    });
  });

  it("defaults when params are absent", () => {
    expect(parseInboxFilters({})).toEqual(DEFAULT_INBOX_FILTERS);
  });

  it("reads filter=groups as the group type and filter=unread as unread only", () => {
    expect(parseInboxFilters({ filter: "groups" }).type).toBe("group");
    expect(parseInboxFilters({ filter: "unread" }).unreadOnly).toBe(true);
    expect(parseInboxFilters({ filter: "direct" })).toEqual(DEFAULT_INBOX_FILTERS);
  });

  it("is single-select: archived wins over folder, folder over filter", () => {
    expect(
      parseInboxFilters({ archived: "1", folder: "f1", filter: "groups" }),
    ).toEqual({ ...DEFAULT_INBOX_FILTERS, archivedOnly: true });
    expect(parseInboxFilters({ folder: "f1", filter: "unread" })).toEqual({
      ...DEFAULT_INBOX_FILTERS,
      folderId: "f1",
    });
  });
});

describe("isFiltered", () => {
  it("is false only for the default list", () => {
    expect(isFiltered(DEFAULT_INBOX_FILTERS)).toBe(false);
    expect(isFiltered(parseInboxFilters({ filter: "unread" }))).toBe(true);
    expect(isFiltered(parseInboxFilters({ archived: "1" }))).toBe(true);
  });
});

describe("inboxFiltersToListArgs", () => {
  it("maps to listConversations action args", () => {
    expect(
      inboxFiltersToListArgs({
        archivedOnly: false,
        unreadOnly: true,
        folderId: "f1",
        type: "group",
      }),
    ).toEqual({
      archivedOnly: false,
      unreadOnly: true,
      folderId: "f1",
      type: "group",
    });
  });
});
