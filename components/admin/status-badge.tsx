import type { AppointmentStatus, Role } from "@prisma/client";

// ─── Appointment status badge ─────────────────────────────────────────────────

const appointmentColors: Record<AppointmentStatus, string> = {
  PENDING:   "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  NO_SHOW:   "bg-gray-100 text-gray-600",
};

const appointmentLabels: Record<AppointmentStatus, string> = {
  PENDING:   "قيد الانتظار",
  CONFIRMED: "مؤكد",
  CANCELLED: "ملغي",
  COMPLETED: "مكتمل",
  NO_SHOW:   "لم يحضر",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans ${appointmentColors[status]}`}>
      {appointmentLabels[status]}
    </span>
  );
}

// ─── Role badge ───────────────────────────────────────────────────────────────

const roleColors: Record<Role, string> = {
  PATIENT: "bg-sky-100 text-sky-700",
  DOCTOR:  "bg-violet-100 text-violet-700",
  ADMIN:   "bg-rose-100 text-rose-700",
};

const roleLabels: Record<Role, string> = {
  PATIENT: "مريض",
  DOCTOR:  "طبيب",
  ADMIN:   "مسؤول",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium font-sans ${roleColors[role]}`}>
      {roleLabels[role]}
    </span>
  );
}
