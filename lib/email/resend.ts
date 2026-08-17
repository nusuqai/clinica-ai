import "server-only";
import { Resend } from "resend";

// ─── Resend client ────────────────────────────────────────────────────────────
// A single lazily-created client. Sending is a no-op (logged, not thrown) when
// RESEND_API_KEY is unset so local dev and CI don't break — real delivery only
// happens once the key + verified domain are configured (see docs/EMAIL.md).

let client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

// Platform sender identity, e.g. `Nusuq <noreply@yourdomain.com>`.
// Falls back to Resend's shared sandbox address (only delivers to your own
// Resend account email) so the wiring is testable before the domain verifies.
function fromAddress(): string {
  return process.env.EMAIL_FROM ?? "NusuqAI <noreply@clinica.nusuqai.com>";
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

/**
 * Send one transactional email. Never throws — callers get a Result so a mail
 * failure never breaks the surrounding action (approving a clinic must still
 * succeed even if the email bounces).
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const resend = getClient();
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY not set — skipped sending "${input.subject}" to ${input.to}`,
    );
    return { ok: true, id: null };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
    });
    if (error) {
      console.error(`[email] send failed to ${input.to}:`, error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error(`[email] send threw for ${input.to}:`, msg);
    return { ok: false, error: msg };
  }
}
