import "server-only";
import { AppointmentStatus } from "@prisma/client";
import { modeTag, type DayModeTag } from "@/lib/availability/modes";
import type { BranchScope } from "@/lib/branch-scope";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import * as AppointmentService from "./appointments";
import * as BookingService from "./booking";
import * as UserService from "./users";
import * as Scope from "./branchScope";
import { getOrCreatePatientByPhone } from "./patients";

/**
 * Booking on a patient's behalf by the clinic team (phone call / walk-in) —
 * shared by the dashboard's booking modal and the team assistant (#89), so both
 * follow exactly the same rules. The patient is an existing patient of this
 * clinic or a new one created by phone (like a WhatsApp contact). Bookings made
 * by the clinic itself skip the approval step and land CONFIRMED.
 */
export interface BookOnBehalfInput {
  clinicId: string;
  /** The booking member's branch scope (null = every branch). */
  scope: BranchScope;
  /** The booking member (not alerted about their own booking). */
  actorUserId: string;
  patient: { id: string } | { fullName: string; phone: string };
  doctorId: string;
  /** Slot-based day: the slot to book. Order/arrival day: omit and pass `date`. */
  slotId?: string;
  date?: string;
  notes?: string;
  /** The services booked (default: the doctor's كشف). */
  items?: BookingService.BookingItemRequest[];
  /** Day-only day: the exact time already agreed with the patient ("HH:MM"). */
  scheduledTime?: string | null;
}

export type BookOnBehalfResult =
  | {
      ok: true;
      appointmentId: string;
      mode?: DayModeTag;
      orderNumber?: number | null;
    }
  | { ok: false; error: string };

const DOCTOR_NOT_FOUND = "الطبيب غير موجود";

export async function bookOnBehalf(input: BookOnBehalfInput): Promise<BookOnBehalfResult> {
  const { clinicId, scope } = input;
  if (input.items && (!Array.isArray(input.items) || input.items.length > 20))
    return { ok: false, error: "بيانات غير صالحة" };
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
  let mode: DayModeTag | undefined;
  let orderNumber: number | null | undefined;
  if (input.slotId) {
    const res = await AppointmentService.createAppointment(patientId, input.slotId, input.notes, {
      clinicId,
      branchScope: scope,
      items: input.items,
      actorUserId: input.actorUserId,
    });
    if (!res.ok) return { ok: false, error: res.error };
    appointmentId = res.data.id;
  } else if (input.date) {
    const res = await BookingService.bookQueueAppointment({
      patientId,
      doctorId: input.doctorId,
      date: new Date(input.date),
      notes: input.notes,
      clinicId,
      branchScope: scope,
      items: input.items,
      actorUserId: input.actorUserId,
      scheduledTime: input.scheduledTime,
    });
    if (!res.ok) return { ok: false, error: res.error };
    appointmentId = res.data.id;
    mode = modeTag(res.data.mode) as DayModeTag;
    orderNumber = res.data.orderNumber;
  } else {
    return { ok: false, error: "يرجى اختيار موعد" };
  }

  await AppointmentService.updateAppointmentStatus(appointmentId, AppointmentStatus.CONFIRMED);
  return { ok: true, appointmentId, mode, orderNumber };
}
