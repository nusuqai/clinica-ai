/**
 * The bridge between a clinic's WhatsApp template and an appointment's data.
 *
 * A ClinicAppointmentTemplate stores `variableMap` — an ordered list of tokens,
 * one per `{{n}}` placeholder in the clinic's template. At send time we resolve
 * those tokens against a specific appointment to produce the `variables` array
 * that Meta substitutes in order. The token vocabulary is FIXED and known here,
 * so the admin UI can offer exactly these choices and the sweep can always
 * resolve them.
 */

import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";

/** Every token an admin may map onto a template placeholder. */
export const APPOINTMENT_TOKENS = [
  "patient_name",
  "doctor_name",
  "doctor_title",
  "specialty",
  "clinic_name",
  "branch_name",
  "branch_address",
  "appointment_date",
  "appointment_time",
  "order_number",
] as const;

export type AppointmentToken = (typeof APPOINTMENT_TOKENS)[number];

/** Human labels for the admin token picker (Arabic — the clinic-facing UI). */
export const APPOINTMENT_TOKEN_LABELS: Record<AppointmentToken, string> = {
  patient_name: "اسم المريض",
  doctor_name: "اسم الطبيب",
  doctor_title: "لقب الطبيب",
  specialty: "التخصص",
  clinic_name: "اسم العيادة",
  branch_name: "اسم الفرع",
  branch_address: "عنوان الفرع",
  appointment_date: "تاريخ الموعد",
  appointment_time: "وقت الموعد / رقم الدور",
  order_number: "رقم الدور",
};

const TITLE_LABELS: Record<string, string> = {
  SPECIALIST: "أخصائي",
  CONSULTANT: "استشاري",
};

/** The appointment shape the token resolver needs (loaded with relations). */
export interface TokenSourceAppointment {
  orderNumber: number | null;
  bookingDate: Date | null;
  patient: { fullName: string };
  doctor: { fullName: string; title: string | null; specialty: { name: string } | null };
  branch: { name: string; address: string | null } | null;
  slot: { startTime: Date; date: Date } | null;
  clinic: { name: string };
}

/**
 * Resolves every token for one appointment into a display string. Order-based
 * bookings have no clock time, so `appointment_time` becomes the order-number
 * phrase and `appointment_date` comes from the booking date. All times are
 * formatted as the stored wall-clock (timeZone: "UTC") — see lib/slot-time.ts.
 */
export function buildTokenContext(appt: TokenSourceAppointment): Record<AppointmentToken, string> {
  const orderPhrase = appt.orderNumber != null ? `رقم الدور ${appt.orderNumber}` : "";
  const dateSource = appt.slot?.date ?? appt.bookingDate;

  return {
    patient_name: appt.patient.fullName,
    doctor_name: appt.doctor.fullName,
    doctor_title: appt.doctor.title ? (TITLE_LABELS[appt.doctor.title] ?? "") : "",
    specialty: appt.doctor.specialty?.name ?? "",
    clinic_name: appt.clinic.name,
    branch_name: appt.branch?.name ?? "",
    branch_address: appt.branch?.address ?? "",
    appointment_date: dateSource ? formatSlotDate(dateSource) : "",
    appointment_time: appt.slot ? formatSlotTime(appt.slot.startTime) : orderPhrase,
    order_number: appt.orderNumber != null ? String(appt.orderNumber) : "",
  };
}

/**
 * Maps a binding's `variableMap` onto a resolved context, producing the ordered
 * `variables` array for sendTemplateMessage. Unknown/blank tokens resolve to ""
 * so a misconfigured slot never crashes the send — it just sends an empty value.
 */
export function buildTemplateVariables(
  variableMap: string[],
  context: Record<AppointmentToken, string>
): string[] {
  return variableMap.map((token) => context[token as AppointmentToken] ?? "");
}
