"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getHostClinic, redirectToUserClinic, roleHome } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/crypto/secret-box";
import { sendPasswordReset, sendClinicSignupOtp } from "@/lib/email/send-auth-email";
import { otpCooldownRemaining, recordOtpSent } from "@/server/services/otpThrottle";
import { isSyntheticEmail } from "@/server/services/patients";
import { normalizePhone } from "@/lib/phone";

// Ensure the identity Profile row exists. It's normally created by the Supabase
// auth DB trigger, but that can lag a beat right after sign-up, so we retry once
// and fall back to creating it ourselves.
async function ensureProfile(userId: string, fullName: string, phone: string | null) {
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

// Find an existing auth user by email (case-insensitive). Supabase has no
// direct getUserByEmail on this client version, so we scan — fine at our scale.
async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

// ─── Shared auth ──────────────────────────────────────────────────────────────
// One set of auth actions serves every host. The clinic comes from the request's
// subdomain (getHostClinic), so a form submitted on a clinic's /login is scoped
// to that clinic, while the same action on the root domain signs a user into the
// platform and routes them onward to their own clinic.
//
// NOTE: There is no global (clinic-less) sign-up. Accounts are only created
// under a specific clinic (startClinicSignup → verifyClinicSignup below), which
// links the new user to that clinic. Staff and admins are provisioned by an
// admin instead.

/** Root-domain sign-in: authenticate, then cross into the user's own clinic. */
async function signInToPlatform(email: string, password: string) {
  const supabase = await createClient();

  const { error, data } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { isPlatformAdmin: true },
  });

  await redirectToUserClinic(data.user.id, profile?.isPlatformAdmin ?? false);
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // No subdomain → the platform's own login.
  const clinic = await getHostClinic();
  if (!clinic) return signInToPlatform(email, password);

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
            claimPhone: (meta.claim_phone as string) ?? null,
            clinicName: clinic.name,
          });
        } catch {
          return { error: "تعذّر إرسال رمز التحقق. حاول مرة أخرى." };
        }
        await recordOtpSent(email);
      }
      await storeSignupPassword(password);
      redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
    }
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  const membership = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: data.user.id, clinicId: clinic.id } },
    select: { role: true },
  });
  if (membership) redirect(roleHome(membership.role));

  // A platform admin is a member of no clinic yet administers every one of them
  // — the same grant getClinicContext applies once they're inside. Without it
  // they'd fall into the non-member branch below and be signed straight back out
  // of the clinic they came to manage.
  const profile = await prisma.profile.findUnique({
    where: { id: data.user.id },
    select: { isPlatformAdmin: true },
  });
  if (profile?.isPlatformAdmin) redirect(roleHome(Role.ADMIN));

  // Authenticated but NOT a member of this clinic. The password check already
  // opened a session; we must not leave the visitor signed in to a clinic they
  // don't belong to — sign out immediately. The page then offers to create an
  // account here, which re-authenticates via joinClinic.
  await supabase.auth.signOut();
  return { needsJoin: true as const, clinicName: clinic.name };
}

// Create a PATIENT membership in this clinic. Re-authenticates with the same
// credentials (the sign-in flow signed the non-member out), then joins.
export async function joinClinic(formData: FormData) {
  const supabase = await createClient();

  const clinic = await getHostClinic();
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
  redirect(roleHome(Role.PATIENT));
}

// Step 1 of clinic sign-up: validate, guard against existing accounts, then have
// Supabase mint an email-verification OTP that we deliver via Resend. The user
// is created (unconfirmed) here; the ClinicMember link is created only after the
// code is verified in step 2, so an abandoned signup leaves no clinic access.
export async function startClinicSignup(formData: FormData) {
  const clinic = await getHostClinic();
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = (formData.get("email") as string)?.trim();
  const password = formData.get("password") as string;
  const fullName = (formData.get("fullName") as string)?.trim();
  let phone = (formData.get("phone") as string)?.trim() || null;
  if (!email || !password || !fullName) {
    return { error: "الرجاء تعبئة جميع الحقول." };
  }

  // Is this phone already on an account? A relative booked for by someone else
  // (or a WhatsApp-only patient) has an account with this number but only a
  // placeholder email. Signing up with that number takes the account over once
  // the email code is verified: same account id, so its appointments, records
  // and connections carry over. Only the email is verified — the phone is not.
  // A phone on an account with a real login can't be reused.
  let claimPhone: string | null = null;
  if (phone) {
    const normalized = normalizePhone(phone);
    const owner = await prisma.profile.findUnique({
      where: { phone: normalized },
      select: { id: true },
    });
    if (owner) {
      const { data: ownerAuth } = await createAdminClient().auth.admin.getUserById(owner.id);
      if (!isSyntheticEmail(ownerAuth?.user?.email)) {
        return { error: "رقم الهاتف هذا مسجّل بحساب آخر. سجّل الدخول بدلاً من ذلك." };
      }
      // The pending user must not carry the phone itself — Profile.phone is
      // unique — so it travels as claim_phone until verification.
      claimPhone = normalized;
      phone = null;
    }
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
        claimPhone,
        clinicName: clinic.name,
      });
    } catch (e) {
      return { error: e instanceof Error ? e.message : "تعذّر إرسال رمز التحقق." };
    }
    await recordOtpSent(email);
  }

  // Keep the password available so the verify page can resend a code.
  await storeSignupPassword(password);
  redirect(`/verify-otp?email=${encodeURIComponent(email)}`);
}

