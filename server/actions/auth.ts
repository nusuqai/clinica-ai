"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirectToUserClinic, roleHome, ACTIVE_CLINIC_COOKIE } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import {
  sendPasswordReset,
  sendClinicSignupOtp,
} from "@/lib/email/send-auth-email";
import {
  otpCooldownRemaining,
  recordOtpSent,
} from "@/server/services/otpThrottle";

// Ensure the identity Profile row exists. It's normally created by the Supabase
// auth DB trigger, but that can lag a beat right after sign-up, so we retry once
// and fall back to creating it ourselves.
async function ensureProfile(
  userId: string,
  fullName: string,
  phone: string | null,
) {
  let profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile) {
    await new Promise((r) => setTimeout(r, 500));
    profile = await prisma.profile.findUnique({ where: { id: userId } });
  }
  if (!profile) {
    await prisma.profile.create({
      data: { id: userId, fullName, phone: phone || null },
    });
  }
}

// ─── Pending-signup password ─────────────────────────────────────────────────
// Minting a signup OTP requires the password, but the verify page (which offers
// "resend") only knows the email. We stash the password in a short-lived,
// httpOnly cookie — encrypted at rest with the same AES key as WhatsApp tokens —
// so a resend can re-mint without exposing or re-asking for it. Cleared on
// successful verification.
const SIGNUP_PW_COOKIE = "pending_signup_pw";

async function storeSignupPassword(password: string): Promise<void> {
  try {
    (await cookies()).set(SIGNUP_PW_COOKIE, encryptSecret(password), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15, // 15 minutes to finish verifying
    });
  } catch {
    // No encryption key configured → resend just won't work; signup still does.
  }
}

async function readSignupPassword(): Promise<string | null> {
  const raw = (await cookies()).get(SIGNUP_PW_COOKIE)?.value;
  if (!raw) return null;
  try {
    return decryptSecret(raw);
  } catch {
    return null;
  }
}

async function clearSignupPassword(): Promise<void> {
  try {
    (await cookies()).delete(SIGNUP_PW_COOKIE);
  } catch {
    // ignore
  }
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { isPlatformAdmin: true },
  });

  await redirectToUserClinic(data.user.id, profile?.isPlatformAdmin ?? false);
}

// NOTE: There is no global (clinic-less) sign-up. Accounts are only created
// under a specific clinic via /clinic/{slug}/register (startClinicSignup →
// verifyClinicSignup below), which links the new user to that clinic. Staff and
// admins are provisioned by an admin instead.

// Find an existing auth user by email (case-insensitive). Supabase has no
// direct getUserByEmail on this client version, so we scan — fine at our scale.
async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return (
    data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ??
    null
  );
}

// ─── Per-clinic auth ──────────────────────────────────────────────────────────
// Login / register scoped to a specific clinic (from the /clinic/[slug]/... URL),
// so we know which clinic a self-registering patient is joining and can route an
// existing account straight to its dashboard in that clinic.

async function activeClinicBySlug(slug: string) {
  return prisma.clinic.findFirst({
    where: { slug, isActive: true },
    select: { id: true, name: true },
  });
}

