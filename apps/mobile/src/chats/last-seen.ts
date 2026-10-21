import { lastSeenBucket } from "@pulse/core";

export type LastSeenText =
  | { key: "lastSeenJustNow" }
  | { key: "lastSeenMinutes" | "lastSeenHours" | "lastSeenDays"; count: number }
  | { key: "lastSeenDate"; date: Date };

export function formatLastSeen(at: Date, now: Date): LastSeenText {
  const bucket = lastSeenBucket(at, now);
  if (bucket === "justNow") return { key: "lastSeenJustNow" };
  if (bucket === "date") return { key: "lastSeenDate", date: at };
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 60) return { key: "lastSeenMinutes", count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { key: "lastSeenHours", count: hours };
  return { key: "lastSeenDays", count: Math.floor(hours / 24) };
}
