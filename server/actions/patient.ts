"use server";

import { revalidatePath } from "next/cache";
import { AppointmentStatus, ConnectionRelation, Role } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getClinicContext } from "@/lib/auth";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
import * as ConnectionService from "@/server/services/connections";
import { expectedOrderTime } from "@/lib/availability/queue-time";

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

// ─── Connections (relatives the patient books for) ────────────────────────────

async function patientContext() {
  const ctx = await getClinicContext();
  return ctx?.role === Role.PATIENT ? ctx : null;
}

export async function addConnectionAction(input: {
  fullName: string;
  relation: ConnectionRelation;
  phone: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await patientContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول كمريض أولاً" };
  if (!Object.values(ConnectionRelation).includes(input.relation))
    return { ok: false, error: "صلة القرابة غير صحيحة" };

  const res = await ConnectionService.addDependent({
    clinicId: ctx.clinic.id,
    guardianId: ctx.user.id,
    fullName: input.fullName,
    relation: input.relation,
    phone: input.phone,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/profile", "page");
  return { ok: true };
}

export async function setConnectionPhoneAction(
  dependentId: string,
  phone: string
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await patientContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول كمريض أولاً" };

  const res = await ConnectionService.setDependentPhone({
    clinicId: ctx.clinic.id,
    guardianId: ctx.user.id,
    dependentId,
    phone,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/profile", "page");
  return { ok: true };
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
    select: { patientId: true, status: true, clinicId: true },
  });

  if (!appointment) return { ok: false, error: "الموعد غير موجود" };
  // Your own appointment, or one of a relative you book for.
  const allowed =
    appointment.patientId === user.id ||
    (await ConnectionService.canBookFor(appointment.clinicId, user.id, appointment.patientId));
  if (!allowed) return { ok: false, error: "ليس لديك صلاحية إلغاء هذا الموعد" };
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

// ─── Public queries (no auth required) ───────────────────────────────────────

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

/**
 * Who a web booking is for: the signed-in patient, or a relative they may book
 * for (an active PatientConnection with canBook). Null when not allowed.
 */
async function resolveBookingPatient(
  ctx: { clinic: { id: string }; user: { id: string } },
  forPatientId?: string | null
): Promise<string | null> {
  if (!forPatientId || forPatientId === ctx.user.id) return ctx.user.id;
  return (await ConnectionService.canBookFor(ctx.clinic.id, ctx.user.id, forPatientId))
    ? forPatientId
    : null;
}

const NOT_A_CONNECTION = "لا يمكنك الحجز لهذا الشخص — أضفه أولاً إلى صلاتك";

export async function bookOrderAppointmentAction(
  doctorId: string,
  dateStr: string,
  patientNotes?: string,
  forPatientId?: string | null
): Promise<{
  ok: boolean;
  error?: string;
  mode?: "order" | "arrival";
  orderNumber?: number | null;
}> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) return { ok: false, error: "هذه الخدمة للمرضى فقط" };

  const patientId = await resolveBookingPatient(ctx, forPatientId);
  if (!patientId) return { ok: false, error: NOT_A_CONNECTION };

  const result = await QueueService.bookOrderAppointment(patientId, doctorId, new Date(dateStr), {
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
  patientNotes?: string,
  forPatientId?: string | null
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "يجب تسجيل الدخول أولاً" };
  if (ctx.role !== Role.PATIENT) {
    return { ok: false, error: "هذه الخدمة للمرضى فقط" };
  }

  const patientId = await resolveBookingPatient(ctx, forPatientId);
  if (!patientId) return { ok: false, error: NOT_A_CONNECTION };

  const result = await AppointmentService.createAppointment(patientId, slotId, patientNotes);

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/");
  return { ok: true };
}
