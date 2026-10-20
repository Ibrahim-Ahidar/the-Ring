jest.mock("@/data", () => ({}));

import { flattenPages, shouldLoadMoreForLanding, tickFor } from "./timeline";

const row = (id: string) => ({ id }) as never;

describe("flattenPages", () => {
  it("keeps newest-first order and drops duplicates across pages", () => {
    expect(flattenPages([[row("m3"), row("m2")], [row("m2"), row("m1")]]).map((r) => r.id)).toEqual([
      "m3",
      "m2",
      "m1",
    ]);
  });
});

describe("shouldLoadMoreForLanding", () => {
  const base = { loaded: [row("m3"), row("m2")], hasMore: true, pagesLoaded: 1 };
  it("loads more while the read marker is missing", () => {
    expect(shouldLoadMoreForLanding({ ...base, lastReadMessageId: "m0" })).toBe(true);
  });
  it("stops once the marker is loaded", () => {
    expect(shouldLoadMoreForLanding({ ...base, lastReadMessageId: "m2" })).toBe(false);
  });
  it("stops when there are no more pages or the cap is reached", () => {
    expect(shouldLoadMoreForLanding({ ...base, hasMore: false, lastReadMessageId: "m0" })).toBe(false);
    expect(shouldLoadMoreForLanding({ ...base, pagesLoaded: 10, lastReadMessageId: null })).toBe(false);
  });
  it("loads more when nothing was ever read", () => {
    expect(shouldLoadMoreForLanding({ ...base, lastReadMessageId: null })).toBe(true);
  });
});

describe("tickFor", () => {
  it("maps each delivery state, only read is highlighted", () => {
    expect(tickFor("sent")).toMatchObject({ glyph: "\u2713", read: false });
    expect(tickFor("delivered")).toMatchObject({ glyph: "\u2713\u2713", read: false });
    expect(tickFor("read")).toMatchObject({ glyph: "\u2713\u2713", read: true });
    expect(tickFor("failed").labelKey).toBe("mobile.chats.status.failed");
  });
});
