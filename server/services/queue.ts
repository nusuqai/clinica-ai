import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import {
  AppointmentStatus,
  AvailabilityMode,
  DayOfWeek,
  type Prisma,
} from "@prisma/client";

// getUTCDay() index → DayOfWeek enum.
const DAY_BY_INDEX: DayOfWeek[] = [
  DayOfWeek.SUN,
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
];

/** Normalize any Date to a UTC date-only value (midnight) for @db.Date columns. */
export function toDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Find the active ORDER_BASED availability rule that applies to a doctor on a
 * given date. When branchId is given it must match; otherwise the first
 * order-based rule for that weekday is used.
 */
export async function getOrderRuleForDate(
  doctorId: string,
  date: Date,
  branchId?: string | null,
) {
  const dayOfWeek = DAY_BY_INDEX[toDateOnly(date).getUTCDay()];
  return prisma.availabilityRule.findFirst({
    where: {
      doctorId,
      dayOfWeek,
      isActive: true,
      mode: AvailabilityMode.ORDER_BASED,
      ...(branchId ? { branchId } : {}),
    },
    orderBy: { startTime: "asc" },
  });
}

/**
 * Get (or lazily create) the day queue for a (doctor, branch, date), snapshotting
 * the rule's cap/estimate onto it the first time. Runs inside the caller's
 * transaction when `tx` is passed.
 */
async function ensureQueue(
  tx: Prisma.TransactionClient,
  rule: {
    id: string;
    doctorId: string;
    branchId: string; // order-based rules must have a branch (see bookOrderAppointment)
    dailyCap: number | null;
    estimatedDurationMin: number | null;
  },
  clinicId: string,
  date: Date,
) {
  const day = toDateOnly(date);
  const existing = await tx.doctorDayQueue.findUnique({
    where: {
      doctorId_branchId_date: {
        doctorId: rule.doctorId,
        branchId: rule.branchId,
        date: day,
      },
    },
  });
  if (existing) return existing;
  return tx.doctorDayQueue.create({
    data: {
      clinicId,
      doctorId: rule.doctorId,
      branchId: rule.branchId,
      ruleId: rule.id,
      date: day,
      dailyCap: rule.dailyCap,
      estimatedDurationMin: rule.estimatedDurationMin,
    },
  });
}

export interface OrderBookingResult {
  id: string;
  orderNumber: number;
  bookingDate: Date;
  estimatedDurationMin: number | null;
  currentOrder: number;
  trackCurrentOrder: boolean;
}

/**
 * Book an order-based (queue) appointment: assign the next order number for the
 * (doctor, branch, day) and reject once the daily cap is reached. The order
 * number is handed out atomically so concurrent bookings never collide.
 */
export async function bookOrderAppointment(
  patientId: string,
  doctorId: string,
  date: Date,
  opts?: { branchId?: string | null; notes?: string },
): Promise<Result<OrderBookingResult>> {
  try {
    const day = toDateOnly(date);
    if (day < toDateOnly(new Date()))
      return err("لا يمكن الحجز في يوم مضى");

    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { clinicId: true },
    });
    if (!doctor) return err("الطبيب غير موجود");

    const rule = await getOrderRuleForDate(doctorId, day, opts?.branchId);
    if (!rule)
      return err("هذا الطبيب لا يعمل بنظام الدور في هذا اليوم");
    if (!rule.branchId)
      return err("قاعدة الدور بدون فرع محدد");
    const orderRule = { ...rule, branchId: rule.branchId };

    const result = await prisma.$transaction(async (tx) => {
      const queue = await ensureQueue(tx, orderRule, doctor.clinicId, day);

      // Atomically hand out the next order number, but only while under the cap.
      // Postgres re-checks the WHERE after locking the row, so two concurrent
      // bookings can't both slip past the cap.
      const bumped = await tx.doctorDayQueue.updateMany({
        where: {
          id: queue.id,
          ...(queue.dailyCap != null ? { nextOrder: { lte: queue.dailyCap } } : {}),
        },
        data: { nextOrder: { increment: 1 } },
      });
      if (bumped.count === 0) {
        return { capped: true as const };
      }

      const after = await tx.doctorDayQueue.findUniqueOrThrow({
        where: { id: queue.id },
      });
      const orderNumber = after.nextOrder - 1;

      const appt = await tx.appointment.create({
        data: {
          clinicId: doctor.clinicId,
          branchId: rule.branchId,
          patientId,
          doctorId,
          ruleId: rule.id,
          queueId: queue.id,
          bookingDate: day,
          orderNumber,
          estimatedDurationMin: after.estimatedDurationMin,
          status: AppointmentStatus.PENDING,
          patientNotes: opts?.notes ?? null,
        },
      });
      return {
        capped: false as const,
        appt,
        orderNumber,
        currentOrder: after.currentOrder,
        trackCurrentOrder: after.trackCurrentOrder,
        estimatedDurationMin: after.estimatedDurationMin,
      };
    });

    if (result.capped)
      return err("اكتمل عدد الحجوزات المتاحة لهذا اليوم");

    return ok({
      id: result.appt.id,
      orderNumber: result.orderNumber,
      bookingDate: day,
      estimatedDurationMin: result.estimatedDurationMin,
      currentOrder: result.currentOrder,
      trackCurrentOrder: result.trackCurrentOrder,
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حجز الدور");
  }
}

