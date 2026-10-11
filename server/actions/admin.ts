"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, AvailabilityMode, DoctorTitle, Role } from "@prisma/client";
import { parseMode } from "@/lib/availability/modes";

import { can, getClinicContext, getPermittedContext } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";
import * as DoctorService from "@/server/services/doctors";
import * as UserService from "@/server/services/users";
import * as AppointmentService from "@/server/services/appointments";
import * as BranchService from "@/server/services/branches";
import * as ClinicInfoService from "@/server/services/clinicInfo";
import * as SpecialtyService from "@/server/services/specialties";
import * as QueueService from "@/server/services/queue";
import * as KnowledgeService from "@/server/services/knowledge";
import { expectedOrderTime } from "@/lib/availability/queue-time";
import { getOrCreatePatientByPhone } from "@/server/services/patients";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import { pageRequest, offsetRequest } from "@/lib/pagination";
import type { BranchScope } from "@/lib/branch-scope";
import * as Scope from "@/server/services/branchScope";

// ─── Guard ────────────────────────────────────────────────────────────────────

// Returns the admin's clinic id (throws if the caller is not a clinic ADMIN).
// Only for what staff can never be granted — see lib/permissions.ts.
async function requireAdmin(): Promise<string> {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.ADMIN) throw new Error("غير مصرح");
  return ctx.clinic.id;
}

// Returns the caller's clinic id (throws unless they hold one of `permissions`
// there). A clinic ADMIN holds every permission.
async function requirePerm(...permissions: Permission[]): Promise<string> {
  const ctx = await getPermittedContext(permissions);
  if (!ctx) throw new Error("غير مصرح");
  return ctx.clinic.id;
}

// Same, plus the caller's branch scope (null = every branch). For anything that
// touches branch-carrying data — appointments, queues, doctors, schedules — so
// a staff member limited to some branches can't reach another branch's rows.
async function requireScoped(
  ...permissions: Permission[]
): Promise<{ clinicId: string; scope: BranchScope }> {
  const ctx = await getPermittedContext(permissions);
  if (!ctx) throw new Error("غير مصرح");
  return { clinicId: ctx.clinic.id, scope: ctx.branchIds };
}

const DOCTOR_NOT_FOUND = "الطبيب غير موجود";

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
  const { clinicId, scope } = await requireScoped("doctors");

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
  // A branch-limited member can only place the doctor in their own branches —
  // and must pick one, or they'd create a doctor they can't see afterwards.
  base.branchIds = await Scope.mergeDoctorBranches(null, base.branchIds, scope);
  if (scope !== null && base.branchIds.length === 0)
    return { error: "اختر فرعاً واحداً على الأقل من الفروع المسندة إليك" };

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

  revalidatePath("/admin/doctors", "page");
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
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.doctorInScope(formData.get("doctorId") as string, clinicId, scope)))
    return { error: DOCTOR_NOT_FOUND };

  const result = await DoctorService.linkDoctorAccount(formData.get("doctorId") as string, {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors", "page");
  return { success: true };
}

export async function updateDoctorAction(formData: FormData) {
  const { clinicId, scope } = await requireScoped("doctors");
  const targetDoctorId = formData.get("doctorId") as string;
  if (!(await Scope.doctorInScope(targetDoctorId, clinicId, scope)))
    return { error: DOCTOR_NOT_FOUND };

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
    // Keeps the doctor's branches outside the member's scope untouched.
    branchIds: await Scope.mergeDoctorBranches(targetDoctorId, attrs.branchIds, scope),
    clinicId: clinicId,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors", "page");
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

export async function setDoctorActiveAction(doctorId: string, isActive: boolean) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.doctorInScope(doctorId, clinicId, scope))) return { error: DOCTOR_NOT_FOUND };
  // Deactivating hides the doctor in EVERY branch — not a branch-limited call.
  if (!(await Scope.doctorOnlyInScope(doctorId, scope)))
    return { error: "هذا الطبيب يعمل في فروع أخرى — يستطيع مدير العيادة فقط إيقافه" };
  const result = await DoctorService.setDoctorActive(doctorId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors", "page");
  return { success: true };
}

