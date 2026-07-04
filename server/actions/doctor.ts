"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { AppointmentStatus, DayOfWeek } from "@prisma/client";

import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireDoctor(): Promise<{ userId: string; doctorId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "DOCTOR") throw new Error("غير مصرح");

  return { userId: user.id, doctorId: user.id };
}

// ─── Appointment actions ──────────────────────────────────────────────────────

export async function updateAppointmentStatusAsDoctorAction(
  appointmentId: string,
  status: AppointmentStatus,
  cancellationReason?: string,
) {
  const { doctorId } = await requireDoctor();

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctorId },
  });
  if (!appt) return { error: "الموعد غير موجود أو غير مصرح" };

  const result = await AppointmentService.updateAppointmentStatus(
    appointmentId,
    status,
    cancellationReason,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/appointments");
  revalidatePath("/doctor");
  return { success: true };
}

export async function updateDoctorNotesAction(
  appointmentId: string,
  doctorNotes: string,
) {
  const { doctorId } = await requireDoctor();

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctorId },
  });
  if (!appt) return { error: "الموعد غير موجود أو غير مصرح" };

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { doctorNotes },
  });

  revalidatePath("/doctor/appointments");
  return { success: true };
}

// ─── Profile actions ──────────────────────────────────────────────────────────

export async function updateMyProfileAction(formData: FormData) {
  const { doctorId } = await requireDoctor();

  const result = await DoctorService.updateDoctor({
    doctorId,
    fullName: (formData.get("fullName") as string) || undefined,
    phone: (formData.get("phone") as string) || null,
    specialty: (formData.get("specialty") as string) || undefined,
    bio: (formData.get("bio") as string) || undefined,
    consultationFee: formData.get("consultationFee")
      ? Number(formData.get("consultationFee"))
      : undefined,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/profile");
  revalidatePath("/doctor");
  return { success: true };
}

// ─── Availability Rule actions ────────────────────────────────────────────────

export async function createMyRuleAction(formData: FormData) {
  const { doctorId } = await requireDoctor();

  const result = await DoctorService.createRule({
    doctorId,
    dayOfWeek: formData.get("dayOfWeek") as DayOfWeek,
    startTime: formData.get("startTime") as string,
    endTime: formData.get("endTime") as string,
    slotDurationMin: formData.get("slotDurationMin")
      ? Number(formData.get("slotDurationMin"))
      : 30,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { success: true };
}

export async function deleteMyRuleAction(ruleId: string) {
  const { doctorId } = await requireDoctor();

  const rule = await prisma.availabilityRule.findFirst({
    where: { id: ruleId, doctorId },
  });
  if (!rule) return { error: "القاعدة غير موجودة أو غير مصرح" };

  const result = await DoctorService.deleteRule(ruleId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { success: true };
}

export async function toggleMyRuleActiveAction(ruleId: string, isActive: boolean) {
  const { doctorId } = await requireDoctor();

  const rule = await prisma.availabilityRule.findFirst({
    where: { id: ruleId, doctorId },
  });
  if (!rule) return { error: "القاعدة غير موجودة أو غير مصرح" };

  const result = await DoctorService.toggleRuleActive(ruleId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { success: true };
}

export async function generateMySlotsAction(ruleId: string) {
  const { doctorId } = await requireDoctor();

  const rule = await prisma.availabilityRule.findFirst({
    where: { id: ruleId, doctorId },
  });
  if (!rule) return { error: "القاعدة غير موجودة أو غير مصرح" };

  const result = await DoctorService.generateSlotsForRule(ruleId, 30);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { success: true, count: result.data.count };
}

export async function toggleMySlotBlockedAction(slotId: string) {
  const { doctorId } = await requireDoctor();

  const slot = await prisma.slot.findFirst({
    where: { id: slotId, doctorId },
  });
  if (!slot) return { error: "الموعد غير موجود أو غير مصرح" };

  const result = await DoctorService.toggleSlotBlocked(slotId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/doctor/schedule");
  return { success: true };
}
