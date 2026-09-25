import "server-only";
import { sendEmail, type SendEmailResult } from "./resend";
import { requestReceivedEmail, clinicRejectedEmail, clinicLowUnitsAlertEmail } from "./templates";
import { platformAdminEmails } from "@/lib/supabase/auth-users";

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

/** Base URL for links back into the platform console. Mirrors send-auth-email. */
function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

/**
 * Who receives internal platform alerts. PLATFORM_ALERT_EMAIL wins when set
 * (comma-separated for several mailboxes); otherwise every platform admin's own
 * account email is used, so this works without configuration.
 */
async function alertRecipients(): Promise<string[]> {
  const configured = process.env.PLATFORM_ALERT_EMAIL;
  if (configured?.trim()) {
    return configured
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
  }
  return platformAdminEmails();
}

/**
 * INTERNAL: tell the platform admins that a clinic is low on (or out of) AI
 * units. Called once per threshold crossing — the dedupe stamps on
 * ClinicAiCredit are what keep it from firing on every reply.
 *
 * Never throws: it is invoked from the agent's billing path, where a mail
 * failure must never disturb a reply that has already been delivered.
 */
export async function sendClinicLowUnitsAlert(args: {
  clinicName: string;
  clinicSlug: string;
  unitBalance: number;
  lowUnitsThreshold: number;
  severity: "low" | "out";
}): Promise<void> {
  try {
    const recipients = await alertRecipients();
    if (recipients.length === 0) {
      console.warn(
        `[email] no platform alert recipient — skipped low-units alert for ${args.clinicSlug}`
      );
      return;
    }

    const { subject, html } = clinicLowUnitsAlertEmail({
      ...args,
      actionUrl: `${appUrl()}/platform/credits`,
    });

    // One message per mailbox: the wrapper takes a single recipient, and a
    // failure to one admin shouldn't silently drop the others.
    await Promise.all(recipients.map((to) => sendEmail({ to, subject, html })));
  } catch (err) {
    console.error("[email] failed to send low-units alert:", err);
  }
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
