import "server-only";
import { branchIdFilter, type BranchScope } from "@/lib/branch-scope";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus, AvailabilityMode, DayOfWeek, type Prisma } from "@prisma/client";
import { QUEUE_MODES, isArrivalMode } from "@/lib/availability/modes";

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
 * Find the active queue-based (ORDER_BASED or ARRIVAL_BASED) availability rule
 * that applies to a doctor on a given date. When branchId is given it must
 * match; otherwise the first queue rule for that weekday is used. The returned
 * rule carries its `mode`, which callers branch on (arrival vs order booking).
 */
export async function getOrderRuleForDate(
  doctorId: string,
  date: Date,
  branchId?: string | null,
  branchScope?: BranchScope
) {
  const dayOfWeek = DAY_BY_INDEX[toDateOnly(date).getUTCDay()];
  return prisma.availabilityRule.findFirst({
    where: {
      doctorId,
      dayOfWeek,
      isActive: true,
      mode: { in: QUEUE_MODES },
      AND: [branchId ? { branchId } : {}, branchIdFilter(branchScope)],
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
  date: Date
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
  mode: AvailabilityMode;
  // ORDER_BASED: the queue position handed out now. ARRIVAL_BASED: null — the
  // patient only reserves; the order number is assigned at check-in by arrival.
  orderNumber: number | null;
  bookingDate: Date;
  estimatedDurationMin: number | null;
  currentOrder: number;
  trackCurrentOrder: boolean;
}

/**
 * Book a queue appointment (ORDER_BASED or ARRIVAL_BASED): claim one slot under
 * the day's cap atomically so concurrent bookings never overshoot the cap.
 *
 *  - ORDER_BASED: the order number is handed out now (nextOrder), so the patient
 *    leaves with a fixed queue position.
 *  - ARRIVAL_BASED (أسبقية الحضور): booking only reserves a place — orderNumber
 *    stays null and arrivedAt is unset. Reception assigns the order number at
 *    check-in via markArrived(), by physical arrival order. nextOrder here is
 *    just the reservation counter that enforces the cap.
 */
export async function bookOrderAppointment(
  patientId: string,
  doctorId: string,
  date: Date,
  opts?: {
    branchId?: string | null;
    notes?: string;
    clinicId?: string;
    /** Staff booking on a patient's behalf: only a queue in their branches. */
    branchScope?: BranchScope;
  }
): Promise<Result<OrderBookingResult>> {
  try {
    const day = toDateOnly(date);
    if (day < toDateOnly(new Date())) return err("لا يمكن الحجز في يوم مضى");

    const doctor = await prisma.doctor.findUnique({
      where: { id: doctorId },
      select: { clinicId: true },
    });
    if (!doctor) return err("الطبيب غير موجود");
    // Multi-tenant guard (#38): the doctor must belong to the caller's clinic, so
    // a patient in Clinic A can't book a queue place with a Clinic B doctor by id.
    if (opts?.clinicId && doctor.clinicId !== opts.clinicId) return err("الطبيب غير موجود");

    // Block a second open booking with the same doctor: the patient must finish
    // (or cancel) an existing PENDING/CONFIRMED appointment first.
    const active = await prisma.appointment.findFirst({
      where: {
        patientId,
        doctorId,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
      },
      select: { id: true },
    });
    if (active)
      return err(
        "لديك حجز قائم مع هذا الطبيب لم يكتمل بعد. يرجى إتمامه أو إلغاؤه قبل حجز موعد جديد."
      );

    const rule = await getOrderRuleForDate(doctorId, day, opts?.branchId, opts?.branchScope);
    if (!rule) return err("هذا الطبيب لا يعمل بنظام الدور أو أسبقية الحضور في هذا اليوم");
    if (!rule.branchId) return err("قاعدة الدور بدون فرع محدد");
    const orderRule = { ...rule, branchId: rule.branchId };
    const arrival = isArrivalMode(rule.mode);

    const result = await prisma.$transaction(async (tx) => {
      const queue = await ensureQueue(tx, orderRule, doctor.clinicId, day);

      // Atomically claim one place under the cap. Postgres re-checks the WHERE
      // after locking the row, so two concurrent bookings can't both slip past
      // the cap. nextOrder is the booking counter for both modes (for arrival it
      // just counts reservations; the serving order is assigned later at arrival).
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
      // Arrival-priority: no order number at booking (assigned on check-in).
      const orderNumber = arrival ? null : after.nextOrder - 1;

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

    if (result.capped) return err("اكتمل عدد الحجوزات المتاحة لهذا اليوم");

    return ok({
      id: result.appt.id,
      mode: rule.mode,
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
  estimatedDurationMin: number | null
): number | null {
  if (estimatedDurationMin == null) return null;
  return Math.max(0, orderNumber - currentOrder) * estimatedDurationMin;
}

export interface OrderBookingInfo {
  available: boolean;
  mode: AvailabilityMode; // ORDER_BASED or ARRIVAL_BASED
  ruleId: string;
  branchId: string | null;
  dailyCap: number | null;
  booked: number; // order numbers handed out so far
  remaining: number | null; // null = unlimited
  currentOrder: number;
  estimatedDurationMin: number | null;
  trackCurrentOrder: boolean;
  sessionStart: string; // "HH:MM"
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
  branchScope?: BranchScope
): Promise<OrderBookingInfo | null> {
  const day = toDateOnly(date);
  const rule = await getOrderRuleForDate(doctorId, day, branchId, branchScope);
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
    mode: rule.mode,
    ruleId: rule.id,
    branchId: rule.branchId,
    dailyCap: cap,
    booked,
    remaining: cap == null ? null : Math.max(0, cap - booked),
    currentOrder: queue?.currentOrder ?? 0,
    estimatedDurationMin: queue?.estimatedDurationMin ?? rule.estimatedDurationMin,
    trackCurrentOrder: queue?.trackCurrentOrder ?? true,
    sessionStart: rule.startTime, // "HH:MM" — session start for expected-time calc
  };
}

// ─── Queue management (clinic/doctor controls) ────────────────────────────────

export async function getDayQueue(
  doctorId: string,
  date: Date,
  branchId?: string | null,
  branchScope?: BranchScope
) {
  const day = toDateOnly(date);
  const queue = await prisma.doctorDayQueue.findFirst({
    where: {
      doctorId,
      date: day,
      AND: [branchId ? { branchId } : {}, branchIdFilter(branchScope)],
    },
    include: {
      branch: { select: { id: true, name: true } },
      rule: { select: { startTime: true, mode: true } }, // session start + mode (arrival vs order)
      appointments: {
        where: { status: { not: AppointmentStatus.CANCELLED } },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          skippedAt: true,
          arrivedAt: true,
          patientNotes: true,
          patient: { select: { fullName: true, phone: true } },
        },
        // Arrival-priority reservations have a null orderNumber until check-in;
        // keep them last, then order the assigned ones by their arrival number.
        orderBy: [{ orderNumber: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      },
    },
  });
  return queue;
}

/**
 * Check a reserved ARRIVAL_BASED patient in at the clinic: hand out the next
 * arrival/serving order number atomically and stamp arrivedAt. Idempotent — a
 * patient already checked in keeps their existing number. Order-based bookings
 * (which already have a number) are rejected.
 */
export async function markArrived(
  appointmentId: string,
  doctorId?: string
): Promise<Result<{ orderNumber: number }>> {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, queueId: true, doctorId: true, orderNumber: true, arrivedAt: true },
    });
    if (!appt || appt.queueId == null) return err("الحجز غير موجود في طابور أسبقية الحضور");
    if (doctorId && appt.doctorId !== doctorId) return err("غير مصرّح");
    // Already checked in (or an order-based booking that owns a number already).
    if (appt.orderNumber != null) return ok({ orderNumber: appt.orderNumber });

    const result = await prisma.$transaction(async (tx) => {
      // Atomically claim the next arrival order for this queue.
      const q = await tx.doctorDayQueue.update({
        where: { id: appt.queueId! },
        data: { nextArrival: { increment: 1 } },
      });
      const orderNumber = q.nextArrival - 1;
      await tx.appointment.update({
        where: { id: appointmentId },
        data: { orderNumber, arrivedAt: new Date() },
      });
      return orderNumber;
    });
    return ok({ orderNumber: result });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تسجيل حضور المريض");
  }
}

/**
 * Temporarily skip an order the doctor called but the patient isn't present for.
 * Keeps the appointment PENDING (no no-show) — just flags it and, if it was the
 * one being served, advances "now serving" to the next number. Recall restores it.
 */
export async function skipOrder(appointmentId: string, doctorId?: string): Promise<Result<void>> {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, orderNumber: true, queueId: true, doctorId: true },
    });
    if (!appt || appt.queueId == null || appt.orderNumber == null)
      return err("الحجز غير موجود في الطابور");
    if (doctorId && appt.doctorId !== doctorId) return err("غير مصرّح");

    const queue = await prisma.doctorDayQueue.findUnique({
      where: { id: appt.queueId },
    });
    if (!queue) return err("الطابور غير موجود");

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { skippedAt: new Date() },
    });

    // Skipping the patient being served advances the line exactly like "next
    // patient" — current jumps to serveNextOrder and next moves on — but the
    // patient is flagged (recoverable via recall) instead of completed.
    if (appt.orderNumber === queue.currentOrder) {
      await prisma.doctorDayQueue.update({
        where: { id: queue.id },
        data: {
          currentOrder: queue.serveNextOrder,
          serveNextOrder: queue.serveNextOrder + 1,
        },
      });
    }
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تخطّي الدور");
  }
}

