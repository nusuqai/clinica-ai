"use server";

import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { redirectToUserClinic } from "@/lib/auth";
import { DEFAULT_CLINIC_ID } from "@/lib/tenant";

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

  // Give the caller a PATIENT membership in the default clinic (public
  // self-registration). The identity profile is created by the auth DB trigger.
  const userId = data.user?.id;
  if (userId) {
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
    await prisma.clinicMember.upsert({
      where: { userId_clinicId: { userId, clinicId: DEFAULT_CLINIC_ID } },
      update: {},
      create: { userId, clinicId: DEFAULT_CLINIC_ID, role: Role.PATIENT },
    });
    await redirectToUserClinic(userId, false);
  }

  redirect("/login");
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
