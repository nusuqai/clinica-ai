import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail, type SendEmailResult } from "./resend";
import {
  clinicApprovedInviteEmail,
  clinicCreatedInviteEmail,
  passwordResetEmail,
  emailChangeEmail,
  signupOtpEmail,
} from "./templates";

// ─── Supabase-token → Resend bridge ───────────────────────────────────────────
// Supabase still owns and validates the tokens. We call generateLink() to mint a
// token WITHOUT Supabase sending anything, wrap it in a link to our own
// /auth/confirm route (verifyOtp with token_hash), and deliver it via Resend.
//
// Accounts are pre-created (email_confirm: true) so we use the "recovery" grant
// to let a user set their first password — the email copy differs per flow, but
// the underlying token is a recovery token in every "set your password" case.

function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

// verifyOtp() types accepted by our /auth/confirm route.
type ConfirmType = "recovery" | "invite" | "signup" | "magiclink" | "email_change";

// generateLink() types we use.
type LinkType = "recovery" | "invite" | "magiclink" | "email_change_new";

/**
 * Mint a Supabase action token and return a link to our own confirm route.
 * Throws on failure so callers can decide whether the surrounding action still
 * succeeds (email is best-effort; token minting failing is a real error).
 */
async function generateActionUrl(opts: {
  type: LinkType;
  email: string;
  newEmail?: string;
  next: string;
}): Promise<string> {
  const admin = createAdminClient();

  // generateLink's params are a discriminated union — email_change needs a
  // newEmail, the rest take email only. Branch so the types line up.
  const gen =
    opts.type === "email_change_new"
      ? admin.auth.admin.generateLink({
          type: opts.type,
          email: opts.email,
          newEmail: opts.newEmail!,
        })
      : admin.auth.admin.generateLink({ type: opts.type, email: opts.email });

  const { data, error } = await gen;
  if (error || !data?.properties?.hashed_token) {
    throw new Error(error?.message ?? "تعذّر إنشاء رابط التحقق");
  }

  const confirmType: ConfirmType = opts.type.startsWith("email_change")
    ? "email_change"
    : (opts.type as ConfirmType);

  const url = new URL("/auth/confirm", appUrl());
  url.searchParams.set("token_hash", data.properties.hashed_token);
  url.searchParams.set("type", confirmType);
  url.searchParams.set("next", opts.next);
  return url.toString();
}

// ─── Public senders ───────────────────────────────────────────────────────────

/** Clinic request approved → invite the admin to set their password. */
export async function sendClinicApprovedInvite(args: {
  email: string;
  name: string;
  clinicName: string;
}): Promise<SendEmailResult> {
  const url = await generateActionUrl({
    type: "recovery",
    email: args.email,
    next: "/set-password",
  });
  const { subject, html } = clinicApprovedInviteEmail({
    requesterName: args.name,
    clinicName: args.clinicName,
    actionUrl: url,
  });
  return sendEmail({ to: args.email, subject, html });
}

/** Platform admin created a clinic → invite the clinic admin to set a password. */
export async function sendClinicCreatedInvite(args: {
  email: string;
  name: string;
  clinicName: string;
}): Promise<SendEmailResult> {
  const url = await generateActionUrl({
    type: "recovery",
    email: args.email,
    next: "/set-password",
  });
  const { subject, html } = clinicCreatedInviteEmail({
    adminName: args.name,
    clinicName: args.clinicName,
    actionUrl: url,
  });
  return sendEmail({ to: args.email, subject, html });
}

/** Forgot-password → send a branded recovery link. */
export async function sendPasswordReset(args: {
  email: string;
  name: string | null;
}): Promise<SendEmailResult> {
  const url = await generateActionUrl({
    type: "recovery",
    email: args.email,
    next: "/reset-password",
  });
  const { subject, html } = passwordResetEmail({ name: args.name, actionUrl: url });
  return sendEmail({ to: args.email, subject, html });
}

// Mint a signup OTP. generateLink({type:"signup"}) creates the user, so it only
// works for an email with no account. To also support re-sending to an existing
// UNCONFIRMED user (e.g. they abandoned verification and tried to log in), we
// fall back to deleting the stale account and re-creating it. Safe because an
// unconfirmed signup has no ClinicMember yet.
async function mintSignupOtp(args: {
  email: string;
  password: string;
  name: string;
  phone: string | null;
}): Promise<string> {
  const admin = createAdminClient();
  const gen = () =>
    admin.auth.admin.generateLink({
      type: "signup",
      email: args.email,
      password: args.password,
      options: { data: { full_name: args.name, phone: args.phone } },
    });

  const first = await gen();
  if (!first.error && first.data?.properties?.email_otp) {
    return first.data.properties.email_otp;
  }

  // The user already exists — remove the stale unconfirmed account and retry.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === args.email.toLowerCase(),
  );
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const second = await gen();
  if (second.error || !second.data?.properties?.email_otp) {
    throw new Error(second.error?.message ?? "تعذّر إنشاء رمز التحقق");
  }
  return second.data.properties.email_otp;
}

/**
 * Signup email verification: Supabase creates the (unconfirmed) user + a
 * one-time code via generateLink, we deliver the CODE via Resend. Supabase
 * stays the authority for both creating and verifying the OTP. Works for a new
 * email or a re-send to an existing unconfirmed account (see mintSignupOtp).
 */
export async function sendClinicSignupOtp(args: {
  email: string;
  password: string;
  name: string;
  phone: string | null;
  clinicName: string;
}): Promise<SendEmailResult> {
  const email_otp = await mintSignupOtp(args);

  // Dev convenience: with no Resend key the email is a no-op, so surface the
  // code in the server log to make local testing possible. Never logs in prod
  // (a real key is set there).
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email][dev] signup OTP for ${args.email}: ${email_otp}`);
  }

  const { subject, html } = signupOtpEmail({
    name: args.name,
    clinicName: args.clinicName,
    code: email_otp,
  });
  return sendEmail({ to: args.email, subject, html });
}

/** Email change → send a branded confirmation to the NEW address. */
export async function sendEmailChange(args: {
  currentEmail: string;
  newEmail: string;
  name: string | null;
}): Promise<SendEmailResult> {
  const url = await generateActionUrl({
    type: "email_change_new",
    email: args.currentEmail,
    newEmail: args.newEmail,
    next: "/dashboard",
  });
  const { subject, html } = emailChangeEmail({
    name: args.name,
    newEmail: args.newEmail,
    actionUrl: url,
  });
  return sendEmail({ to: args.newEmail, subject, html });
}
