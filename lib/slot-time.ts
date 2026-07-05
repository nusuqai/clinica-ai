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
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
): string {
  return new Date(value).toLocaleDateString("ar-EG", { ...options, timeZone: "UTC" });
}

export function formatSlotTime(
  value: Date | string,
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" },
): string {
  return new Date(value).toLocaleTimeString("ar-EG", { ...options, timeZone: "UTC" });
}

export function formatSlotTimeRange(start: Date | string, end: Date | string): string {
  return `${formatSlotTime(start)} – ${formatSlotTime(end)}`;
}