// Step 2 of clinic sign-up: verify the OTP (Supabase validates it), which opens
// a session, then link the now-confirmed user to this clinic as a PATIENT.
export async function verifyClinicSignup(formData: FormData) {
  const supabase = await createClient();

  const clinic = await getHostClinic();
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

  const claimPhone = (meta.claim_phone as string) || null;
  if (claimPhone) {
    const claimed = await claimAccountByPhone({
      tempUserId: data.user.id,
      email,
      fullName: (meta.full_name as string) ?? "",
      phone: claimPhone,
      clinicId: clinic.id,
    });
    if ("error" in claimed) return claimed;
    await clearSignupPassword();
    redirect(roleHome(Role.PATIENT));
  }

  await ensureProfile(
    data.user.id,
    (meta.full_name as string) ?? "",
    (meta.phone as string) ?? null
  );
  await prisma.clinicMember.upsert({
    where: { userId_clinicId: { userId: data.user.id, clinicId: clinic.id } },
    update: {},
    create: { userId: data.user.id, clinicId: clinic.id, role: Role.PATIENT },
  });

  await clearSignupPassword();
  redirect(roleHome(Role.PATIENT));
}

/**
 * Finish a signup that takes over the unclaimed account holding `phone`: the
 * just-verified pending user is removed (freeing the email), and its email,
 * password and name move onto the existing account, which is then signed in.
 * Re-checks the target is still unclaimed — it may have changed since step 1.
 */
async function claimAccountByPhone(args: {
  tempUserId: string;
  email: string;
  fullName: string;
  phone: string;
  clinicId: string;
}): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient();
  const supabase = await createClient();

  const target = await prisma.profile.findUnique({
    where: { phone: args.phone },
    select: { id: true },
  });
  const { data: targetAuth } = target
    ? await admin.auth.admin.getUserById(target.id)
    : { data: null };
  if (!target || target.id === args.tempUserId || !isSyntheticEmail(targetAuth?.user?.email)) {
    await supabase.auth.signOut();
    await admin.auth.admin.deleteUser(args.tempUserId);
    return { error: "لم يعد بالإمكان ربط هذا الرقم بحسابك. أعد التسجيل من جديد." };
  }

  const password = await readSignupPassword();
  if (!password) {
    await supabase.auth.signOut();
    await admin.auth.admin.deleteUser(args.tempUserId);
    return { error: "انتهت صلاحية الجلسة. أعد التسجيل من جديد." };
  }

  // The email belongs to the pending user until it's deleted; the profile row
  // made for it by the auth trigger goes with it (FK cascade).
  await supabase.auth.signOut();
  await admin.auth.admin.deleteUser(args.tempUserId);

  const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
    email: args.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: args.fullName, phone: args.phone },
  });
  if (updErr) return { error: "تعذّر ربط الحساب. أعد التسجيل من جديد." };

  if (args.fullName) {
    await prisma.profile.update({ where: { id: target.id }, data: { fullName: args.fullName } });
  }
  await prisma.clinicMember.upsert({
    where: { userId_clinicId: { userId: target.id, clinicId: args.clinicId } },
    update: {},
    create: { userId: target.id, clinicId: args.clinicId, role: Role.PATIENT },
  });

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: args.email,
    password,
  });
  if (signInErr) return { error: "تم ربط الحساب. سجّل الدخول ببريدك وكلمة المرور." };
  return { ok: true };
}

// Resend a signup verification code from the verify page (email only — the
// password comes from the pending-signup cookie). Rate-limited by the same
// per-email cooldown as the initial send.
export async function resendClinicSignupOtp(formData: FormData) {
  const clinic = await getHostClinic();
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
      claimPhone: (meta.claim_phone as string) ?? null,
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

  // Each clinic is its own host, so a relative redirect already lands on the
  // right login page — the clinic's subdomain, or the root domain.
  redirect("/login");
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