export async function deleteDoctorAction(doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.doctorInScope(doctorId, clinicId, scope))) return { error: DOCTOR_NOT_FOUND };
  if (!(await Scope.doctorOnlyInScope(doctorId, scope)))
    return { error: "هذا الطبيب يعمل في فروع أخرى — يستطيع مدير العيادة فقط حذفه" };
  const result = await DoctorService.deleteDoctor(doctorId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors", "page");
  revalidatePath("/admin/patients", "page");
  return { success: true };
}

// ─── Patient actions ─────────────────────────────────────────────────────────────

export async function updatePatientProfileAction(userId: string, formData: FormData) {
  const clinicId = await requirePerm("patients");
  const result = await UserService.updatePatientProfile(userId, clinicId, {
    fullName: (formData.get("fullName") as string) ?? undefined,
    phone: formData.has("phone") ? (formData.get("phone") as string) : undefined,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/patients/[id]", "page");
  revalidatePath("/admin/patients", "page");
  return { success: true as const };
}

export async function changePatientEmailAction(userId: string, formData: FormData) {
  const clinicId = await requirePerm("patients");
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
  const { clinicId, scope } = await requireScoped("appointments");
  if (!(await Scope.appointmentInScope(appointmentId, clinicId, scope)))
    return { error: "الموعد غير موجود" };
  const result = await AppointmentService.updateAppointmentStatus(
    appointmentId,
    status,
    cancellationReason
  );
  if (!result.ok) return { error: result.error };
  // No revalidatePath: the board already moved the card optimistically, and a
  // re-render would reset its scrolled-in pages back to the first ones.
  return { success: true };
}

// ─── Paged lists (infinite scroll) ─────────────────────────────────────────────

/** A page of the clinic's appointments — the board columns and the doctor tab. */
export async function appointmentsPageAction(
  filters: AppointmentService.AppointmentFilters,
  page: number
) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  // `filters` comes from the client: the scope is always overwritten here.
  return AppointmentService.listAppointments(
    clinicId,
    { ...filters, branchScope: scope },
    pageRequest(page)
  );
}

/** A page of the clinic's doctors matching the filters (DB-side), by name. */
export async function doctorsPageAction(filters: DoctorService.DoctorFilters, page: number) {
  const { clinicId, scope } = await requireScoped("doctors");
  return DoctorService.listDoctorsPage(
    clinicId,
    { ...filters, branchScope: scope },
    pageRequest(page),
    { withEmail: true }
  );
}

/** A page of the clinic's knowledge docs matching the filters (DB-side). */
export async function knowledgePageAction(
  filters: { query?: string; status?: string },
  page: number
) {
  const clinicId = await requirePerm("agent");
  return KnowledgeService.listKnowledgeDocsPage(clinicId, filters, pageRequest(page));
}

/** A board column's next cards: the rows after the first `offset` it already shows. */
export async function appointmentsAfterAction(
  filters: AppointmentService.AppointmentFilters,
  offset: number
) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  return AppointmentService.listAppointments(
    clinicId,
    { ...filters, branchScope: scope },
    offsetRequest(offset)
  );
}

/** A page of the clinic's members, searched by name/phone and/or one role. */
export async function usersPageAction(filters: { query?: string; role?: string }, page: number) {
  const clinicId = await requireAdmin();
  const role = filters.role && filters.role in Role ? (filters.role as Role) : undefined;
  return UserService.listUsers(clinicId, { query: filters.query, role }, pageRequest(page));
}

// Patient picker for the admin booking modal (name or phone, this clinic only).
export async function searchPatientsAction(query: string) {
  const clinicId = await requirePerm("appointments");
  if (!query.trim()) return [];
  const page = await UserService.listUsers(
    clinicId,
    { query, role: Role.PATIENT },
    pageRequest(1, 8)
  );
  return page.items;
}

/**
 * Book on a patient's behalf (phone call / walk-in). The patient is either an
 * existing member of this clinic or a new one created by phone, exactly like a
 * WhatsApp contact. Bookings made by the clinic itself skip the approval step
 * and land as CONFIRMED.
 */
