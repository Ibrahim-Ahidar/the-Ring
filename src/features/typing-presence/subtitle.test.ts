import { describe, expect, it } from "vitest";

import { deriveSubtitle, lastSeenBucket } from "@/features/typing-presence/subtitle";
import type { SubjectPresenceRow } from "@/features/typing-presence/presence";

const row = (over: Partial<SubjectPresenceRow> = {}): SubjectPresenceRow => ({
  display_name: "Ada",
  last_seen_at: "2026-10-15T10:00:00.000Z",
  presence_allowed: true,
  show_last_seen: true,
  last_seen_visible: true,
  ...over,
});

const base = {
  conversationType: "direct" as const,
  otherUserId: "ada",
  viewerId: "me",
  typers: [],
  subjectPresence: row(),
  subjectOnline: true,
};

describe("deriveSubtitle", () => {
  it("typing beats online", () => {
    const typers = [{ userId: "ada", displayName: "Ada" }];
    expect(deriveSubtitle({ ...base, typers })).toEqual({
      kind: "typing",
      key: "typing",
      values: {},
    });
  });

  it("online beats last seen", () => {
    expect(deriveSubtitle(base)).toEqual({ kind: "online" });
  });

  it("falls back to last seen when offline", () => {
    const result = deriveSubtitle({ ...base, subjectOnline: false });
    expect(result.kind).toBe("lastSeen");
  });

  it("hides online when presence is not allowed", () => {
    const result = deriveSubtitle({
      ...base,
      subjectPresence: row({ presence_allowed: false, last_seen_at: null }),
    });
    expect(result).toEqual({ kind: "none" });
  });

  it("shows offline without a time when the user hides last seen", () => {
    const result = deriveSubtitle({
      ...base,
      subjectOnline: false,
      subjectPresence: row({ show_last_seen: false }),
    });
    expect(result).toEqual({ kind: "offline" });
  });

  it("shows offline without a last seen value", () => {
    expect(
      deriveSubtitle({
        ...base,
        subjectOnline: false,
        subjectPresence: row({ last_seen_at: null }),
      }),
    ).toEqual({ kind: "offline" });
  });

  it("excludes the viewer's own typing", () => {
    const result = deriveSubtitle({
      ...base,
      typers: [{ userId: "me", displayName: "Me" }],
    });
    expect(result).toEqual({ kind: "online" });
  });

  it("uses typingOne and typingMany in groups", () => {
    const group = { ...base, conversationType: "group" as const };
    expect(
      deriveSubtitle({ ...group, typers: [{ userId: "a", displayName: "Ann" }] }),
    ).toEqual({ kind: "typing", key: "typingOne", values: { name: "Ann" } });
    expect(
      deriveSubtitle({
        ...group,
        typers: [
          { userId: "a", displayName: "Ann" },
          { userId: "b", displayName: "Bob" },
          { userId: "me", displayName: "Me" },
        ],
      }),
    ).toEqual({ kind: "typing", key: "typingMany", values: { count: 2 } });
  });

  it("never shows presence in groups", () => {
    expect(deriveSubtitle({ ...base, conversationType: "group" })).toEqual({
      kind: "none",
    });
  });
});

describe("lastSeenBucket", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  it("buckets by age", () => {
    expect(lastSeenBucket(new Date("2026-10-15T11:59:30.000Z"), now)).toBe("justNow");
    expect(lastSeenBucket(new Date("2026-10-15T12:05:00.000Z"), now)).toBe("justNow");
    expect(lastSeenBucket(new Date("2026-10-15T11:00:00.000Z"), now)).toBe("relative");
    expect(lastSeenBucket(new Date("2026-10-01T11:00:00.000Z"), now)).toBe("date");
  });
});
