"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getActiveClinicContext } from "@/lib/auth";
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
    revalidatePath("/clinic/[slug]/dashboard", "page");
    revalidatePath("/clinic/[slug]/dashboard/profile", "page");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "فشل تحديث الملف الشخصي",
    };
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
  const uncancellable: AppointmentStatus[] = [
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
  ];
  if (uncancellable.includes(appointment.status))
    return { ok: false, error: "لا يمكن إلغاء هذا الموعد" };

  const result = await AppointmentService.updateAppointmentStatus(
    appointmentId,
    AppointmentStatus.CANCELLED,
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/clinic/[slug]/dashboard", "page");
  revalidatePath("/clinic/[slug]/dashboard/appointments", "page");
  return { ok: true };
}

// ─── Public queries (no auth required) ───────────────────────────────────────

export async function getAvailableDaysAction(
  doctorId: string,
): Promise<string[]> {
  return DoctorService.getAvailableDaysForBooking(doctorId);
}

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
  const ctx = await getActiveClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) {
    return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  }

  const result = await AppointmentService.createAppointment(
    ctx.user.id,
    slotId,
    patientNotes,
  );

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}
