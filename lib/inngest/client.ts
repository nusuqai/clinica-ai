import { Inngest } from "inngest";

/**
 * Payload for the one automation event. Emitted by the sweep (one per due
 * appointment) and handled by the throttled sender; `clinicId` is carried so the
 * sender can key its per-clinic concurrency/throttle on it.
 */
export interface AppointmentNotifyData {
  appointmentId: string;
  clinicId: string;
  purpose: "CONFIRM_REMINDER" | "FEEDBACK_REQUEST";
}

export const inngest = new Inngest({ id: "clinica-ai" });
