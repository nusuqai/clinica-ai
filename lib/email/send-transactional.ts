import "server-only";
import { sendEmail, type SendEmailResult } from "./resend";
import { requestReceivedEmail, clinicRejectedEmail } from "./templates";

// ─── Transactional (no auth token) senders ────────────────────────────────────
// Plain notifications with no Supabase token involved.

/** Acknowledge a newly submitted clinic request. */
export async function sendRequestReceived(args: {
  email: string;
  requesterName: string;
  clinicName: string;
}): Promise<SendEmailResult> {
  const { subject, html } = requestReceivedEmail({
    requesterName: args.requesterName,
    clinicName: args.clinicName,
  });
  return sendEmail({ to: args.email, subject, html });
}

/** Notify a requester that their clinic request was declined. */
export async function sendClinicRejected(args: {
  email: string;
  requesterName: string;
  clinicName: string;
}): Promise<SendEmailResult> {
  const { subject, html } = clinicRejectedEmail({
    requesterName: args.requesterName,
    clinicName: args.clinicName,
  });
  return sendEmail({ to: args.email, subject, html });
}
