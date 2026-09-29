/**
 * Shared helpers for the AvailabilityMode enum. Client- and server-safe (no
 * server-only imports) so the rule editors, booking widgets and services all
 * agree on how the three modes behave and read in Arabic.
 *
 *  - SLOT_BASED   — fixed time slots; the patient picks a specific time.
 *  - ORDER_BASED  — queue (نظام الدور); the order number is handed out at booking.
 *  - ARRIVAL_BASED — arrival priority (أسبقية الحضور); the patient reserves and the
 *    order number is handed out at check-in, by physical arrival order.
 */
import { AvailabilityMode } from "@prisma/client";

/** The two queue-based modes. Both use DoctorDayQueue + the serving machinery.
 *  Kept as a mutable array so it drops straight into Prisma `{ in: QUEUE_MODES }`. */
export const QUEUE_MODES: AvailabilityMode[] = [
  AvailabilityMode.ORDER_BASED,
  AvailabilityMode.ARRIVAL_BASED,
];

/** True for a queue mode (ORDER_BASED or ARRIVAL_BASED) — i.e. not fixed slots. */
export function isQueueMode(mode: AvailabilityMode | null | undefined): boolean {
  return mode === AvailabilityMode.ORDER_BASED || mode === AvailabilityMode.ARRIVAL_BASED;
}

/** True when the order number is assigned at check-in, not at booking. */
export function isArrivalMode(mode: AvailabilityMode | null | undefined): boolean {
  return mode === AvailabilityMode.ARRIVAL_BASED;
}

/** Short Arabic label for a mode (dropdowns, badges). */
export const MODE_LABELS_AR: Record<AvailabilityMode, string> = {
  [AvailabilityMode.SLOT_BASED]: "مواعيد بأوقات ثابتة",
  [AvailabilityMode.ORDER_BASED]: "نظام الدور (طابور)",
  [AvailabilityMode.ARRIVAL_BASED]: "أسبقية الحضور",
};

/** Compact badge label (rule chips). */
export const MODE_BADGE_AR: Record<AvailabilityMode, string> = {
  [AvailabilityMode.SLOT_BASED]: "مواعيد ثابتة",
  [AvailabilityMode.ORDER_BASED]: "نظام الدور",
  [AvailabilityMode.ARRIVAL_BASED]: "أسبقية الحضور",
};

/** Parse a form/string value into an AvailabilityMode, defaulting to SLOT_BASED. */
export function parseMode(value: unknown): AvailabilityMode {
  if (value === AvailabilityMode.ORDER_BASED) return AvailabilityMode.ORDER_BASED;
  if (value === AvailabilityMode.ARRIVAL_BASED) return AvailabilityMode.ARRIVAL_BASED;
  return AvailabilityMode.SLOT_BASED;
}

/** The agent-facing short tag for a mode ("slot" | "order" | "arrival"). */
export function modeTag(mode: AvailabilityMode): "slot" | "order" | "arrival" {
  if (mode === AvailabilityMode.ORDER_BASED) return "order";
  if (mode === AvailabilityMode.ARRIVAL_BASED) return "arrival";
  return "slot";
}
