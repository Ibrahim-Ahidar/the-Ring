import { formatLastSeen } from "./last-seen";

const now = new Date("2026-10-21T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("formatLastSeen", () => {
  it("maps ages to keys", () => {
    expect(formatLastSeen(ago(10_000), now)).toEqual({ key: "lastSeenJustNow" });
    expect(formatLastSeen(ago(5 * 60_000), now)).toEqual({ key: "lastSeenMinutes", count: 5 });
    expect(formatLastSeen(ago(3 * 3_600_000), now)).toEqual({ key: "lastSeenHours", count: 3 });
    expect(formatLastSeen(ago(2 * 86_400_000), now)).toEqual({ key: "lastSeenDays", count: 2 });
    expect(formatLastSeen(ago(10 * 86_400_000), now).key).toBe("lastSeenDate");
  });
});