export async function adminBookAppointmentAction(input: {
  patient: { id: string } | { fullName: string; phone: string };
  doctorId: string;
  /** Slot-based day: the slot to book. Order/arrival day: omit and pass `date`. */
  slotId?: string;
  date?: string;
  notes?: string;
}): Promise<{
  ok: boolean;
  error?: string;
  mode?: "order" | "arrival";
  orderNumber?: number | null;
}> {
  const { clinicId, scope } = await requireScoped("appointments");
  // Staff book only with doctors — and into slots / queues — of their branches.
  if (!(await Scope.doctorInScope(input.doctorId, clinicId, scope)))
    return { ok: false, error: DOCTOR_NOT_FOUND };
  if (input.slotId && !(await Scope.slotInScope(input.slotId, clinicId, scope)))
    return { ok: false, error: "الموعد غير موجود" };

  let patientId: string;
  if ("id" in input.patient) {
    if (!(await UserService.isClinicPatient(input.patient.id, clinicId)))
      return { ok: false, error: "المريض غير موجود في هذه العيادة" };
    patientId = input.patient.id;
  } else {
    const fullName = input.patient.fullName.trim();
    const phone = normalizePhone(input.patient.phone);
    if (!fullName) return { ok: false, error: "اسم المريض مطلوب" };
    if (!isValidPhone(phone)) return { ok: false, error: "رقم الهاتف غير صالح" };
    try {
      ({ profileId: patientId } = await getOrCreatePatientByPhone({
        clinicId,
        phone,
        name: fullName,
      }));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "تعذّر إنشاء حساب المريض" };
    }
  }

  let appointmentId: string;
  let mode: "order" | "arrival" | undefined;
  let orderNumber: number | null | undefined;
  if (input.slotId) {
    const res = await AppointmentService.createAppointment(patientId, input.slotId, input.notes, {
      clinicId,
    });
    if (!res.ok) return { ok: false, error: res.error };
    appointmentId = res.data.id;
  } else if (input.date) {
    const res = await QueueService.bookOrderAppointment(
      patientId,
      input.doctorId,
      new Date(input.date),
      { notes: input.notes, clinicId, branchScope: scope }
    );
    if (!res.ok) return { ok: false, error: res.error };
    appointmentId = res.data.id;
    mode = res.data.mode === "ARRIVAL_BASED" ? "arrival" : "order";
    orderNumber = res.data.orderNumber;
  } else {
    return { ok: false, error: "يرجى اختيار موعد" };
  }

  await AppointmentService.updateAppointmentStatus(appointmentId, AppointmentStatus.CONFIRMED);

  revalidatePath("/admin/appointments", "page");
  return { ok: true, mode, orderNumber };
}

// ─── Availability Rule actions ────────────────────────────────────────────────

// Loads a doctor's availability rules for the inline editor in the edit modal.
// Scoped to the admin's clinic so a doctorId from another clinic can't be read.
export async function getDoctorRulesAction(doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.doctorInScope(doctorId, clinicId, scope))) return { error: DOCTOR_NOT_FOUND };
  const rules = await DoctorService.listDoctorRules(doctorId, clinicId, scope);
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

// `_clientClinicId` is kept for the callers' signature but never trusted: the
// clinic always comes from the request host.
export async function createRuleAction(formData: FormData, _clientClinicId?: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  const doctorId = formData.get("doctorId") as string;
  const branchId = (formData.get("branchId") as string) || "";

  if (!branchId) return { error: "اختر الفرع لهذه القاعدة." };
  if (!(await Scope.doctorInScope(doctorId, clinicId, scope))) return { error: DOCTOR_NOT_FOUND };
  if (!(await Scope.branchInScope(branchId, clinicId, scope))) return { error: "الفرع غير موجود" };
  const result = await DoctorService.createRule({
    doctorId,
    branchId,
    dayOfWeek: formData.get("dayOfWeek") as import("@prisma/client").DayOfWeek,
    startTime: formData.get("startTime") as string,
    endTime: formData.get("endTime") as string,
    slotDurationMin: formData.get("slotDurationMin") ? Number(formData.get("slotDurationMin")) : 30,
    clinicId: clinicId,
    mode: parseMode(formData.get("mode")),
    estimatedDurationMin: formData.get("estimatedDurationMin")
      ? Number(formData.get("estimatedDurationMin"))
      : null,
    dailyCap: formData.get("dailyCap") ? Number(formData.get("dailyCap")) : null,
    referralOnly: formData.get("referralOnly") === "on",
    note: (formData.get("note") as string) || null,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

export async function deleteRuleAction(ruleId: string, doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.ruleInScope(ruleId, clinicId, scope))) return { error: "القاعدة غير موجودة" };
  const result = await DoctorService.deleteRule(ruleId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

export async function toggleRuleActiveAction(ruleId: string, isActive: boolean, doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.ruleInScope(ruleId, clinicId, scope))) return { error: "القاعدة غير موجودة" };
  const result = await DoctorService.toggleRuleActive(ruleId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

export async function generateSlotsAction(ruleId: string, doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.ruleInScope(ruleId, clinicId, scope))) return { error: "القاعدة غير موجودة" };
  const result = await DoctorService.generateSlotsForRule(ruleId, 30);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true, count: result.data.count };
}

