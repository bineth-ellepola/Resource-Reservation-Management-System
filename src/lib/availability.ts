// Turns a resource's confirmed bookings into Free/Booked segments for a time window.
// Pure (no database or clock access) so the boundary rules can be unit-tested.

export type Interval = { start: Date; end: Date };

export type Segment<Booking> =
  | { kind: "free"; start: Date; end: Date }
  | { kind: "booked"; start: Date; end: Date; booking: Booking };

/**
 * Splits [windowStart, windowEnd) into free and booked segments. Bookings that start
 * before or end after the window (e.g. across midnight) are clipped to it. Confirmed
 * bookings never overlap (the database guarantees it), so segments never overlap either.
 */
export function buildSchedule<Booking extends Interval>(
  windowStart: Date,
  windowEnd: Date,
  bookings: readonly Booking[],
): Segment<Booking>[] {
  const segments: Segment<Booking>[] = [];
  let cursor = windowStart;

  for (const booking of [...bookings].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    const start = booking.start > windowStart ? booking.start : windowStart;
    const end = booking.end < windowEnd ? booking.end : windowEnd;
    if (end <= start) {
      continue; // entirely outside the window
    }
    if (start > cursor) {
      segments.push({ kind: "free", start: cursor, end: start });
    }
    segments.push({ kind: "booked", start, end, booking });
    if (end > cursor) {
      cursor = end;
    }
  }

  if (cursor < windowEnd) {
    segments.push({ kind: "free", start: cursor, end: windowEnd });
  }
  return segments;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * A suggested slot inside a free segment for the "Book" link: from the later of the
 * segment start and `earliestStart`, lasting one hour or until the segment ends.
 * Returns null when the free segment is already over.
 */
export function suggestSlot(free: Interval, earliestStart: Date): Interval | null {
  const start = free.start > earliestStart ? free.start : earliestStart;
  if (start >= free.end) {
    return null;
  }
  const oneHourLater = new Date(start.getTime() + HOUR_MS);
  return { start, end: oneHourLater < free.end ? oneHourLater : free.end };
}
