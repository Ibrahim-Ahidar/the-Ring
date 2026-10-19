import { canShowPresence, type SubjectPresenceRow } from "@/features/typing-presence/presence";

export type Subtitle =
  | {
      kind: "typing";
      key: "typing" | "typingOne" | "typingMany";
      values: { name?: string; count?: number };
    }
  | { kind: "online" }
  | { kind: "lastSeen"; at: Date }
  | { kind: "offline" }
  | { kind: "none" };

export type SubtitleInput = {
  conversationType: "direct" | "group";
  otherUserId?: string;
  viewerId: string | null;
  typers: ReadonlyArray<{ userId: string; displayName: string }>;
  subjectPresence: SubjectPresenceRow | null;
  subjectOnline: boolean;
};

/** Pure: typing > online > last seen > offline > nothing. Privacy flags come from the server row. */
export function deriveSubtitle(input: SubtitleInput): Subtitle {
  const typers = input.typers.filter((typer) => typer.userId !== input.viewerId);

  if (typers.length > 0) {
    if (input.conversationType === "direct") {
      return { kind: "typing", key: "typing", values: {} };
    }
    if (typers.length === 1) {
      return {
        kind: "typing",
        key: "typingOne",
        values: { name: typers[0].displayName },
      };
    }
    return { kind: "typing", key: "typingMany", values: { count: typers.length } };
  }

  const row = input.subjectPresence;
  if (input.conversationType !== "direct" || !input.otherUserId || !row) {
    return { kind: "none" };
  }

  const visibility = canShowPresence(
    row.presence_allowed ? "allow" : "deny",
    row.show_last_seen,
  );

  if (visibility.showOnline && input.subjectOnline) {
    return { kind: "online" };
  }
  if (visibility.showLastSeen && row.last_seen_at) {
    const at = new Date(row.last_seen_at);
    if (!Number.isNaN(at.getTime())) {
      return { kind: "lastSeen", at };
    }
  }
  // Last seen hidden or unknown: still say offline when presence is allowed.
  if (visibility.showOnline) {
    return { kind: "offline" };
  }
  return { kind: "none" };
}

const MINUTE_MS = 60_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type LastSeenBucket = "justNow" | "relative" | "date";

/** Under a minute (or a future date) is "just now"; under 7 days is relative; else a date. */
export function lastSeenBucket(at: Date, now: Date): LastSeenBucket {
  const age = now.getTime() - at.getTime();
  if (age < MINUTE_MS) {
    return "justNow";
  }
  return age < WEEK_MS ? "relative" : "date";
}
