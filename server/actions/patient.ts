"use server";

import { notifyPatientCancelled } from "@/server/services/staff/notifications";
import { revalidatePath } from "next/cache";
import { AppointmentStatus, Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getClinicContext, getHostClinic } from "@/lib/auth";
import type { BranchScope } from "@/lib/branch-scope";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
import { expectedTimeAfter } from "@/lib/availability/queue-time";
import * as BookingService from "@/server/services/booking";
import { serviceNamesByDoctor } from "@/server/services/catalog";
import * as CatalogService from "@/server/services/catalog";
import * as PackageService from "@/server/services/packages";
import { practitionerName } from "@/lib/doctor-title";
import * as TreatmentService from "@/server/services/treatments";
import * as HealthProfileService from "@/server/services/health-profile";
import {
  HEALTH_PROFILE_REQUIRED_ERROR,
  type AnswersMap,
  type HealthQuestionView,
} from "@/lib/health-profile";
import { pageRequest, mapPage } from "@/lib/pagination";

// ─── Profile mutations ────────────────────────────────────────────────────────

export async function updateProfileAction(
  fullName: string,
  phone: string | null
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
    revalidatePath("/dashboard", "page");
    revalidatePath("/dashboard/profile", "page");
    revalidatePath("/profile", "page");
    revalidatePath("/", "page"); // the home page's nav avatar shows the name
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
  appointmentId: string
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
    AppointmentStatus.CANCELLED
  );
  if (!result.ok) return { ok: false, error: result.error };
  await notifyPatientCancelled(appointmentId);

  revalidatePath("/", "page"); // the clinic home shows the patient's bookings too
  revalidatePath("/dashboard", "page");
  revalidatePath("/dashboard/appointments", "page");
  return { ok: true };
}

// ─── My history (infinite scroll on the clinic home page) ────────────────────

async function requirePatient() {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.PATIENT) throw new Error("غير مصرح");
  return { patientId: ctx.user.id, clinicId: ctx.clinic.id };
}

/** Shared by both history panels: by doctor and visit day. */
export interface HistoryFilters {
  doctorId?: string;
  /** "YYYY-MM-DD": only visits on that day. */
  date?: string;
}

/** A page of my completed visits here (filtered in the DB), flagged if a record exists. */
export async function myPastVisitsPageAction(filters: HistoryFilters, page: number) {
  const { patientId, clinicId } = await requirePatient();
  const result = await AppointmentService.getPatientAppointmentsPage(
    patientId,
    clinicId,
    AppointmentStatus.COMPLETED,
    { doctorId: filters.doctorId, date: filters.date },
    pageRequest(page, 10)
  );
  const records = await TreatmentService.mapRecordsByAppointment(
    result.items.map((a) => a.id),
    clinicId
  );
  return mapPage(result, (a) => ({ ...a, hasRecord: records.has(a.id) }));
}

/** A page of my treatment record here (filtered in the DB), newest visit first. */
export async function myRecordsPageAction(
  filters: HistoryFilters & { query?: string },
  page: number
) {
  const { patientId, clinicId } = await requirePatient();
  return TreatmentService.listPatientRecordsPage(
    { clinicId, patientId },
    { query: filters.query, doctorId: filters.doctorId, date: filters.date },
    pageRequest(page, 10)
  );
}

/** Doctors I've seen here — the options of the history panels' doctor filter. */
export async function myHistoryDoctorsAction() {
  const { patientId, clinicId } = await requirePatient();
  return DoctorService.listPatientHistoryDoctors(clinicId, patientId);
}

// ─── Public queries (no auth required) ───────────────────────────────────────

/**
 * A page of this clinic's active doctors for the landing page, filtered in the
 * database by name and/or specialty. Scoped to the host's clinic, never to an
 * id from the client.
 */
