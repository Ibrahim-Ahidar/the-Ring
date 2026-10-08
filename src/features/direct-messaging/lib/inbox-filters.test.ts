import { describe, expect, it } from "vitest";

import { inboxFiltersToListArgs, parseInboxFilters } from "./inbox-filters";

describe("parseInboxFilters", () => {
  it("honours archived=1 and folder id", () => {
    expect(
      parseInboxFilters({ archived: "1", folder: "abc-123" }),
    ).toEqual({
      includeArchived: true,
      folderId: "abc-123",
    });
  });

  it("defaults when params are absent", () => {
    expect(parseInboxFilters({})).toEqual({
      includeArchived: false,
      folderId: null,
    });
  });
});

describe("inboxFiltersToListArgs", () => {
  it("maps to listConversations action args", () => {
    expect(
      inboxFiltersToListArgs({ includeArchived: true, folderId: "f1" }),
    ).toEqual({
      includeArchived: true,
      folderId: "f1",
    });
  });
});