// Day index for the "available" tab — slot-based + queue days with cheap header
// tallies. Per-day content is loaded lazily via the actions below.
export async function getDoctorScheduleDaysAction(doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.doctorInScope(doctorId, clinicId, scope))) return [];
  return DoctorService.getDoctorScheduleDays(doctorId, 30, scope);
}

// Loads one slot-based day's slots (with booking + block state) on demand.
export async function getDoctorDaySlotsAction(doctorId: string, date: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(`${date}T23:59:59.999Z`);
  const slots = await DoctorService.listDoctorSlots(doctorId, {
    from,
    to,
    clinicId,
    branchScope: scope,
  });
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
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  const queue = await QueueService.getDayQueue(doctorId, new Date(date), null, scope);
  if (!queue || queue.clinicId !== clinicId) return { queue: null };
  const sessionStart = queue.rule?.startTime ?? null;
  return {
    queue: {
      id: queue.id,
      date,
      // Scheduling mode of the queue's rule (ORDER_BASED vs ARRIVAL_BASED); drives
      // the arrival-priority controls (check-in) in the queue panel.
      mode: queue.rule?.mode ?? AvailabilityMode.ORDER_BASED,
      branchName: queue.branch?.name ?? null,
      currentOrder: queue.currentOrder,
      nextOrder: queue.nextOrder,
      nextArrival: queue.nextArrival,
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
        arrived: a.arrivedAt != null,
        expectedTime:
          sessionStart != null && a.orderNumber != null
            ? expectedOrderTime(sessionStart, a.orderNumber, queue.estimatedDurationMin)
            : null,
      })),
    },
  };
}

// Arrival-priority: check a reserved patient in at the clinic, handing out their
// arrival/serving order number. Scoped to the admin's clinic.
export async function markArrivedAction(appointmentId: string) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.appointmentInScope(appointmentId, clinicId, scope)))
    return { error: "الحجز غير موجود" };
  const res = await QueueService.markArrived(appointmentId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true, orderNumber: res.data.orderNumber };
}

export async function advanceQueueAction(queueId: string, to: number | null) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.queueInScope(queueId, clinicId, scope))) return { error: "الطابور غير موجود" };
  const res = await QueueService.setCurrentOrder(queueId, to);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true, currentOrder: res.data.currentOrder };
}

// "Next patient": complete the current patient and advance the queue.
export async function completeCurrentAndAdvanceAction(queueId: string) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.queueInScope(queueId, clinicId, scope))) return { error: "الطابور غير موجود" };
  const res = await QueueService.completeCurrentAndAdvance(queueId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true, currentOrder: res.data.currentOrder };
}

export async function toggleQueueTrackingAction(queueId: string, track: boolean) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.queueInScope(queueId, clinicId, scope))) return { error: "الطابور غير موجود" };
  const res = await QueueService.toggleQueueTracking(queueId, track);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

export async function setQueueCapAction(queueId: string, cap: number | null) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.queueInScope(queueId, clinicId, scope))) return { error: "الطابور غير موجود" };
  const res = await QueueService.setQueueCap(queueId, cap);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

// Temporarily skip an order (patient not present); keeps it PENDING.
export async function skipOrderAction(appointmentId: string) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.appointmentInScope(appointmentId, clinicId, scope)))
    return { error: "الحجز غير موجود" };
  const res = await QueueService.skipOrder(appointmentId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

// Recall a skipped patient who arrived — serve them next.
export async function recallOrderAction(appointmentId: string) {
  const { clinicId, scope } = await requireScoped("appointments", "doctors");
  if (!(await Scope.appointmentInScope(appointmentId, clinicId, scope)))
    return { error: "الحجز غير موجود" };
  const res = await QueueService.recallOrder(appointmentId);
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true, orderNumber: res.data.orderNumber };
}

// ─── Slot actions ─────────────────────────────────────────────────────────────

