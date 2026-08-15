"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, Role } from "@prisma/client";

import { getActiveClinicContext } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as UserService from "@/server/services/users";
import * as AppointmentService from "@/server/services/appointments";
import * as BranchService from "@/server/services/branches";
import * as ClinicInfoService from "@/server/services/clinicInfo";
import * as SpecialtyService from "@/server/services/specialties";

// ─── Guard ────────────────────────────────────────────────────────────────────

// Returns the admin's clinic id (throws if the caller is not a clinic ADMIN).
async function requireAdmin(): Promise<string> {
  const ctx = await getActiveClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) throw new Error("غير مصرح");
  return ctx.clinic.id;
}

// ─── Doctor actions ───────────────────────────────────────────────────────────

// Parse the extra doctor attributes shared by create & update forms.
function parseDoctorAttributes(formData: FormData) {
  const num = (key: string) =>
    formData.get(key) ? Number(formData.get(key)) : undefined;
  return {
    yearsOfExperience: num("yearsOfExperience"),
    examinationFee: num("examinationFee"),
    consultationFee: num("consultationFee"),
    requiresAdvanceBooking: formData.get("requiresAdvanceBooking") === "on",
    acceptsChildren: formData.get("acceptsChildren") === "on",
    branchIds: formData.getAll("branchIds").map(String).filter(Boolean),
  };
}

export async function createDoctorAction(formData: FormData) {
  const clinicId = await requireAdmin();

  const specialtyRes = await SpecialtyService.resolveSpecialtyId(clinicId, {
    specialtyId: (formData.get("specialtyId") as string) || null,
    newSpecialtyName: (formData.get("newSpecialtyName") as string) || null,
  });
  if (!specialtyRes.ok) return { error: specialtyRes.error };

  const withAccount = !!(formData.get("email") as string)?.trim();
  const base = {
    clinicId,
    fullName: formData.get("fullName") as string,
    phone: (formData.get("phone") as string) || undefined,
    specialtyId: specialtyRes.data,
    bio: (formData.get("bio") as string) || undefined,
    ...parseDoctorAttributes(formData),
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
  const clinicId = await requireAdmin();

  const specialtyRes = await SpecialtyService.resolveSpecialtyId(clinicId, {
    specialtyId: (formData.get("specialtyId") as string) || null,
    newSpecialtyName: (formData.get("newSpecialtyName") as string) || null,
  });
  if (!specialtyRes.ok) return { error: specialtyRes.error };

  const attrs = parseDoctorAttributes(formData);
  const result = await DoctorService.updateDoctor({
    doctorId: formData.get("doctorId") as string,
    fullName: (formData.get("fullName") as string) || undefined,
    phone: (formData.get("phone") as string) || null,
    specialtyId: specialtyRes.data,
    bio: (formData.get("bio") as string) || undefined,
    yearsOfExperience: attrs.yearsOfExperience ?? null,
    examinationFee: attrs.examinationFee ?? null,
    consultationFee: attrs.consultationFee ?? null,
    requiresAdvanceBooking: attrs.requiresAdvanceBooking,
    acceptsChildren: attrs.acceptsChildren,
    branchIds: attrs.branchIds,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
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
  const branchId = (formData.get("branchId") as string) || "";
  if (!branchId) return { error: "اختر الفرع لهذه القاعدة." };
  const result = await DoctorService.createRule({
    doctorId,
    branchId,
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

// ─── Branch actions ───────────────────────────────────────────────────────────

export async function createBranchAction(
  input: Omit<BranchService.CreateBranchInput, "clinicId">,
) {
  const clinicId = await requireAdmin();
  const result = await BranchService.createBranch({ ...input, clinicId });
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/branches", "page");
  return { success: true, branchId: result.data.id };
}

export async function updateBranchAction(input: BranchService.UpdateBranchInput) {
  const clinicId = await requireAdmin();
  // Ownership check: the branch must belong to the admin's clinic.
  const branch = await BranchService.getBranch(input.branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.updateBranch(input);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/branches", "page");
  return { success: true };
}

export async function setBranchActiveAction(branchId: string, isActive: boolean) {
  const clinicId = await requireAdmin();
  const branch = await BranchService.getBranch(branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.setBranchActive(branchId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/branches", "page");
  return { success: true };
}

export async function setMainBranchAction(branchId: string) {
  const clinicId = await requireAdmin();
  const branch = await BranchService.getBranch(branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.setMainBranch(clinicId, branchId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/branches", "page");
  return { success: true };
}

export async function deleteBranchAction(branchId: string) {
  const clinicId = await requireAdmin();
  const branch = await BranchService.getBranch(branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.deleteBranch(branchId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/branches", "page");
  return { success: true };
}

// ─── Clinic info actions ──────────────────────────────────────────────────────

export async function updateClinicInfoAction(
  input: Omit<ClinicInfoService.UpdateClinicInfoInput, "clinicId">,
) {
  const clinicId = await requireAdmin();
  const result = await ClinicInfoService.updateClinicInfo({ ...input, clinicId });
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/settings", "page");
  return { success: true };
}

// ─── Specialty actions ────────────────────────────────────────────────────────

export async function createSpecialtyAction(name: string) {
  const clinicId = await requireAdmin();
  const result = await SpecialtyService.createSpecialty(clinicId, name);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/specialties", "page");
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true, id: result.data.id };
}

export async function renameSpecialtyAction(specialtyId: string, name: string) {
  const clinicId = await requireAdmin();
  const result = await SpecialtyService.renameSpecialty(clinicId, specialtyId, name);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/specialties", "page");
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true };
}

export async function deleteSpecialtyAction(specialtyId: string) {
  const clinicId = await requireAdmin();
  // Ownership check.
  const specialties = await SpecialtyService.listSpecialties(clinicId);
  if (!specialties.some((s) => s.id === specialtyId)) {
    return { error: "التخصص غير موجود" };
  }
  const result = await SpecialtyService.deleteSpecialty(specialtyId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/specialties", "page");
  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true };
}
