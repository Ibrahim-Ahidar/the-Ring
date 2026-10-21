/** Local calendar-day key used to group messages and draw day separators. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function calendarDaysAgo(date: Date, now: Date): number {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Chat list timestamp (web listTime): clock today, weekday within a week, else short date. */
export function listTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = calendarDaysAgo(date, now);
  if (days <= 0) return clockTime(iso);
  if (days < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Day separator label in the conversation. */
export function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const days = calendarDaysAgo(date, now);
  if (days < 7 && days >= 0) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" });
}
