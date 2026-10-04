"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getClinicContext, getHostClinic } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
import { expectedOrderTime } from "@/lib/availability/queue-time";
import * as TreatmentService from "@/server/services/treatments";
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
  // Only what the public cards show.
  return mapPage(result, (d) => ({
    id: d.id,
    specialty: d.specialty,
    consultationFee: d.consultationFee,
    profile: { fullName: d.profile.fullName, phone: d.profile.phone },
    _count: { appointments: d._count.appointments },
  }));
}

export async function getAvailableDaysAction(
  doctorId: string
): Promise<DoctorService.AvailableDay[]> {
  return DoctorService.getAvailableDaysForBooking(doctorId);
}

export async function getAvailableSlotsAction(
  doctorId: string,
  dateStr: string
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
  dateStr: string
): Promise<{
  mode: "order" | "arrival";
  available: boolean;
  remaining: number | null;
  nextOrderNumber: number;
  currentOrder: number | null;
  estimatedDurationMin: number | null;
  expectedTime: string | null;
} | null> {
  const info = await QueueService.getOrderBookingInfo(doctorId, new Date(dateStr));
  if (!info) return null;
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
    expectedTime: arrival
      ? null
      : expectedOrderTime(info.sessionStart, nextOrderNumber, info.estimatedDurationMin),
  };
}

// ─── Patient mutations ────────────────────────────────────────────────────────

export async function bookOrderAppointmentAction(
  doctorId: string,
  dateStr: string,
  patientNotes?: string
): Promise<{
  ok: boolean;
  error?: string;
  mode?: "order" | "arrival";
  orderNumber?: number | null;
}> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) return { ok: false, error: "هذه الخدمة للمرضى فقط" };

  const result = await QueueService.bookOrderAppointment(ctx.user.id, doctorId, new Date(dateStr), {
    notes: patientNotes,
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

export async function bookAppointmentAction(
  slotId: string,
  patientNotes?: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) {
    return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  }

  const result = await AppointmentService.createAppointment(ctx.user.id, slotId, patientNotes);

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}
