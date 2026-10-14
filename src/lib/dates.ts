// Timezone helpers. The database stores precise instants (timestamptz); the UI
// works in Asia/Colombo wall-clock time. Sri Lanka is UTC+05:30 all year (no DST),
// but conversion still goes through an explicit offset rather than the server's
// local timezone, which may differ (e.g. UTC in CI).

export const APP_TIME_ZONE = "Asia/Colombo";
const COLOMBO_OFFSET = "+05:30";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Today's calendar date in Asia/Colombo as YYYY-MM-DD. */
export function colomboDateString(now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(now);
}

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** e.g. "Thu 15 Oct 2026" in Asia/Colombo. */
export function formatColomboDate(instant: Date): string {
  return dayFormat.format(instant).replace(",", "");
}

/** e.g. "09:00" in Asia/Colombo (24-hour). */
export function formatColomboTime(instant: Date): string {
  return timeFormat.format(instant);
}

/**
 * A reservation interval in Asia/Colombo, e.g. "Thu 15 Oct 2026, 09:00–10:00", or
 * "Thu 15 Oct 2026, 22:00 – Fri 16 Oct 2026, 02:00" when it crosses midnight.
 */
export function formatColomboRange(start: Date, end: Date): string {
  const startDay = formatColomboDate(start);
  const endDay = formatColomboDate(end);
  if (startDay === endDay) {
    return `${startDay}, ${formatColomboTime(start)}–${formatColomboTime(end)}`;
  }
  return `${startDay}, ${formatColomboTime(start)} – ${endDay}, ${formatColomboTime(end)}`;
}

/** Adds whole calendar days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * Converts a Colombo wall-clock date (YYYY-MM-DD) and time (HH:mm) to an instant.
 * Throws on malformed or impossible input such as 2026-02-30.
 */
export function colomboDateTime(date: string, time: string): Date {
  if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) {
    throw new RangeError(`Invalid Colombo date/time: "${date} ${time}"`);
  }
  const instant = new Date(`${date}T${time}:00${COLOMBO_OFFSET}`);
  // Date silently rolls 2026-02-30 over to March; reject that by round-tripping.
  if (Number.isNaN(instant.getTime()) || colomboDateString(instant) !== date) {
    throw new RangeError(`Invalid Colombo date/time: "${date} ${time}"`);
  }
  return instant;
}
