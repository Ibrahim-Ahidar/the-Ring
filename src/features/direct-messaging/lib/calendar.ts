const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Days since the epoch for the calendar date `date` falls on in `timeZone`.
 * Takes the zone explicitly: the server renders in its own zone, so reading the
 * process's local time would make SSR and hydration disagree near midnight.
 */
function dayNumber(date: Date, timeZone: string): number {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / DAY_MS;
}

/** Whole calendar days from `date` to `now` in `timeZone` (0 = same day). */
export function calendarDaysAgo(date: Date, now: Date, timeZone: string): number {
  return dayNumber(now, timeZone) - dayNumber(date, timeZone);
}

export function isSameCalendarDay(a: string, b: string, timeZone: string): boolean {
  return dayNumber(new Date(a), timeZone) === dayNumber(new Date(b), timeZone);
}