export async function signInToClinic(slug: string, formData: FormData) {
  const supabase = await createClient();

  const clinic = await activeClinicBySlug(slug);
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    // Password was correct but the email is still unverified. (Supabase only
    // returns this once the password checks out, so it can't be used to probe
    // accounts.) Re-issue the signup OTP and route them to verification.
    const notConfirmed =
      error.code === "email_not_confirmed" ||
      /not confirmed|confirm your email/i.test(error.message);
    if (notConfirmed) {
      // Respect the resend cooldown: within it, the recent code is still valid,
      // so just send them to the verification page without emailing again.
      if ((await otpCooldownRemaining(email)) === 0) {
        const existing = await findAuthUserByEmail(email);
        const meta = existing?.user_metadata ?? {};
        try {
          await sendClinicSignupOtp({
            email,
            password,
            name: (meta.full_name as string) ?? "",
            phone: (meta.phone as string) ?? null,
            clinicName: clinic.name,
          });
        } catch {
          return { error: "تعذّر إرسال رمز التحقق. حاول مرة أخرى." };
        }
        await recordOtpSent(email);
      }
      await storeSignupPassword(password);
      redirect(`/clinic/${slug}/verify-otp?email=${encodeURIComponent(email)}`);
    }
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  const membership = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: data.user.id, clinicId: clinic.id } },
    select: { role: true },
  });
  if (membership) redirect(roleHome(slug, membership.role));

  // Platform admins may enter any clinic even without a membership.
  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { isPlatformAdmin: true },
  });
  if (profile?.isPlatformAdmin) redirect(roleHome(slug, Role.ADMIN));

  // Authenticated but NOT a member of this clinic. The password check already
  // opened a session; we must not leave the visitor signed in to a clinic they
  // don't belong to — sign out immediately. The page then offers to create an
  // account here, which re-authenticates via joinClinic.
  await supabase.auth.signOut();
  return { needsJoin: true as const, clinicName: clinic.name };
}

// Create a PATIENT membership in this clinic. Re-authenticates with the same
// credentials (the sign-in flow signed the non-member out), then joins.
export async function joinClinic(slug: string, formData: FormData) {
  const supabase = await createClient();

  const clinic = await activeClinicBySlug(slug);
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    return { error: "تعذّر تأكيد الحساب. حاول تسجيل الدخول مرة أخرى." };
  }

  await prisma.clinicMember.upsert({
    where: { userId_clinicId: { userId: data.user.id, clinicId: clinic.id } },
    update: {},
    create: { userId: data.user.id, clinicId: clinic.id, role: Role.PATIENT },
  });
  redirect(roleHome(slug, Role.PATIENT));
}

// Step 1 of clinic sign-up: validate, guard against existing accounts, then have
// Supabase mint an email-verification OTP that we deliver via Resend. The user
// is created (unconfirmed) here; the ClinicMember link is created only after the
// code is verified in step 2, so an abandoned signup leaves no clinic access.
export async function startClinicSignup(slug: string, formData: FormData) {
  const clinic = await activeClinicBySlug(slug);
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const fullName = (formData.get("fullName") as string)?.trim();
  const phone = (formData.get("phone") as string)?.trim() || null;
  if (!email || !password || !fullName) {
    return { error: "الرجاء تعبئة جميع الحقول." };
  }

  // Is this email already registered?
  const existing = await findAuthUserByEmail(email);
  if (existing) {
    if (existing.email_confirmed_at) {
      const member = await prisma.clinicMember.findUnique({
        where: { userId_clinicId: { userId: existing.id, clinicId: clinic.id } },
        select: { userId: true },
      });
      if (member) {
        return { error: "لديك حساب بالفعل في هذه العيادة. سجّل الدخول." };
      }
      // Confirmed account exists elsewhere — don't create a duplicate. Ask them
      // to log in; logging in under this clinic joins them to it (joinClinic).
      return {
        needsLogin: true as const,
        error: "لديك حساب بالفعل. سجّل الدخول لإضافته إلى هذه العيادة.",
      };
    }
    // An unconfirmed account from an abandoned signup — clear it so we can
    // re-create cleanly with a fresh code (safe: no clinic link exists yet).
    await createAdminClient().auth.admin.deleteUser(existing.id);
  }

  // Send a code only if we're outside the cooldown (a rapid re-submit reuses the
  // code already sent); either way land the user on the verification page.
  if ((await otpCooldownRemaining(email)) === 0) {
    try {
      await sendClinicSignupOtp({
        email,
        password,
        name: fullName,
        phone,
        clinicName: clinic.name,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "تعذّر إرسال رمز التحقق." };
    }
    await recordOtpSent(email);
  }

  // Keep the password available so the verify page can resend a code.
  await storeSignupPassword(password);
  redirect(`/clinic/${slug}/verify-otp?email=${encodeURIComponent(email)}`);
}

// Step 2 of clinic sign-up: verify the OTP (Supabase validates it), which opens
// a session, then link the now-confirmed user to this clinic as a PATIENT.
export async function verifyClinicSignup(slug: string, formData: FormData) {
  const supabase = await createClient();

  const clinic = await activeClinicBySlug(slug);
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = (formData.get("email") as string)?.trim();
  const token = (formData.get("token") as string)?.trim();
  if (!email || !token) return { error: "أدخل الرمز المرسل إلى بريدك." };

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "signup",
  });
  if (error || !data.user) {
    return { error: "الرمز غير صحيح أو منتهت صلاحيته." };
  }

  const meta = data.user.user_metadata ?? {};
  await ensureProfile(
    data.user.id,
    (meta.full_name as string) ?? "",
    (meta.phone as string) ?? null,
  );
  await prisma.clinicMember.upsert({
    where: { userId_clinicId: { userId: data.user.id, clinicId: clinic.id } },
    update: {},
    create: { userId: data.user.id, clinicId: clinic.id, role: Role.PATIENT },
  });

  await clearSignupPassword();
  redirect(roleHome(slug, Role.PATIENT));
}