export async function publicDoctorsPageAction(
  filters: { query?: string; specialtyId?: string },
  page: number
) {
  const clinic = await getHostClinic();
  if (!clinic) throw new Error("العيادة غير موجودة");
  const result = await DoctorService.listDoctorsPage(
    clinic.id,
    { query: filters.query, specialtyId: filters.specialtyId, status: "active" },
    pageRequest(page, 12)
  );
  // Only what the public cards show — what each practitioner provides instead
  // of a single "fee" (prices are per service, shown in the booking modal).
  const services = await serviceNamesByDoctor(result.items.map((d) => d.id));
  return mapPage(result, (d) => ({
    id: d.id,
    specialty: d.specialty,
    title: d.title,
    services: services.get(d.id) ?? [],
    profile: { fullName: d.profile.fullName, phone: d.profile.phone },
    _count: { appointments: d._count.appointments },
  }));
}

// These availability reads also power the admin "book for a patient" modal. A
// branch-limited staff member is then only offered days / slots / queues in
// their own branches (the booking action enforces the same). Patients, guests
// and all-branch members have no scope → null → everything.
async function callerBranchScope(): Promise<BranchScope> {
  return (await getClinicContext())?.branchIds ?? null;
}

/** Only well-formed ids reach the queries. */
const serviceIdList = (ids?: string[] | null) =>
  ids?.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20) ?? null;

export async function getAvailableDaysAction(
  doctorId: string,
  serviceIds?: string[] | null
): Promise<DoctorService.AvailableDay[]> {
  return DoctorService.getAvailableDaysForBooking(doctorId, 60, await callerBranchScope(), {
    serviceIds: serviceIdList(serviceIds),
  });
}

export async function getAvailableSlotsAction(
  doctorId: string,
  dateStr: string,
  serviceIds?: string[] | null
): Promise<{ id: string; startTime: string; endTime: string }[]> {
  const date = new Date(dateStr);
  const slots = await DoctorService.getAvailableSlotsForBooking(
    doctorId,
    date,
    await callerBranchScope(),
    { serviceIds: serviceIdList(serviceIds) }
  );
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
  serviceIds?: string[] | null
): Promise<{
  mode: "order" | "arrival";
  available: boolean;
  remaining: number | null;
  nextOrderNumber: number;
  currentOrder: number | null;
  estimatedDurationMin: number | null;
  expectedTime: string | null;
} | null> {
  const ids = serviceIdList(serviceIds);
  const [length, fit] = await Promise.all([
    BookingService.visitMinutes(doctorId, ids),
    BookingService.serviceFit(doctorId, ids),
  ]);
  const probe = await QueueService.getOrderBookingInfo(
    doctorId,
    new Date(dateStr),
    null,
    await callerBranchScope()
  );
  if (!probe) return null;
  const need = BookingService.lengthWith(length, probe.estimatedDurationMin ?? 15) ?? undefined;
  const info = need
    ? await QueueService.getOrderBookingInfo(
        doctorId,
        new Date(dateStr),
        null,
        await callerBranchScope(),
        {
          durationMin: need,
        }
      )
    : probe;
  if (!info) return null;
  if (fit && !fit(info.ruleId, info.branchId)) info.available = false;
  const arrival = info.mode === "ARRIVAL_BASED";
  const nextOrderNumber = info.booked + 1;
  return {
    mode: arrival ? "arrival" : "order",
    available: info.available,
    remaining: info.remaining,
    nextOrderNumber,
    // Arrival-priority: the "now serving" number and the projected order/time are
    // meaningless before check-in (the number is assigned on arrival), so hide them.
    currentOrder: !arrival && info.trackCurrentOrder ? info.currentOrder : null,
    estimatedDurationMin: info.estimatedDurationMin,
    // The next booking starts after every minute already booked into the day.
    expectedTime: arrival ? null : expectedTimeAfter(info.sessionStart, info.bookedMinutes),
  };
}

// ─── Patient health profile ───────────────────────────────────────────────────

/**
 * What the booking modal must ask before this patient's first booking here:
 * the required patient questions still unanswered (empty once they have any
 * appointment at this clinic — existing patients are never blocked). The full
 * patient-visible question list + current answers come along so follow-up
 * questions can appear as the patient answers their parent.
 */
