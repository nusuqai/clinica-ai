/**
 * Shared helpers for the AvailabilityMode enum. Client- and server-safe (no
 * server-only imports) so the rule editors, booking widgets and services all
 * agree on how the four modes behave and read in Arabic.
 *
 *  - SLOT_BASED   — fixed time slots; the patient picks a specific time.
 *  - ORDER_BASED  — queue (نظام الدور); the order number is handed out at booking.
 *  - ARRIVAL_BASED — arrival priority (أسبقية الحضور); the patient reserves and the
 *    order number is handed out at check-in, by physical arrival order.
 *  - DAY_ONLY     — day booking (حجز يوم فقط); the patient books the day and the
 *    clinic team contacts them to set the exact time (Appointment.scheduledTime).
 *    No order numbers, no serving queue, no overlap checks.
 *
 * Two groupings matter:
 *  - "queue modes" (ORDER_BASED, ARRIVAL_BASED) use the serving machinery
 *    (now-serving number, next patient, skip/recall, check-in).
 *  - "day-booked modes" (the queue modes + DAY_ONLY) are booked per DAY rather
 *    than per slot: no Slot rows, a DoctorDayQueue row as the day's ledger
 *    (optional cap), booked through bookQueueAppointment.
 */
import { AvailabilityMode } from "@prisma/client";

/** The two queue-based modes. Both use DoctorDayQueue + the serving machinery.
 *  Kept as a mutable array so it drops straight into Prisma `{ in: QUEUE_MODES }`. */
export const QUEUE_MODES: AvailabilityMode[] = [
  AvailabilityMode.ORDER_BASED,
  AvailabilityMode.ARRIVAL_BASED,
];

/** Every mode booked per day (no slots): the queue modes + DAY_ONLY. */
export const DAY_BOOKED_MODES: AvailabilityMode[] = [...QUEUE_MODES, AvailabilityMode.DAY_ONLY];

/** True for a queue mode (ORDER_BASED or ARRIVAL_BASED) — i.e. a serving queue. */
export function isQueueMode(mode: AvailabilityMode | null | undefined): boolean {
  return mode === AvailabilityMode.ORDER_BASED || mode === AvailabilityMode.ARRIVAL_BASED;
}

/** True for any mode booked per day rather than per slot (queue modes + DAY_ONLY). */
export function isDayBookedMode(mode: AvailabilityMode | null | undefined): boolean {
  return isQueueMode(mode) || mode === AvailabilityMode.DAY_ONLY;
}

/** True when the order number is assigned at check-in, not at booking. */
export function isArrivalMode(mode: AvailabilityMode | null | undefined): boolean {
  return mode === AvailabilityMode.ARRIVAL_BASED;
}

/** True for day-only booking: the team sets the exact time after booking. */
export function isDayOnlyMode(mode: AvailabilityMode | null | undefined): boolean {
  return mode === AvailabilityMode.DAY_ONLY;
}

/** Short Arabic label for a mode (dropdowns, badges). */
export const MODE_LABELS_AR: Record<AvailabilityMode, string> = {
  [AvailabilityMode.SLOT_BASED]: "مواعيد بأوقات ثابتة",
  [AvailabilityMode.ORDER_BASED]: "نظام الدور (طابور)",
  [AvailabilityMode.ARRIVAL_BASED]: "أسبقية الحضور",
  [AvailabilityMode.DAY_ONLY]: "حجز يوم فقط (الفريق يحدد الوقت)",
};

/** Compact badge label (rule chips). */
export const MODE_BADGE_AR: Record<AvailabilityMode, string> = {
  [AvailabilityMode.SLOT_BASED]: "مواعيد ثابتة",
  [AvailabilityMode.ORDER_BASED]: "نظام الدور",
  [AvailabilityMode.ARRIVAL_BASED]: "أسبقية الحضور",
  [AvailabilityMode.DAY_ONLY]: "حجز يوم",
};

/** Shown wherever a day-only booking's time hasn't been set by the team yet. */
export const DAY_ONLY_PENDING_TIME_AR = "بانتظار تحديد الوقت";

/** What the patient is told after a day-only booking (agent + booking modal). */
export const DAY_ONLY_PATIENT_NOTE_AR =
  "تم حجز اليوم، وسيتواصل معك فريق خدمة العملاء لتحديد الوقت المناسب لك.";

/** Parse a form/string value into an AvailabilityMode, defaulting to SLOT_BASED. */
export function parseMode(value: unknown): AvailabilityMode {
  if (value === AvailabilityMode.ORDER_BASED) return AvailabilityMode.ORDER_BASED;
  if (value === AvailabilityMode.ARRIVAL_BASED) return AvailabilityMode.ARRIVAL_BASED;
  if (value === AvailabilityMode.DAY_ONLY) return AvailabilityMode.DAY_ONLY;
  return AvailabilityMode.SLOT_BASED;
}

export type ModeTag = "slot" | "order" | "arrival" | "day";
/** Tag of a day-booked mode (what bookQueueAppointment returns). */
export type DayModeTag = Exclude<ModeTag, "slot">;

/** The agent/UI-facing short tag for a mode ("slot" | "order" | "arrival" | "day"). */
export function modeTag(mode: AvailabilityMode): ModeTag {
  if (mode === AvailabilityMode.ORDER_BASED) return "order";
  if (mode === AvailabilityMode.ARRIVAL_BASED) return "arrival";
  if (mode === AvailabilityMode.DAY_ONLY) return "day";
  return "slot";
}

/** Validates a team-entered "HH:MM" (24h) time; returns it normalized or null. */
export function normalizeHHMM(value: string | null | undefined): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
