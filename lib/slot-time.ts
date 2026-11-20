/**
 * Slot/appointment date & time fields (Slot.date, Slot.startTime, Slot.endTime,
 * AvailabilityRule.generatedUntil) store clinic wall-clock values in the UTC
 * fields (see generateSlotsForRule in server/services/doctors.ts, which builds
 * them with setUTCHours/setUTCDate). They are not true UTC instants, so they
 * must always be formatted with timeZone: "UTC" — otherwise the browser's
 * local offset gets applied on top and shifts the displayed time.
 */

export function formatSlotDate(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
): string {
  return new Date(value).toLocaleDateString("ar-EG", { ...options, timeZone: "UTC" });
}

export function formatSlotTime(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
): string {
  return new Date(value).toLocaleTimeString("ar-EG", { ...options, timeZone: "UTC" });
}

export function formatSlotTimeRange(start: Date | string, end: Date | string): string {
  return `${formatSlotTime(start)} – ${formatSlotTime(end)}`;
}

/** An appointment's day: the slot's date, or the booking date for queue bookings.
 *  Lives here (not in a "use client" component) so server components can call it. */
export function visitDate(appt: {
  slot: { date: Date } | null;
  bookingDate: Date | null;
}): Date | null {
  return appt.slot?.date ?? appt.bookingDate;
}

/**
 * When a slot visit really ends: its first slot's start + the services'
 * total minutes (a long visit spans several slots). Falls back to the slot end.
 */
export function visitEnd(
  slot: { startTime: Date | string; endTime: Date | string },
  totalDurationMin: number | null | undefined
): Date {
  const start = new Date(slot.startTime);
  if (!totalDurationMin) return new Date(slot.endTime);
  const end = new Date(start.getTime() + totalDurationMin * 60_000);
  return end > new Date(slot.endTime) ? end : new Date(slot.endTime);
}