// Resend a signup verification code from the verify page (email only — the
// password comes from the pending-signup cookie). Rate-limited by the same
// per-email cooldown as the initial send.
export async function resendClinicSignupOtp(slug: string, formData: FormData) {
  const clinic = await activeClinicBySlug(slug);
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = (formData.get("email") as string)?.trim();
  if (!email) return { error: "بريد غير صالح." };

  const wait = await otpCooldownRemaining(email);
  if (wait > 0) {
    return { error: `يمكنك طلب رمز جديد بعد ${wait} ثانية.`, retryAfter: wait };
  }

  const password = await readSignupPassword();
  if (!password) {
    // The pending-signup context expired — they need to start over.
    return { error: "انتهت صلاحية الجلسة. أعد التسجيل من جديد.", expired: true as const };
  }

  const existing = await findAuthUserByEmail(email);
  const meta = existing?.user_metadata ?? {};
  try {
    await sendClinicSignupOtp({
      email,
      password,
      name: (meta.full_name as string) ?? "",
      phone: (meta.phone as string) ?? null,
      clinicName: clinic.name,
    });
  } catch {
    return { error: "تعذّر إرسال رمز التحقق. حاول مرة أخرى." };
  }
  await recordOtpSent(email);
  return { success: true as const, retryAfter: 60 };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Return to the login page of the clinic the user was in (tracked by the
  // middleware's active-clinic cookie), falling back to the root login.
  const slug = (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value;
  redirect(slug ? `/clinic/${slug}/login` : "/login");
}

// ─── Password recovery & first-password (set) flows ──────────────────────────
// We mint the recovery token ourselves and deliver a branded email via Resend
// (lib/email). The link lands on /auth/confirm, which opens a session, so the
// set-password / reset-password pages just call updateUser({ password }).

// Send a branded password-reset email. Always returns success to avoid leaking
// which addresses have accounts (account enumeration).
export async function forgotPassword(formData: FormData) {
  const email = (formData.get("email") as string)?.trim();
  if (!email) return { error: "أدخل بريدك الإلكتروني." };

  try {
    // generateLink no-ops harmlessly for unknown emails; we ignore the result
    // either way so the response can't be used to enumerate accounts.
    await sendPasswordReset({ email, name: null });
  } catch {
    // Swallow — never reveal whether the email exists.
  }
  return { success: true as const };
}

// Set a new password. Requires an active session (opened by /auth/confirm from
// the emailed link). Used by both the "set your password" invite flow and the
// "reset password" recovery flow.
export async function setNewPassword(formData: FormData) {
  const supabase = await createClient();
  const password = formData.get("password") as string;
  const confirm = formData.get("confirmPassword") as string;

  if (!password || password.length < 8) {
    return { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل." };
  }
  if (password !== confirm) {
    return { error: "كلمتا المرور غير متطابقتين." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "انتهت صلاحية الرابط. اطلب رابطاً جديداً وحاول مرة أخرى." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "تعذّر تحديث كلمة المرور. حاول مرة أخرى." };

  redirect("/login?reset=success");
}
