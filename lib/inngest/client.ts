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

/**
 * Payload for importing an Evolution (WhatsApp Web) clinic's past chats into the
 * inbox. `delaySeconds` lets a sync wait for WhatsApp to
 * finish pushing history to the new device.
 */
export interface WhatsappHistoryImportData {
  clinicId: string;
  /** The WhatsApp Web number (WhatsappConfig id) whose history is imported. */
  configId: string;
  /** The WhatsappHistorySync run this event drives; a stale run exits. */
  runId: string;
  delaySeconds?: number;
}

export const inngest = new Inngest({ id: "clinica-ai" });
