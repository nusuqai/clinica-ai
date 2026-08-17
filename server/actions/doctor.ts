"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Role, type AppointmentStatus, type DayOfWeek } from "@prisma/client";

import { getActiveClinicContext } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import { listDoctorBranchIds } from "@/server/services/branches";
import { resolveSpecialtyId } from "@/server/services/specialties";

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireDoctor(): Promise<{
  userId: string;
  doctorId: string;
  clinicId: string;
}> {
  const ctx = await getActiveClinicContext();
  if (!ctx || ctx.role !== Role.DOCTOR) throw new Error("غير مصرح");

  const doctor = await prisma.doctor.findFirst({
    where: { profileId: ctx.user.id, clinicId: ctx.clinic.id },
    select: { id: true },
  });
  if (!doctor) throw new Error("غير مصرح");

  return { userId: ctx.user.id, doctorId: doctor.id, clinicId: ctx.clinic.id };
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
  revalidatePath("/clinic/[slug]/doctor/appointments", "page");
  revalidatePath("/clinic/[slug]/doctor", "page");
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

  revalidatePath("/clinic/[slug]/doctor/appointments", "page");
  return { success: true };
}

// ─── Profile actions ──────────────────────────────────────────────────────────

export async function updateMyProfileAction(formData: FormData) {
  const { doctorId, clinicId } = await requireDoctor();

  const specialtyRes = await resolveSpecialtyId(clinicId, {
    specialtyId: (formData.get("specialtyId") as string) || null,
    newSpecialtyName: (formData.get("newSpecialtyName") as string) || null,
  });
  if (!specialtyRes.ok) return { error: specialtyRes.error };

  const result = await DoctorService.updateDoctor({
    doctorId,
    fullName: (formData.get("fullName") as string) || undefined,
    phone: (formData.get("phone") as string) || null,
    specialtyId: specialtyRes.data,
    bio: (formData.get("bio") as string) || undefined,
    consultationFee: formData.get("consultationFee")
      ? Number(formData.get("consultationFee"))
      : undefined,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/doctor/profile", "page");
  revalidatePath("/clinic/[slug]/doctor", "page");
  return { success: true };
}

// ─── Availability Rule actions ────────────────────────────────────────────────

export async function createMyRuleAction(formData: FormData) {
  const { doctorId } = await requireDoctor();

  // Branch is required; if the form omits it, fall back to the doctor's single
  // branch when there's exactly one.
  let branchId = (formData.get("branchId") as string) || "";
  if (!branchId) {
    const branchIds = await listDoctorBranchIds(doctorId);
    if (branchIds.length === 1) branchId = branchIds[0];
    else return { error: "اختر الفرع لهذه القاعدة." };
  }

  const result = await DoctorService.createRule({
    doctorId,
    branchId,
    dayOfWeek: formData.get("dayOfWeek") as DayOfWeek,
    startTime: formData.get("startTime") as string,
    endTime: formData.get("endTime") as string,
    slotDurationMin: formData.get("slotDurationMin")
      ? Number(formData.get("slotDurationMin"))
      : 30,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/doctor/schedule", "page");
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
  revalidatePath("/clinic/[slug]/doctor/schedule", "page");
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
  revalidatePath("/clinic/[slug]/doctor/schedule", "page");
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
  revalidatePath("/clinic/[slug]/doctor/schedule", "page");
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
  revalidatePath("/clinic/[slug]/doctor/schedule", "page");
  return { success: true };
}
