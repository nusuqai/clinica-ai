/**
 * Turns an appointment's stored time into a true UTC instant.
 *
 * Slot/appointment time fields (Slot.startTime/endTime) and order-based
 * AvailabilityRule.startTime/endTime store the clinic's WALL-CLOCK value, not a
 * true UTC instant (see lib/slot-time.ts — slot datetimes are built with
 * setUTCHours, and rule times are plain "HH:MM" strings). To compare an
 * appointment against `now` (a real instant) — "is it 24h before the visit?",
 * "has the visit's end passed?" — we must interpret that wall-clock value in the
 * clinic's timezone and convert it to a genuine UTC instant. That is what these
 * helpers do; every automation timing decision goes through them.
 */

/** Parses a "HH:MM" wall-clock string into hour/minute numbers. */
function parseHHMM(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":");
  return { hour: Number(h), minute: Number(m) };
}

/**
 * The offset (ms) of `timeZone` at the instant `atUtc`, i.e. how far the zone's
 * wall clock is ahead of UTC. Uses Intl so it is DST-correct (Africa/Cairo
 * observes DST again since 2023). Positive for zones east of UTC.
 */
function tzOffsetMs(timeZone: string, atUtc: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(atUtc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - atUtc.getTime();
}

/**
 * Converts a wall-clock time (as it reads on the clinic's clock) into the true
 * UTC instant it refers to. The offset is resolved twice so a value that lands
 * on a DST transition is corrected against the offset actually in effect.
 */
function zonedWallTimeToUtc(
  year: number,
  month1: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month1 - 1, day, hour, minute, 0);
  const off1 = tzOffsetMs(timeZone, new Date(guess));
  let utc = guess - off1;
  const off2 = tzOffsetMs(timeZone, new Date(utc));
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

/** The minimal shape the timing helpers need from an appointment. */
export interface TimedAppointment {
  slot: { startTime: Date; endTime: Date } | null;
  bookingDate: Date | null;
  rule: { startTime: string; endTime: string } | null;
  /** Day-only bookings: the "HH:MM" the team set (null = not set yet). */
  scheduledTime?: string | null;
  /** The visit's minutes — with scheduledTime, gives the visit's end. */
  totalDurationMin?: number | null;
}

/** bookingDate + a "HH:MM" wall-clock time, as a true UTC instant. */
function dayAt(day: Date, hhmm: string, timeZone: string): Date {
  const { hour, minute } = parseHHMM(hhmm);
  return zonedWallTimeToUtc(
    day.getUTCFullYear(),
    day.getUTCMonth() + 1,
    day.getUTCDate(),
    hour,
    minute,
    timeZone
  );
}

/**
 * The appointment's start as a true UTC instant, or null if it can't be
 * determined (e.g. an order-based booking missing its rule). Slot-based reads
 * the wall-clock components off the stored datetime; a day-only booking whose
 * time the team set uses that time; order-based (and day-only still waiting for
 * a time) combines the booking date with the rule's start time.
 */
export function effectiveStartUtc(appt: TimedAppointment, timeZone: string): Date | null {
  if (appt.slot) {
    const s = appt.slot.startTime;
    return zonedWallTimeToUtc(
      s.getUTCFullYear(),
      s.getUTCMonth() + 1,
      s.getUTCDate(),
      s.getUTCHours(),
      s.getUTCMinutes(),
      timeZone
    );
  }
  if (appt.bookingDate && appt.scheduledTime) {
    return dayAt(appt.bookingDate, appt.scheduledTime, timeZone);
  }
  if (appt.bookingDate && appt.rule) {
    const d = appt.bookingDate;
    const { hour, minute } = parseHHMM(appt.rule.startTime);
    return zonedWallTimeToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      hour,
      minute,
      timeZone
    );
  }
  return null;
}

/**
 * The appointment's end as a true UTC instant (see effectiveStartUtc). A
 * day-only booking with a set time ends at that time + its minutes, but never
 * before the rule's end — the team may set any time, and the no-show sweep must
 * not close a visit the clinic placed late in (or after) the session.
 */
export function effectiveEndUtc(appt: TimedAppointment, timeZone: string): Date | null {
  if (!appt.slot && appt.bookingDate && appt.scheduledTime) {
    const start = dayAt(appt.bookingDate, appt.scheduledTime, timeZone);
    const end = new Date(start.getTime() + Math.max(1, appt.totalDurationMin ?? 30) * 60_000);
    const ruleEnd = appt.rule ? dayAt(appt.bookingDate, appt.rule.endTime, timeZone) : null;
    return ruleEnd && ruleEnd > end ? ruleEnd : end;
  }
  if (appt.slot) {
    const e = appt.slot.endTime;
    return zonedWallTimeToUtc(
      e.getUTCFullYear(),
      e.getUTCMonth() + 1,
      e.getUTCDate(),
      e.getUTCHours(),
      e.getUTCMinutes(),
      timeZone
    );
  }
  if (appt.bookingDate && appt.rule) {
    const d = appt.bookingDate;
    const { hour, minute } = parseHHMM(appt.rule.endTime);
    return zonedWallTimeToUtc(
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      hour,
      minute,
      timeZone
    );
  }
  return null;
}

/**
 * The true UTC instant a clinic-local calendar day ("YYYY-MM-DD") starts at —
 * e.g. for "everything created on 2026-11-24 in Cairo". DST-correct.
 */
export function zonedDayStartUtc(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return zonedWallTimeToUtc(y, m, d, 0, 0, timeZone);
}
