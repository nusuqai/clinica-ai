"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, AvailabilityMode, DoctorTitle, Role } from "@prisma/client";

import { getActiveClinicContext } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as UserService from "@/server/services/users";
import * as AppointmentService from "@/server/services/appointments";
import * as BranchService from "@/server/services/branches";
import * as ClinicInfoService from "@/server/services/clinicInfo";
import * as SpecialtyService from "@/server/services/specialties";
import * as QueueService from "@/server/services/queue";
import { expectedOrderTime } from "@/lib/availability/queue-time";

// ─── Guard ────────────────────────────────────────────────────────────────────

// Returns the admin's clinic id (throws if the caller is not a clinic ADMIN).
async function requireAdmin(): Promise<string> {
  const ctx = await getActiveClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) throw new Error("غير مصرح");
  return ctx.clinic.id;
}

// ─── Doctor actions ───────────────────────────────────────────────────────────

// Normalize the doctor-title select into a DoctorTitle enum value or null.
function parseDoctorTitle(formData: FormData): DoctorTitle | null {
  const v = (formData.get("title") as string) || "";
  return v === DoctorTitle.SPECIALIST || v === DoctorTitle.CONSULTANT ? v : null;
}

// Parse the extra doctor attributes shared by create & update forms.
function parseDoctorAttributes(formData: FormData) {
  const num = (key: string) => (formData.get(key) ? Number(formData.get(key)) : undefined);
  return {
    title: parseDoctorTitle(formData),
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
    qualifications: (formData.get("qualifications") as string) || undefined,
    expertiseAreas: (formData.get("expertiseAreas") as string) || undefined,
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

  // Availability rules drafted in the modal are created now that the doctor
  // (and its branch assignments) exist. Kept atomic: if any rule is invalid,
  // roll the whole doctor back so a re-submit doesn't create a duplicate.
  const ruleError = await createDraftRules(result.data.id, formData, clinicId);
  if (ruleError) {
    await DoctorService.deleteDoctor(result.data.id);
    return { error: ruleError };
  }

  revalidatePath("/clinic/[slug]/admin/doctors", "page");
  return { success: true };
}

// Shape drafted by the availability editor and serialized into `rules`.
interface DraftRule {
  branchId: string;
  dayOfWeek: import("@prisma/client").DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMin?: number;
  mode?: import("@prisma/client").AvailabilityMode;
  estimatedDurationMin?: number | null;
  dailyCap?: number | null;
  referralOnly?: boolean;
  note?: string | null;
}

// Parses the `rules` JSON from the add form and creates each rule for the new
// doctor. Returns an Arabic error message on the first failure, or null.
async function createDraftRules(
  doctorId: string,
  formData: FormData,
  clinicId: string
): Promise<string | null> {
  const raw = (formData.get("rules") as string) || "";
  if (!raw) return null;
  let rules: DraftRule[];
  try {
    rules = JSON.parse(raw) as DraftRule[];
  } catch {
    return null; // malformed payload — treat as "no rules" rather than fail
  }
  if (!Array.isArray(rules)) return null;

  for (const r of rules) {
    const res = await DoctorService.createRule({
      doctorId,
      branchId: r.branchId,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      slotDurationMin: r.slotDurationMin ? Number(r.slotDurationMin) : 30,
      clinicId: clinicId,
      mode: r.mode ?? undefined,
      estimatedDurationMin: r.estimatedDurationMin ?? null,
      dailyCap: r.dailyCap ?? null,
      referralOnly: !!r.referralOnly,
      note: r.note ?? null,
    });
    if (!res.ok) return `تعذّر إنشاء قاعدة التوفر: ${res.error}`;
  }
  return null;
}

export async function linkDoctorAccountAction(formData: FormData) {
  await requireAdmin();

  const result = await DoctorService.linkDoctorAccount(formData.get("doctorId") as string, {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

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
    // `phone` is intentionally not read here: the field was removed from the
    // form, so leaving it out preserves any existing value instead of wiping it.
    title: attrs.title,
    qualifications: (formData.get("qualifications") as string) || null,
    expertiseAreas: (formData.get("expertiseAreas") as string) || null,
    specialtyId: specialtyRes.data,
    bio: (formData.get("bio") as string) || undefined,
    yearsOfExperience: attrs.yearsOfExperience ?? null,
    examinationFee: attrs.examinationFee ?? null,
    consultationFee: attrs.consultationFee ?? null,
    requiresAdvanceBooking: attrs.requiresAdvanceBooking,
    acceptsChildren: attrs.acceptsChildren,
    branchIds: attrs.branchIds,
    clinicId: clinicId,
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

export async function updatePatientProfileAction(userId: string, formData: FormData) {
  const clinicId = await requireAdmin();
  const result = await UserService.updatePatientProfile(userId, clinicId, {
    fullName: (formData.get("fullName") as string) ?? undefined,
    phone: formData.has("phone") ? (formData.get("phone") as string) : undefined,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/clinic/[slug]/admin/users/[id]", "page");
  revalidatePath("/clinic/[slug]/admin/users", "page");
  return { success: true as const };
}

export async function changePatientEmailAction(userId: string, formData: FormData) {
  const clinicId = await requireAdmin();
  const result = await UserService.changePatientEmail(
    userId,
    clinicId,
    (formData.get("email") as string) ?? ""
  );
  if (!result.ok) return { error: result.error };
  return { success: true as const };
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

// Loads a doctor's availability rules for the inline editor in the edit modal.
// Scoped to the admin's clinic so a doctorId from another clinic can't be read.
export async function getDoctorRulesAction(doctorId: string) {
  const clinicId = await requireAdmin();
  const doctor = await DoctorService.getDoctor(doctorId, clinicId);
  if (!doctor) return { error: "الطبيب غير موجود" };
  const rules = await DoctorService.listDoctorRules(doctorId);
  return {
    rules: rules.map((r) => ({
      id: r.id,
      branchId: r.branchId ?? "",
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      slotDurationMin: r.slotDurationMin,
      mode: r.mode,
      estimatedDurationMin: r.estimatedDurationMin,
      dailyCap: r.dailyCap,
      referralOnly: r.referralOnly,
      note: r.note,
    })),
  };
}

export async function createRuleAction(formData: FormData, clinicId: string) {
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
    slotDurationMin: formData.get("slotDurationMin") ? Number(formData.get("slotDurationMin")) : 30,
    clinicId: clinicId,
    mode:
      formData.get("mode") === "ORDER_BASED"
        ? AvailabilityMode.ORDER_BASED
        : AvailabilityMode.SLOT_BASED,
    estimatedDurationMin: formData.get("estimatedDurationMin")
      ? Number(formData.get("estimatedDurationMin"))
      : null,
    dailyCap: formData.get("dailyCap") ? Number(formData.get("dailyCap")) : null,
    referralOnly: formData.get("referralOnly") === "on",
    note: (formData.get("note") as string) || null,
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

export async function toggleRuleActiveAction(ruleId: string, isActive: boolean, doctorId: string) {
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

// Day index for the "available" tab — slot-based + queue days with cheap header
// tallies. Per-day content is loaded lazily via the actions below.
export async function getDoctorScheduleDaysAction(doctorId: string) {
  await requireAdmin();
  return DoctorService.getDoctorScheduleDays(doctorId);
}

// Loads one slot-based day's slots (with booking + block state) on demand.
export async function getDoctorDaySlotsAction(doctorId: string, date: string) {
  await requireAdmin();
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(`${date}T23:59:59.999Z`);
  const slots = await DoctorService.listDoctorSlots(doctorId, { from, to });
  return slots.map((s) => ({
    id: s.id,
    startTime: s.startTime.toISOString(),
    endTime: s.endTime.toISOString(),
    isBlocked: s.isBlocked,
    appointment: s.appointment
      ? {
          status: s.appointment.status,
          patientName: s.appointment.patient.fullName,
        }
      : null,
  }));
}

// ─── Order-based queue actions ────────────────────────────────────────────────

// Returns the day queue for (doctor, date) scoped to the admin's clinic.
export async function getDayQueueAction(doctorId: string, date: string) {
  const clinicId = await requireAdmin();
  const queue = await QueueService.getDayQueue(doctorId, new Date(date));
  if (!queue || queue.clinicId !== clinicId) return { queue: null };
  const sessionStart = queue.rule?.startTime ?? null;
  return {
    queue: {
      id: queue.id,
      date,
      branchName: queue.branch?.name ?? null,
      currentOrder: queue.currentOrder,
      nextOrder: queue.nextOrder,
      serveNextOrder: queue.serveNextOrder,
      dailyCap: queue.dailyCap,
      trackCurrentOrder: queue.trackCurrentOrder,
      patients: queue.appointments.map((a) => ({
        id: a.id,
        orderNumber: a.orderNumber,
        patientName: a.patient.fullName,
        phone: a.patient.phone,
        status: a.status,
        notes: a.patientNotes,
        skipped: a.skippedAt != null,
        expectedTime:
          sessionStart != null && a.orderNumber != null
            ? expectedOrderTime(sessionStart, a.orderNumber, queue.estimatedDurationMin)
            : null,
      })),
    },
  };
}

async function requireQueueInClinic(queueId: string, clinicId: string) {
  const { prisma } = await import("@/lib/prisma");
  const q = await prisma.doctorDayQueue.findUnique({
    where: { id: queueId },
    select: { clinicId: true },
  });
  return !!q && q.clinicId === clinicId;
}

export async function advanceQueueAction(queueId: string, to: number | null) {
  const clinicId = await requireAdmin();
  if (!(await requireQueueInClinic(queueId, clinicId))) return { error: "الطابور غير موجود" };
  const res = await QueueService.setCurrentOrder(queueId, to);
  if (!res.ok) return { error: res.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true, currentOrder: res.data.currentOrder };
}

// "Next patient": complete the current patient and advance the queue.
export async function completeCurrentAndAdvanceAction(queueId: string) {
  const clinicId = await requireAdmin();
  if (!(await requireQueueInClinic(queueId, clinicId))) return { error: "الطابور غير موجود" };
  const res = await QueueService.completeCurrentAndAdvance(queueId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true, currentOrder: res.data.currentOrder };
}

export async function toggleQueueTrackingAction(queueId: string, track: boolean) {
  const clinicId = await requireAdmin();
  if (!(await requireQueueInClinic(queueId, clinicId))) return { error: "الطابور غير موجود" };
  const res = await QueueService.toggleQueueTracking(queueId, track);
  if (!res.ok) return { error: res.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true };
}

export async function setQueueCapAction(queueId: string, cap: number | null) {
  const clinicId = await requireAdmin();
  if (!(await requireQueueInClinic(queueId, clinicId))) return { error: "الطابور غير موجود" };
  const res = await QueueService.setQueueCap(queueId, cap);
  if (!res.ok) return { error: res.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true };
}

async function requireAppointmentInClinic(appointmentId: string, clinicId: string) {
  const { prisma } = await import("@/lib/prisma");
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { clinicId: true },
  });
  return !!a && a.clinicId === clinicId;
}

// Temporarily skip an order (patient not present); keeps it PENDING.
export async function skipOrderAction(appointmentId: string) {
  const clinicId = await requireAdmin();
  if (!(await requireAppointmentInClinic(appointmentId, clinicId)))
    return { error: "الحجز غير موجود" };
  const res = await QueueService.skipOrder(appointmentId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true };
}

// Recall a skipped patient who arrived — serve them next.
export async function recallOrderAction(appointmentId: string) {
  const clinicId = await requireAdmin();
  if (!(await requireAppointmentInClinic(appointmentId, clinicId)))
    return { error: "الحجز غير موجود" };
  const res = await QueueService.recallOrder(appointmentId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/clinic/[slug]/admin/doctors/[id]", "page");
  return { success: true, orderNumber: res.data.orderNumber };
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

export async function createBranchAction(input: Omit<BranchService.CreateBranchInput, "clinicId">) {
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
  input: Omit<ClinicInfoService.UpdateClinicInfoInput, "clinicId">
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
