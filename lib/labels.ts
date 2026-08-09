// Arabic display labels for the Prisma enums, keyed by the enum members so every
// member must be covered and callers never hardcode the raw strings.
import { AppointmentStatus, Role, ClinicRequestStatus } from "@prisma/client";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  [AppointmentStatus.PENDING]: "قيد الانتظار",
  [AppointmentStatus.CONFIRMED]: "مؤكد",
  [AppointmentStatus.COMPLETED]: "مكتمل",
  [AppointmentStatus.CANCELLED]: "ملغي",
  [AppointmentStatus.NO_SHOW]: "لم يحضر",
};

export const ROLE_LABELS: Record<Role, string> = {
  [Role.PATIENT]: "مريض",
  [Role.DOCTOR]: "طبيب",
  [Role.ADMIN]: "مشرف",
};

export const CLINIC_REQUEST_STATUS_LABELS: Record<ClinicRequestStatus, string> = {
  [ClinicRequestStatus.PENDING]: "قيد الانتظار",
  [ClinicRequestStatus.APPROVED]: "مقبول",
  [ClinicRequestStatus.REJECTED]: "مرفوض",
};
