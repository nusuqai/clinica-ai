import { AppointmentStatus, Role } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";

// ─── Appointment status badge ─────────────────────────────────────────────────

const appointmentColors: Record<AppointmentStatus, string> = {
  [AppointmentStatus.PENDING]:   "bg-amber-100 text-amber-700",
  [AppointmentStatus.CONFIRMED]: "bg-blue-100 text-blue-700",
  [AppointmentStatus.CANCELLED]: "bg-red-100 text-red-700",
  [AppointmentStatus.COMPLETED]: "bg-emerald-100 text-emerald-700",
  [AppointmentStatus.NO_SHOW]:   "bg-gray-100 text-gray-600",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans ${appointmentColors[status]}`}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const roleColors: Record<Role, string> = {
  [Role.PATIENT]: "bg-sky-100 text-sky-700",
  [Role.DOCTOR]:  "bg-violet-100 text-violet-700",
  [Role.ADMIN]:   "bg-rose-100 text-rose-700",
};

const roleLabels: Record<Role, string> = {
  [Role.PATIENT]: "مريض",
  [Role.DOCTOR]:  "طبيب",
  [Role.ADMIN]:   "مسؤول",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans ${roleColors[role]}`}>
      {roleLabels[role]}
    </span>
  );
}
