import type { AppointmentStatus } from "@prisma/client";

const ALLOWED_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW", "COMPLETED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function getAllowedTransitions(status: AppointmentStatus): AppointmentStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
