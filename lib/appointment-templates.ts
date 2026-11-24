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
import { DOCTOR_TITLE_LABEL } from "@/lib/doctor-title";

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

const TITLE_LABELS: Record<string, string> = DOCTOR_TITLE_LABEL;

/** The appointment shape the token resolver needs (loaded with relations). */
export interface TokenSourceAppointment {
  orderNumber: number | null;
  bookingDate: Date | null;
  patient: { fullName: string };
  doctor: { fullName: string; title: string | null; specialty: { name: string } | null };
  branch: { name: string; address: string | null } | null;
  slot: { startTime: Date; date: Date } | null;
  clinic: { name: string };
  /** Day-only bookings: the "HH:MM" the team set (null = not set yet). */
  scheduledTime?: string | null;
  rule?: { mode: string } | null;
}

/** "14:30" → the same Arabic clock format formatSlotTime gives slots. */
function formatHHMM(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return formatSlotTime(new Date(Date.UTC(2000, 0, 1, h, m)));
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
    appointment_time: appt.slot
      ? formatSlotTime(appt.slot.startTime)
      : appt.scheduledTime
        ? formatHHMM(appt.scheduledTime)
        : appt.rule?.mode === "DAY_ONLY"
          ? "سيتواصل معك فريق العيادة لتحديد الوقت"
          : orderPhrase,
    order_number: appt.orderNumber != null ? String(appt.orderNumber) : "",
  };
}

/** The record shape the follow-up token resolver needs (loaded with relations). */
export interface TokenSourceRecord {
  followUpDate: Date | null;
  patient: { fullName: string };
  doctor: { fullName: string; title: string | null; specialty: { name: string } | null };
  branch: { name: string; address: string | null } | null;
  clinic: { name: string };
}

/**
 * Resolves every token for a FOLLOWUP_REMINDER, whose subject is a treatment
 * record rather than an appointment. The patient/doctor/clinic/branch tokens come
 * straight from the record; `appointment_date` becomes the suggested follow-up
 * date (so a template can say "متابعتك في {{appointment_date}}"), and the
 * time/order tokens are empty (a follow-up has no booked slot yet — that is
 * exactly what the message asks the patient to do).
 */
export function buildFollowUpTokenContext(
  record: TokenSourceRecord
): Record<AppointmentToken, string> {
  return {
    patient_name: record.patient.fullName,
    doctor_name: record.doctor.fullName,
    doctor_title: record.doctor.title ? (TITLE_LABELS[record.doctor.title] ?? "") : "",
    specialty: record.doctor.specialty?.name ?? "",
    clinic_name: record.clinic.name,
    branch_name: record.branch?.name ?? "",
    branch_address: record.branch?.address ?? "",
    appointment_date: record.followUpDate ? formatSlotDate(record.followUpDate) : "",
    appointment_time: "",
    order_number: "",
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

// ─── Custom (free-text) templates — Evolution / WhatsApp Web clinics ────────
//
// A clinic on Evolution has no Meta account, so nothing to approve: it writes
// its own message, with NAMED placeholders such as {{patient_name}}, stored as
// the binding's `bodyText` under the sentinel template name below. The sender
// fills the names from the same token context and sends plain text.

/** `templateName` marking a binding as clinic-written text, not a Meta template. */
export const CUSTOM_TEMPLATE_NAME = "__custom__";

export function isCustomTemplate(templateName: string): boolean {
  return templateName === CUSTOM_TEMPLATE_NAME;
}

/** Longest body WhatsApp accepts in one text message. */
export const CUSTOM_TEMPLATE_MAX_LENGTH = 4096;

/** `{{name}}` placeholders, tolerant of inner whitespace. */
const NAMED_PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/** Placeholder names in a custom text that aren't known tokens (empty = valid). */
export function unknownCustomTokens(text: string): string[] {
  const known = new Set<string>(APPOINTMENT_TOKENS);
  const unknown = new Set<string>();
  for (const [, name] of text.matchAll(NAMED_PLACEHOLDER)) {
    if (!known.has(name)) unknown.add(name);
  }
  return [...unknown];
}

/**
 * Fills a custom text's `{{token}}` placeholders. `resolve` maps each token to
 * its value — the appointment's real data when sending, or a bracketed label
 * for the admin preview.
 */
export function fillCustomTemplate(
  text: string,
  resolve: (token: AppointmentToken) => string
): string {
  const known = new Set<string>(APPOINTMENT_TOKENS);
  return text.replace(NAMED_PLACEHOLDER, (match, name: string) =>
    known.has(name) ? resolve(name as AppointmentToken) : match
  );
}
