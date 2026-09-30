import { Inngest } from "inngest";

/**
 * Payload for the one automation event. Emitted by the sweep (one per due row)
 * and handled by the throttled sender; `clinicId` is carried so the sender can
 * key its per-clinic concurrency/throttle on it.
 *
 * Reminder/feedback are keyed on an appointment; the follow-up reminder is keyed
 * on a TreatmentRecord (its followUpDate is what comes due), so it carries
 * `recordId` instead. Exactly one of `appointmentId` / `recordId` is set per
 * event, matched to the purpose.
 */
export interface AppointmentNotifyData {
  clinicId: string;
  purpose: "CONFIRM_REMINDER" | "FEEDBACK_REQUEST" | "FOLLOWUP_REMINDER";
  appointmentId?: string;
  recordId?: string;
}

export const inngest = new Inngest({ id: "clinica-ai" });
