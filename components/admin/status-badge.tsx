import { AppointmentStatus, Role } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

// ─── Appointment status badge ─────────────────────────────────────────────────

const appointmentVariants: Record<AppointmentStatus, BadgeVariant> = {
  [AppointmentStatus.PENDING]: "warning",
  [AppointmentStatus.CONFIRMED]: "info",
  [AppointmentStatus.CANCELLED]: "danger",
  [AppointmentStatus.COMPLETED]: "success",
  [AppointmentStatus.NO_SHOW]: "neutral",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge variant={appointmentVariants[status]}>{APPOINTMENT_STATUS_LABELS[status]}</Badge>;
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const roleVariants: Record<Role, BadgeVariant> = {
  [Role.PATIENT]: "sky",
  [Role.DOCTOR]: "violet",
  [Role.ADMIN]: "rose",
};

const roleLabels: Record<Role, string> = {
  [Role.PATIENT]: "مريض",
  [Role.DOCTOR]: "طبيب",
  [Role.ADMIN]: "مسؤول",
};

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={roleVariants[role]}>{roleLabels[role]}</Badge>;
}