export async function myHealthProfileStatusAction(): Promise<{
  required: boolean;
  questions: HealthQuestionView[];
  answers: AnswersMap;
  missingIds: string[];
}> {
  const empty = { required: false, questions: [], answers: {}, missingIds: [] };
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.PATIENT) return empty;
  const missing = await HealthProfileService.missingForBooking(ctx.clinic.id, ctx.user.id);
  if (missing.length === 0) return empty;
  const view = await HealthProfileService.getPatientHealthProfile(ctx.clinic.id, ctx.user.id, {
    audience: "PATIENT",
  });
  return {
    required: true,
    questions: view.sections.flatMap((s) => s.questions),
    answers: view.answers,
    missingIds: missing.map((q) => q.id),
  };
}

/** The signed-in patient saves answers (booking modal / profile page). */
export async function saveMyHealthAnswersAction(
  answers: Record<string, unknown>
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  const res = await HealthProfileService.saveAnswers({
    clinicId: ctx.clinic.id,
    patientId: ctx.user.id,
    answers,
    source: "PATIENT",
    actorId: ctx.user.id,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/profile");
  return { ok: true };
}

// ─── Patient mutations ────────────────────────────────────────────────────────

export async function bookOrderAppointmentAction(
  doctorId: string,
  dateStr: string,
  patientNotes?: string,
  items?: BookingService.BookingItemRequest[]
): Promise<{
  ok: boolean;
  error?: string;
  mode?: "order" | "arrival";
  orderNumber?: number | null;
}> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  // First booking at this clinic needs the required health-profile answers.
  if ((await HealthProfileService.missingForBooking(ctx.clinic.id, ctx.user.id)).length > 0)
    return { ok: false, error: HEALTH_PROFILE_REQUIRED_ERROR };

  const result = await BookingService.bookQueueAppointment({
    patientId: ctx.user.id,
    doctorId,
    date: new Date(dateStr),
    notes: patientNotes,
    clinicId: ctx.clinic.id,
    items: sanitizeItems(items),
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard", "page");
  revalidatePath("/dashboard/appointments", "page");
  // Arrival-priority bookings have no order number yet (assigned at check-in).
  return {
    ok: true,
    mode: result.data.mode === "ARRIVAL_BASED" ? "arrival" : "order",
    orderNumber: result.data.orderNumber,
  };
}

/** Client-sent lines, reduced to their known fields. */
function sanitizeItems(items?: BookingService.BookingItemRequest[] | null) {
  if (!Array.isArray(items)) return undefined;
  return items.slice(0, 20).map((i) => ({
    serviceId: String(i.serviceId),
    quantity: typeof i.quantity === "number" ? i.quantity : null,
    patientPackageId: i.patientPackageId ? String(i.patientPackageId) : null,
  }));
}

export async function bookAppointmentAction(
  slotId: string,
  patientNotes?: string,
  items?: BookingService.BookingItemRequest[]
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) {
    return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  }
  // First booking at this clinic needs the required health-profile answers.
  if ((await HealthProfileService.missingForBooking(ctx.clinic.id, ctx.user.id)).length > 0)
    return { ok: false, error: HEALTH_PROFILE_REQUIRED_ERROR };

  const result = await AppointmentService.createAppointment(ctx.user.id, slotId, patientNotes, {
    clinicId: ctx.clinic.id,
    items: sanitizeItems(items),
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}

// ─── Services & packages (landing page) ───────────────────────────────────────

/** Practitioners who provide a service — the landing catalog's "book" button. */
export async function publicServiceProvidersAction(serviceId: string) {
  const clinic = await getHostClinic();
  if (!clinic || !/^[0-9a-f-]{36}$/i.test(serviceId)) return [];
  const providers = await CatalogService.listServiceProviders(clinic.id, serviceId);
  return (providers ?? []).map((p) => ({
    id: p.doctorId,
    name: practitionerName(p.fullName, p.title),
    specialty: p.specialty ?? "",
    branches: p.branches.map((b) => b.name),
  }));
}

/** The signed-in patient asks for a package (created unpaid; paid at the clinic). */
export async function requestMyPackageAction(
  packageId: string,
  branchId: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  const res = await PackageService.purchasePackage({
    clinicId: ctx.clinic.id,
    patientId: ctx.user.id,
    packageId: String(packageId),
    branchId: String(branchId),
    soldById: null,
    paid: false,
    note: "طلبها المريض من الموقع",
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/", "page");
  return { ok: true };
}