/**
 * Recall a skipped patient who has now arrived: set "now serving" to their
 * original order so they're served now.
 *
 * If the patient currently being served is a real, non-skipped patient, they are
 * preserved as the resume point (serveNextOrder ← currentOrder) so serving
 * returns to them once the recalled patient is done. If the current patient is
 * itself a skipped (previously-recalled) one, serveNextOrder is left unchanged.
 *
 * The recalled patient's skip flag is intentionally NOT cleared here — it's
 * cleared only when the patient is finished (completeCurrentAndAdvance) — so a
 * subsequent recall can still tell that the current patient is a recalled one.
 */
export async function recallOrder(
  appointmentId: string,
  doctorId?: string
): Promise<Result<{ orderNumber: number }>> {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, queueId: true, doctorId: true, orderNumber: true },
    });
    if (!appt || appt.queueId == null || appt.orderNumber == null)
      return err("الحجز غير موجود في الطابور");
    if (doctorId && appt.doctorId !== doctorId) return err("غير مصرّح");

    const queue = await prisma.doctorDayQueue.findUnique({
      where: { id: appt.queueId },
    });
    if (!queue) return err("الطابور غير موجود");

    // Is the patient being served right now a non-skipped one worth resuming?
    const currentAppt = await prisma.appointment.findFirst({
      where: {
        queueId: queue.id,
        orderNumber: queue.currentOrder,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      },
      select: { skippedAt: true },
    });
    const preserveCurrent = !!currentAppt && currentAppt.skippedAt == null;

    await prisma.doctorDayQueue.update({
      where: { id: queue.id },
      data: {
        currentOrder: appt.orderNumber,
        ...(preserveCurrent ? { serveNextOrder: queue.currentOrder } : {}),
      },
    });
    return ok({ orderNumber: appt.orderNumber });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل إرجاع الدور");
  }
}