/** Estimated wait (minutes) for an order given the current position + per-patient estimate. */
export function estimateWaitMinutes(
  orderNumber: number,
  currentOrder: number,
  estimatedDurationMin: number | null,
): number | null {
  if (estimatedDurationMin == null) return null;
  return Math.max(0, orderNumber - currentOrder) * estimatedDurationMin;
}

export interface OrderBookingInfo {
  available: boolean;
  ruleId: string;
  branchId: string | null;
  dailyCap: number | null;
  booked: number; // order numbers handed out so far
  remaining: number | null; // null = unlimited
  currentOrder: number;
  estimatedDurationMin: number | null;
  trackCurrentOrder: boolean;
}

/**
 * Order-based availability for a (doctor, date): remaining capacity, the live
 * "now serving" number, and the per-patient estimate — the queue analogue of
 * listing free slots. Returns null when the doctor isn't order-based that day.
 */
export async function getOrderBookingInfo(
  doctorId: string,
  date: Date,
  branchId?: string | null,
): Promise<OrderBookingInfo | null> {
  const day = toDateOnly(date);
  const rule = await getOrderRuleForDate(doctorId, day, branchId);
  if (!rule || !rule.branchId) return null;

  const queue = await prisma.doctorDayQueue.findUnique({
    where: {
      doctorId_branchId_date: { doctorId, branchId: rule.branchId, date: day },
    },
  });
  const booked = queue ? queue.nextOrder - 1 : 0;
  const cap = queue?.dailyCap ?? rule.dailyCap;
  return {
    available: cap == null || booked < cap,
    ruleId: rule.id,
    branchId: rule.branchId,
    dailyCap: cap,
    booked,
    remaining: cap == null ? null : Math.max(0, cap - booked),
    currentOrder: queue?.currentOrder ?? 0,
    estimatedDurationMin: queue?.estimatedDurationMin ?? rule.estimatedDurationMin,
    trackCurrentOrder: queue?.trackCurrentOrder ?? true,
  };
}

// ─── Queue management (clinic/doctor controls) ────────────────────────────────

export async function getDayQueue(
  doctorId: string,
  date: Date,
  branchId?: string | null,
) {
  const day = toDateOnly(date);
  const queue = await prisma.doctorDayQueue.findFirst({
    where: { doctorId, date: day, ...(branchId ? { branchId } : {}) },
    include: {
      branch: { select: { id: true, name: true } },
      appointments: {
        where: { status: { not: AppointmentStatus.CANCELLED } },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          patientNotes: true,
          patient: { select: { fullName: true, phone: true } },
        },
        orderBy: { orderNumber: "asc" },
      },
    },
  });
  return queue;
}

async function ownedQueue(queueId: string, doctorId?: string) {
  const q = await prisma.doctorDayQueue.findUnique({ where: { id: queueId } });
  if (!q) return null;
  if (doctorId && q.doctorId !== doctorId) return null;
  return q;
}

/** Advance "now serving" to a specific number, or by +1 when `to` is omitted. */
export async function setCurrentOrder(
  queueId: string,
  to: number | null,
  doctorId?: string,
): Promise<Result<{ currentOrder: number }>> {
  try {
    const q = await ownedQueue(queueId, doctorId);
    if (!q) return err("الطابور غير موجود");
    const next = to == null ? q.currentOrder + 1 : to;
    if (next < 0) return err("رقم الدور غير صالح");
    if (next > q.nextOrder - 1) return err("لا يوجد دور بهذا الرقم بعد");
    const updated = await prisma.doctorDayQueue.update({
      where: { id: queueId },
      data: { currentOrder: next },
    });
    return ok({ currentOrder: updated.currentOrder });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث الدور الحالي");
  }
}

export async function toggleQueueTracking(
  queueId: string,
  track: boolean,
  doctorId?: string,
): Promise<Result<void>> {
  try {
    const q = await ownedQueue(queueId, doctorId);
    if (!q) return err("الطابور غير موجود");
    await prisma.doctorDayQueue.update({
      where: { id: queueId },
      data: { trackCurrentOrder: track },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة التتبّع");
  }
}

export async function setQueueCap(
  queueId: string,
  cap: number | null,
  doctorId?: string,
): Promise<Result<void>> {
  try {
    const q = await ownedQueue(queueId, doctorId);
    if (!q) return err("الطابور غير موجود");
    if (cap != null && cap < q.nextOrder - 1)
      return err("لا يمكن جعل الحد الأقصى أقل من عدد الحجوزات الحالية");
    await prisma.doctorDayQueue.update({
      where: { id: queueId },
      data: { dailyCap: cap },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث الحد الأقصى");
  }
}

/**
 * When an order-based appointment is completed, advance "now serving" to its
 * order number (never backwards). Called from updateAppointmentStatus.
 */
export async function advanceQueueOnComplete(appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { queueId: true, orderNumber: true },
  });
  if (!appt?.queueId || appt.orderNumber == null) return;
  await prisma.doctorDayQueue.updateMany({
    where: { id: appt.queueId, currentOrder: { lt: appt.orderNumber } },
    data: { currentOrder: appt.orderNumber },
  });
}
