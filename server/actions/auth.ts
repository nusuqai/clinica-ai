"use server";

import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirectToUserClinic, roleHome } from "@/lib/auth";

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

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const phone = formData.get("phone") as string;

  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return { error: "هذا البريد الإلكتروني مسجل بالفعل. جرب تسجيل الدخول." };
    }
    return { error: error.message };
  }

  // Root sign-up creates a ClinicaAI account only — it is NOT tied to any
  // clinic. Patients join a specific clinic via /clinic/{slug}/register, and
  // staff/admins are added to a clinic by an admin. The identity profile is
  // created by the auth DB trigger (ensured here as a fallback).
  const userId = data.user?.id;
  if (userId) {
    await ensureProfile(userId, fullName, phone);
    redirect("/");
  }

  redirect("/login");
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

export async function signUpToClinic(slug: string, formData: FormData) {
  const supabase = await createClient();

  const clinic = await activeClinicBySlug(slug);
  if (!clinic) return { error: "العيادة غير موجودة." };

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const phone = formData.get("phone") as string;

  const { error, data } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      return {
        error: "هذا البريد مسجل بالفعل. سجّل الدخول لإضافة حسابك إلى هذه العيادة.",
      };
    }
    return { error: error.message };
  }

  const userId = data.user?.id;
  if (userId) {
    await ensureProfile(userId, fullName, phone);
    await prisma.clinicMember.upsert({
      where: { userId_clinicId: { userId, clinicId: clinic.id } },
      update: {},
      create: { userId, clinicId: clinic.id, role: Role.PATIENT },
    });
    redirect(roleHome(slug, Role.PATIENT));
  }

  redirect(`/clinic/${slug}/login`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ─── Hidden flows (not exposed in UI, kept for future use) ───────────────────

// export async function forgotPassword(formData: FormData) {
//   const supabase = await createClient();
//   const email = formData.get("email") as string;
//   const { error } = await supabase.auth.resetPasswordForEmail(email, {
//     redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/reset-password`,
//   });
//   if (error) return { error: "تعذّر إرسال البريد. تحقق من العنوان وحاول مرة أخرى." };
//   redirect(`/verify-otp?email=${encodeURIComponent(email)}&type=recovery`);
// }

// export async function verifyOtp(formData: FormData) {
//   const supabase = await createClient();
//   const email = formData.get("email") as string;
//   const token = formData.get("token") as string;
//   const type  = formData.get("type")  as "signup" | "recovery";
//   const { error } = await supabase.auth.verifyOtp({ email, token, type });
//   if (error) return { error: "الرمز غير صحيح أو منتهي الصلاحية." };
//   redirect(type === "recovery" ? "/reset-password" : "/dashboard");
// }

// export async function resetPassword(formData: FormData) {
//   const supabase = await createClient();
//   const password = formData.get("password") as string;
//   const { error } = await supabase.auth.updateUser({ password });
//   if (error) return { error: "تعذّر تحديث كلمة المرور. قد تكون الجلسة منتهية." };
//   redirect("/login?reset=success");
// }