export async function toggleSlotBlockedAction(slotId: string, doctorId: string) {
  const { clinicId, scope } = await requireScoped("doctors");
  if (!(await Scope.slotInScope(slotId, clinicId, scope))) return { error: "الموعد غير موجود" };
  const result = await DoctorService.toggleSlotBlocked(slotId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/doctors/[id]", "page");
  return { success: true };
}

// ─── Branch actions ───────────────────────────────────────────────────────────

export async function createBranchAction(input: Omit<BranchService.CreateBranchInput, "clinicId">) {
  const clinicId = await requirePerm("clinic");
  const result = await BranchService.createBranch({ ...input, clinicId });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/branches", "page");
  return { success: true, branchId: result.data.id };
}

// Editing a branch's own details: "clinic" (any branch) or "branches" (only the
// member's own). Creating, deleting, activating and choosing the main branch
// change the clinic's structure and stay under "clinic".
export async function updateBranchAction(input: BranchService.UpdateBranchInput) {
  const ctx = await getPermittedContext(["clinic", "branches"]);
  if (!ctx) throw new Error("غير مصرح");
  const clinicId = ctx.clinic.id;
  // "clinic" covers every branch; "branches" alone is held to the member's scope.
  const scope = can(ctx, "clinic") ? null : ctx.branchIds;
  if (!(await Scope.branchInScope(input.branchId, clinicId, scope)))
    return { error: "الفرع غير موجود" };
  // The clinic id never comes from the client, and which branch is the main
  // one is structural — not something "branches" alone may change.
  input = { ...input, clinicId, ...(can(ctx, "clinic") ? {} : { isMain: undefined }) };
  const result = await BranchService.updateBranch(input);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/branches", "page");
  return { success: true };
}

export async function setBranchActiveAction(branchId: string, isActive: boolean) {
  const clinicId = await requirePerm("clinic");
  const branch = await BranchService.getBranch(branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.setBranchActive(branchId, isActive);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/branches", "page");
  return { success: true };
}

export async function setMainBranchAction(branchId: string) {
  const clinicId = await requirePerm("clinic");
  const branch = await BranchService.getBranch(branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.setMainBranch(clinicId, branchId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/branches", "page");
  return { success: true };
}

export async function deleteBranchAction(branchId: string) {
  const clinicId = await requirePerm("clinic");
  const branch = await BranchService.getBranch(branchId, clinicId);
  if (!branch) return { error: "الفرع غير موجود" };
  const result = await BranchService.deleteBranch(branchId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/branches", "page");
  return { success: true };
}

// ─── Clinic info actions ──────────────────────────────────────────────────────

export async function updateClinicInfoAction(
  input: Omit<ClinicInfoService.UpdateClinicInfoInput, "clinicId">
) {
  const clinicId = await requirePerm("clinic");
  const result = await ClinicInfoService.updateClinicInfo({ ...input, clinicId });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/settings", "page");
  return { success: true };
}

// ─── Specialty actions ────────────────────────────────────────────────────────

export async function createSpecialtyAction(name: string) {
  const clinicId = await requirePerm("clinic");
  const result = await SpecialtyService.createSpecialty(clinicId, name);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/specialties", "page");
  revalidatePath("/admin/doctors", "page");
  return { success: true, id: result.data.id };
}

export async function renameSpecialtyAction(specialtyId: string, name: string) {
  const clinicId = await requirePerm("clinic");
  const result = await SpecialtyService.renameSpecialty(clinicId, specialtyId, name);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/specialties", "page");
  revalidatePath("/admin/doctors", "page");
  return { success: true };
}

export async function deleteSpecialtyAction(specialtyId: string) {
  const clinicId = await requirePerm("clinic");
  // Ownership check.
  const specialties = await SpecialtyService.listSpecialties(clinicId);
  if (!specialties.some((s) => s.id === specialtyId)) {
    return { error: "التخصص غير موجود" };
  }
  const result = await SpecialtyService.deleteSpecialty(specialtyId);
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/specialties", "page");
  revalidatePath("/admin/doctors", "page");
  return { success: true };
}

// ─── Knowledge-doc actions ──────────────────────────────────────────────────────
// Moved to server/actions/platformKnowledge.ts. Authoring a knowledge doc means
// writing its `slug` and `summary`, which are retrieval tuning rather than
// content, so it became platform-admin work; /admin/knowledge is now read-only.
