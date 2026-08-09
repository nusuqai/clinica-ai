"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, Role } from "@prisma/client";

import { getActiveClinicContext } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as UserService from "@/server/services/users";
import * as AppointmentService from "@/server/services/appointments";

// ─── Guard ────────────────────────────────────────────────────────────────────

// Returns the admin's clinic id (throws if the caller is not a clinic ADMIN).
async function requireAdmin(): Promise<string> {
  const ctx = await getActiveClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) throw new Error("غير مصرح");
  return ctx.clinic.id;
}

// ─── Doctor actions ───────────────────────────────────────────────────────────

export async function createDoctorAction(formData: FormData) {
  const clinicId = await requireAdmin();

  const withAccount = !!(formData.get("email") as string)?.trim();
  const base = {
    clinicId,
    fullName: formData.get("fullName") as string,
    phone: (formData.get("phone") as string) || undefined,
    specialty: formData.get("specialty") as string,
    bio: (formData.get("bio") as string) || undefined,
    consultationFee: formData.get("consultationFee")
      ? Number(formData.get("consultationFee"))
      : undefined,
  };

  const result = withAccount
    ? await DoctorService.createDoctorAccount({
        ...base,
        email: formData.get("email") as string,
        password: formData.get("password") as string,
      })
    : await DoctorService.createDoctor(base);

  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true };
}

export async function linkDoctorAccountAction(formData: FormData) {
  await requireAdmin();

  const result = await DoctorService.linkDoctorAccount(
    formData.get("doctorId") as string,
    {
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    },
  );

  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
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
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true };
}

export async function setDoctorActiveAction(doctorId: string, isActive: boolean) {
  await requireAdmin();
  const result = await DoctorService.setDoctorActive(doctorId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true };
}

export async function deleteDoctorAction(doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.deleteDoctor(doctorId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  revalidatePath("/clinic/[slug]/admin/users", "page");
  return { success: true };
}

// ─── User actions ─────────────────────────────────────────────────────────────

export async function updateUserRoleAction(userId: string, role: Role) {
  const clinicId = await requireAdmin();
  const result = await UserService.updateUserRole(userId, clinicId, role);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/users", "page");
  return { success: true };
}

export async function deleteUserAction(userId: string) {
  await requireAdmin();
  const result = await UserService.deleteUser(userId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/users", "page");
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
  revalidatePath("/clinic/[slug]/admin/appointments", "page");
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
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true };
}

export async function deleteRuleAction(ruleId: string, doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.deleteRule(ruleId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
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
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true };
}

export async function generateSlotsAction(ruleId: string, doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.generateSlotsForRule(ruleId, 30);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true, count: result.data.count };
}

// ─── Slot actions ─────────────────────────────────────────────────────────────

export async function toggleSlotBlockedAction(slotId: string, doctorId: string) {
  await requireAdmin();
  const result = await DoctorService.toggleSlotBlocked(slotId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true };
}
