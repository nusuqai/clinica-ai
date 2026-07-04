"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { AppointmentStatus, Role } from "@prisma/client";

import * as DoctorService from "@/server/services/doctors";
import * as UserService from "@/server/services/users";
import * as AppointmentService from "@/server/services/appointments";

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("غير مصرح");

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  if (profile?.role !== "ADMIN") throw new Error("غير مصرح");
}

// ─── Doctor actions ───────────────────────────────────────────────────────────

export async function createDoctorAction(formData: FormData) {
  await requireAdmin();

  const result = await DoctorService.createDoctorAccount({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    fullName: formData.get("fullName") as string,
    phone: (formData.get("phone") as string) || undefined,
    specialty: formData.get("specialty") as string,
    bio: (formData.get("bio") as string) || undefined,
    consultationFee: formData.get("consultationFee")
      ? Number(formData.get("consultationFee"))
      : undefined,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors");
  return { success: true };
}

export async function updateDoctorAction(formData: FormData) {
  await requireAdmin();

  const result = await DoctorService.updateDoctor({
    doctorId: formData.get("doctorId") as string,
    fullName: (formData.get("fullName") as string) || undefined,
    phone: (formData.get("phone") as string) || null,
    specialty: (formData.get("specialty") as string) || undefined,
    bio: (formData.get("bio") as string) || undefined,
    consultationFee: formData.get("consultationFee")
      ? Number(formData.get("consultationFee"))
      : undefined,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors");
  return { success: true };
}

export async function setDoctorActiveAction(doctorId: string, isActive: boolean) {
  await requireAdmin();
  const result = await DoctorService.setDoctorActive(doctorId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors");
  return { success: true };
}

export async function deleteDoctorAction(doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.deleteDoctor(doctorId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors");
  revalidatePath("/admin/users");
  return { success: true };
}

// ─── User actions ─────────────────────────────────────────────────────────────

export async function updateUserRoleAction(userId: string, role: Role) {
  await requireAdmin();
  const result = await UserService.updateUserRole(userId, role);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function deleteUserAction(userId: string) {
  await requireAdmin();
  const result = await UserService.deleteUser(userId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/users");
  return { success: true };
}

// ─── Appointment actions ──────────────────────────────────────────────────────

export async function updateAppointmentStatusAction(
  appointmentId: string,
  status: AppointmentStatus,
  cancellationReason?: string
) {
  await requireAdmin();
  const result = await AppointmentService.updateAppointmentStatus(
    appointmentId,
    status,
    cancellationReason
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/appointments");
  return { success: true };
}

// ─── Availability Rule actions ────────────────────────────────────────────────

export async function createRuleAction(formData: FormData) {
  await requireAdmin();
  const doctorId = formData.get("doctorId") as string;
  const result = await DoctorService.createRule({
    doctorId,
    dayOfWeek: formData.get("dayOfWeek") as import("@prisma/client").DayOfWeek,
    startTime: formData.get("startTime") as string,
    endTime: formData.get("endTime") as string,
    slotDurationMin: formData.get("slotDurationMin")
      ? Number(formData.get("slotDurationMin"))
      : 30,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/doctors/${doctorId}`);
  return { success: true };
}

export async function deleteRuleAction(ruleId: string, doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.deleteRule(ruleId);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/doctors/${doctorId}`);
  return { success: true };
}

export async function toggleRuleActiveAction(
  ruleId: string,
  isActive: boolean,
  doctorId: string,
) {
  await requireAdmin();
  const result = await DoctorService.toggleRuleActive(ruleId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/doctors/${doctorId}`);
  return { success: true };
}

export async function generateSlotsAction(ruleId: string, doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.generateSlotsForRule(ruleId, 30);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/doctors/${doctorId}`);
  return { success: true, count: result.data.count };
}

// ─── Slot actions ─────────────────────────────────────────────────────────────

export async function toggleSlotBlockedAction(slotId: string, doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.toggleSlotBlocked(slotId);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/doctors/${doctorId}`);
  return { success: true };
}