/**
 * "Next patient" / "start": marks the patient currently being served as
 * COMPLETED (if there is one) and advances to serveNextOrder, then bumps next.
 * From the not-started state (currentOrder 0, serveNextOrder 1) this simply
 * starts serving order 1.
 */
export async function completeCurrentAndAdvance(
  queueId: string,
  doctorId?: string
): Promise<Result<{ currentOrder: number; completedAppointmentId: string | null }>> {
  try {
    const q = await ownedQueue(queueId, doctorId);
    if (!q) return err("الطابور غير موجود");

    let completedAppointmentId: string | null = null;
    if (q.currentOrder >= 1) {
      // The current patient may be a recalled one that still carries a skip flag,
      // so don't filter on skippedAt here — complete whoever is being served and
      // clear the flag as part of finishing them.
      const current = await prisma.appointment.findFirst({
        where: {
          queueId,
          orderNumber: q.currentOrder,
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        },
        select: { id: true },
      });
      if (current) {
        await prisma.appointment.update({
          where: { id: current.id },
          // completedAt anchors the post-visit feedback delay in the sweep.
          data: { status: AppointmentStatus.COMPLETED, completedAt: new Date(), skippedAt: null },
        });
        completedAppointmentId = current.id;
      }
    }

    // Serve the stored next order, then advance next by one.
    const updated = await prisma.doctorDayQueue.update({
      where: { id: queueId },
      data: {
        currentOrder: q.serveNextOrder,
        serveNextOrder: q.serveNextOrder + 1,
      },
    });
    return ok({ currentOrder: updated.currentOrder, completedAppointmentId });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل الانتقال للمريض التالي");
  }
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
  doctorId?: string
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
  doctorId?: string
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
  doctorId?: string
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
