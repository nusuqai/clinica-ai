"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";

// ─── Profile mutations ────────────────────────────────────────────────────────

export async function updateProfileAction(
  fullName: string,
  phone: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" };

  try {
    await prisma.profile.update({
      where: { id: user.id },
      data: { fullName: fullName.trim(), phone: phone?.trim() || null },
    });
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/profile");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "فشل تحديث الملف الشخصي" };
  }
}

// ─── Appointment mutations ────────────────────────────────────────────────────

export async function cancelAppointmentAction(
  appointmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" };

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { patientId: true, status: true },
  });

  if (!appointment) return { ok: false, error: "الموعد غير موجود" };
  if (appointment.patientId !== user.id)
    return { ok: false, error: "ليس لديك صلاحية إلغاء هذا الموعد" };
  if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appointment.status))
    return { ok: false, error: "لا يمكن إلغاء هذا الموعد" };

  const result = await AppointmentService.updateAppointmentStatus(appointmentId, "CANCELLED");
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/appointments");
  return { ok: true };
}

// ─── Public queries (no auth required) ───────────────────────────────────────

export async function getAvailableSlotsAction(
  doctorId: string,
  dateStr: string,
): Promise<{ id: string; startTime: string; endTime: string }[]> {
  const date = new Date(dateStr);
  const slots = await DoctorService.getAvailableSlotsForBooking(doctorId, date);
  return slots.map((s) => ({
    id: s.id,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
  }));
}

// ─── Patient mutations ────────────────────────────────────────────────────────

export async function bookAppointmentAction(
  slotId: string,
  patientNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "يجب تسجيل الدخول أولاً" };

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  if (!profile || profile.role !== "PATIENT") {
    return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  }

  const result = await AppointmentService.createAppointment(
    user.id,
    slotId,
    patientNotes,
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}
