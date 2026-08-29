"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getActiveClinicContext } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
import { expectedOrderTime } from "@/lib/availability/queue-time";

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
): Promise<DoctorService.AvailableDay[]> {
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

/**
 * Order-based availability for a (doctor, date): null when that day is
 * slot-based. Lets the web booking widget switch to a queue UI.
 */
export async function getOrderBookingInfoAction(
  doctorId: string,
  dateStr: string,
): Promise<{
  available: boolean;
  remaining: number | null;
  nextOrderNumber: number;
  currentOrder: number | null;
  estimatedDurationMin: number | null;
  expectedTime: string | null;
} | null> {
  const info = await QueueService.getOrderBookingInfo(doctorId, new Date(dateStr));
  if (!info) return null;
  const nextOrderNumber = info.booked + 1;
  return {
    available: info.available,
    remaining: info.remaining,
    nextOrderNumber,
    currentOrder: info.trackCurrentOrder ? info.currentOrder : null,
    estimatedDurationMin: info.estimatedDurationMin,
    expectedTime: expectedOrderTime(
      info.sessionStart,
      nextOrderNumber,
      info.estimatedDurationMin,
    ),
  };
}

// ─── Patient mutations ────────────────────────────────────────────────────────

export async function bookOrderAppointmentAction(
  doctorId: string,
  dateStr: string,
  patientNotes?: string,
): Promise<{ ok: boolean; error?: string; orderNumber?: number }> {
  const ctx = await getActiveClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT)
    return { ok: false, error: "هذه الخدمة للمرضى فقط" };

  const result = await QueueService.bookOrderAppointment(
    ctx.user.id,
    doctorId,
    new Date(dateStr),
    { notes: patientNotes },
  );
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/clinic/[slug]/dashboard", "page");
  revalidatePath("/clinic/[slug]/dashboard/appointments", "page");
  return { ok: true, orderNumber: result.data.orderNumber };
}

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
