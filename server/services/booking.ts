import "server-only";
import { AppointmentStatus, QueueCapType, type PricingType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchScope } from "@/lib/branch-scope";
import { pricingUsesUnits, tierForQuantity } from "@/lib/catalog";
import { applyOffer, dayKey } from "@/lib/offers";
import { isArrivalMode } from "@/lib/availability/modes";
import { loadLiveOffers, offerForItem, type LiveOffer } from "./offers";
import {
  PackageCreditError,
  packageLineFor,
  releaseAppointmentPackages,
  reserveAppointmentPackages,
} from "./packages";
import { getOrderRuleForDate, toDateOnly, type OrderBookingResult } from "./queue";
import { ok, err, type Result } from "./_result";

// The booking engine: every appointment is booked FOR services (≥ 1 line), and
// the services' durations drive the schedule. Design and rules:
// docs/services-and-packages.md §3.3, §3.6, §3.7.
//
//  - A line is valid only when the branch offers the service, the practitioner
//    provides it and the day's rule allows it (no RuleService rows = any).
//  - Price: practitioner override → branch override → service price, then the
//    live offer for the branch on the VISIT day. Snapshotted on the line.
//  - Duration: practitioner override → service duration → the rule's default.
//  - Slot days: the visit holds ceil(total / slot length) consecutive slots of
//    the same rule, claimed atomically (Slot.heldById).
//  - Queue days: the cap is none / patients / minutes; booked minutes are
//    claimed atomically like the order counter.
//  - A patient can't hold two active bookings that overlap in time. (The old
//    "one open booking per doctor" rule is gone.)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingItemRequest {
  serviceId: string;
  /** PER_UNIT / TIERED only (estimated units); everything else is 1. */
  quantity?: number | null;
  /** Pay this line from one of the patient's packages (step 5). */
  patientPackageId?: string | null;
}

export interface ResolvedLine {
  serviceId: string;
  serviceName: string;
  categoryId: string;
  pricingType: PricingType;
  unitLabel: string | null;
  quantity: number;
  /** List price before the offer: unit price (PER_UNIT), bracket total (TIERED), else the price. */
  basePrice: number | null;
  offerId: string | null;
  offerLabel: string | null;
  /** Discount on the whole line. */
  discount: number | null;
  /** Price per unit after the offer (PER_UNIT), else the line price after the offer. */
  unitPrice: number | null;
  /** Estimated line total after the offer; null = decided at the visit. */
  total: number | null;
  durationMin: number;
  patientPackageId: string | null;
  balanceId: string | null;
}

export interface ResolvedBooking {
  lines: ResolvedLine[];
  totalDurationMin: number;
  /** Sum of the known line totals; null when no line has a price yet. */
  estimatedTotal: number | null;
}

interface RuleContext {
  id: string;
  doctorId: string;
  clinicId: string;
  branchId: string | null;
  slotDurationMin: number;
  estimatedDurationMin: number | null;
  services: { serviceId: string }[];
}

const ACTIVE_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
const round2 = (n: number) => Math.round(n * 100) / 100;
const dec = (v: Prisma.Decimal | null | undefined) => (v == null ? null : Number(v));

// ─── Line resolution ──────────────────────────────────────────────────────────

/**
 * The practitioner's default line when a caller doesn't (yet) choose services:
 * their كشف (CONSULTATION) service, or their only service. Keeps the older
 * booking paths working; the service-aware screens always pass items.
 */
async function defaultItems(rule: RuleContext): Promise<Result<BookingItemRequest[]>> {
  const provided = await prisma.doctorService.findMany({
    where: {
      doctorId: rule.doctorId,
      service: { isActive: true, bookable: true },
      ...(rule.services.length ? { serviceId: { in: rule.services.map((s) => s.serviceId) } } : {}),
    },
    select: { serviceId: true, service: { select: { kind: true, sortOrder: true } } },
    orderBy: { service: { sortOrder: "asc" } },
  });
  const consultation = provided.find((p) => p.service.kind === "CONSULTATION");
  const pick = consultation ?? (provided.length === 1 ? provided[0] : null);
  if (!pick)
    return err(
      provided.length === 0
        ? "لا توجد خدمات متاحة للحجز مع هذا الطبيب بعد"
        : "يرجى اختيار الخدمة المطلوبة"
    );
  return ok([{ serviceId: pick.serviceId }]);
}

/**
 * Validate and price the requested lines for a visit with `rule`'s doctor at
 * `rule`'s branch on `visitDay` ("YYYY-MM-DD").
 */
export async function resolveBookingItems(
  rule: RuleContext,
  visitDay: string,
  requested: BookingItemRequest[] | null | undefined,
  opts?: { offers?: LiveOffer[]; patientId?: string; replacingAppointmentId?: string }
): Promise<Result<ResolvedBooking>> {
  let items = requested ?? [];
  if (items.length === 0) {
    const fallback = await defaultItems(rule);
    if (!fallback.ok) return fallback;
    items = fallback.data;
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: rule.clinicId },
    select: { maxServicesPerAppointment: true },
  });
  const max = clinic?.maxServicesPerAppointment;
  if (max != null && items.length > max)
    return err(
      max === 1
        ? "يمكن حجز خدمة واحدة فقط في الموعد"
        : `يمكن حجز ${max} خدمات كحد أقصى في الموعد الواحد`
    );
  if (new Set(items.map((i) => i.serviceId)).size !== items.length)
    return err("تم اختيار نفس الخدمة أكثر من مرة");

  const services = await prisma.service.findMany({
    where: { clinicId: rule.clinicId, id: { in: items.map((i) => i.serviceId) } },
    include: {
      branches: true,
      tiers: { orderBy: { minQty: "asc" } },
      doctors: { where: { doctorId: rule.doctorId } },
    },
  });
  const byId = new Map(services.map((s) => [s.id, s]));
  const allowed = new Set(rule.services.map((s) => s.serviceId));
  const offers = opts?.offers ?? (await loadLiveOffers(rule.clinicId, rule.branchId, visitDay));

  const lines: ResolvedLine[] = [];
  for (const item of items) {
    const s = byId.get(item.serviceId);
    if (!s) return err("الخدمة غير موجودة");
    if (!s.isActive || !s.bookable) return err(`الخدمة «${s.name}» غير متاحة للحجز`);
    const branchRow = rule.branchId ? s.branches.find((b) => b.branchId === rule.branchId) : null;
    if (!s.allBranches && !branchRow) return err(`الخدمة «${s.name}» غير متاحة في هذا الفرع`);
    const doctorRow = s.doctors[0];
    if (!doctorRow) return err(`هذا الطبيب لا يقدّم خدمة «${s.name}»`);
    if (allowed.size > 0 && !allowed.has(s.id))
      return err(`خدمة «${s.name}» غير متاحة مع هذا الطبيب في هذا اليوم`);

    const units = pricingUsesUnits(s.pricingType);
    const quantity = units ? Math.max(1, Math.floor(item.quantity ?? 1)) : 1;
    if (units && item.quantity != null && (!Number.isInteger(item.quantity) || item.quantity < 1))
      return err("الكمية يجب أن تكون رقماً صحيحاً موجباً");

    const listPrice = dec(doctorRow.price) ?? dec(branchRow?.price) ?? dec(s.price);
    let basePrice: number | null;
    switch (s.pricingType) {
      case "FREE":
        basePrice = 0;
        break;
      case "AFTER_CONSULTATION":
        basePrice = null;
        break;
      case "TIERED": {
        const tier = tierForQuantity(
          s.tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, price: Number(t.price) })),
          quantity
        );
        basePrice = tier?.price ?? null;
        break;
      }
      default:
        basePrice = listPrice;
    }

    // Paid from one of the patient's packages: the line costs nothing now and
    // takes no offer; the package's credit is reserved / consumed instead.
    if (item.patientPackageId) {
      if (!opts?.patientId) return err("الباقة غير متاحة");
      const pkg = await packageLineFor({
        clinicId: rule.clinicId,
        patientId: opts.patientId,
        patientPackageId: item.patientPackageId,
        branchId: rule.branchId,
        serviceId: s.id,
        serviceName: s.name,
        categoryId: s.categoryId,
        visitDay,
        replacingAppointmentId: opts.replacingAppointmentId,
      });
      if (!pkg.ok) return pkg;
      lines.push({
        serviceId: s.id,
        serviceName: s.name,
        categoryId: s.categoryId,
        pricingType: s.pricingType,
        unitLabel: s.unitLabel,
        quantity,
        basePrice,
        offerId: null,
        offerLabel: null,
        discount: null,
        unitPrice: 0,
        total: 0,
        durationMin:
          doctorRow.durationMin ??
          s.durationMin ??
          rule.estimatedDurationMin ??
          rule.slotDurationMin,
        patientPackageId: item.patientPackageId,
        balanceId: pkg.data.balanceId,
      });
      continue;
    }

    const match = offerForItem(offers, { serviceId: s.id, categoryId: s.categoryId }, basePrice);
    const after = match ? applyOffer(match.offer, basePrice) : { price: basePrice, discount: 0 };
    const perUnit = s.pricingType === "PER_UNIT";
    const total =
      after.price == null ? null : round2(perUnit ? after.price * quantity : after.price);
    const discount = match ? round2(perUnit ? after.discount * quantity : after.discount) : null;

    lines.push({
      serviceId: s.id,
      serviceName: s.name,
      categoryId: s.categoryId,
      pricingType: s.pricingType,
      unitLabel: s.unitLabel,
      quantity,
      basePrice,
      offerId: match?.offer.id ?? null,
      offerLabel: match?.offer.label ?? null,
      discount,
      unitPrice: after.price,
      total,
      durationMin:
        doctorRow.durationMin ?? s.durationMin ?? rule.estimatedDurationMin ?? rule.slotDurationMin,
      patientPackageId: item.patientPackageId ?? null,
      balanceId: null,
    });
  }

  const totalDurationMin = lines.reduce((sum, l) => sum + l.durationMin, 0);
  const priced = lines.filter((l) => l.total != null);
  const estimatedTotal = priced.length
    ? round2(priced.reduce((sum, l) => sum + (l.total ?? 0), 0))
    : null;
  return ok({ lines, totalDurationMin, estimatedTotal });
}

function itemRows(clinicId: string, doctorId: string, lines: ResolvedLine[]) {
  return lines.map((l, i) => ({
    clinicId,
    serviceId: l.serviceId,
    serviceName: l.serviceName,
    doctorId,
    quantity: l.quantity,
    basePrice: l.basePrice,
    offerId: l.offerId,
    discount: l.discount,
    unitPrice: l.unitPrice,
    total: l.total,
    durationMin: l.durationMin,
    patientPackageId: l.patientPackageId,
    balanceId: l.balanceId,
    sortOrder: i,
  }));
}

// ─── Time windows / overlap guard ─────────────────────────────────────────────

/** Wall-clock window (ms, stored-UTC convention) of a "HH:MM"–"HH:MM" session on a day. */
function sessionWindow(day: Date, start: string, end: string): [number, number] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return [new Date(day).setUTCHours(sh, sm, 0, 0), new Date(day).setUTCHours(eh, em, 0, 0)];
}

/**
 * Refuse a booking whose time window overlaps another active booking of the
 * patient (any doctor). Queue bookings count as their whole session window.
 */
async function patientOverlap(
  patientId: string,
  day: Date,
  window: [number, number],
  excludeAppointmentId?: string
): Promise<string | null> {
  const rows = await prisma.appointment.findMany({
    where: {
      patientId,
      status: { in: ACTIVE_STATUSES },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      OR: [{ slot: { date: day } }, { bookingDate: day }],
    },
    select: {
      totalDurationMin: true,
      slot: { select: { startTime: true, endTime: true } },
      heldSlots: { select: { startTime: true, endTime: true } },
      bookingDate: true,
      rule: { select: { startTime: true, endTime: true } },
      doctor: { select: { fullName: true } },
    },
  });
  for (const r of rows) {
    let w: [number, number] | null = null;
    if (r.heldSlots.length) {
      w = [
        Math.min(...r.heldSlots.map((s) => s.startTime.getTime())),
        Math.max(...r.heldSlots.map((s) => s.endTime.getTime())),
      ];
    } else if (r.slot) {
      w = [r.slot.startTime.getTime(), r.slot.endTime.getTime()];
    } else if (r.bookingDate && r.rule) {
      w = sessionWindow(r.bookingDate, r.rule.startTime, r.rule.endTime);
    }
    if (w && w[0] < window[1] && window[0] < w[1])
      return `لديك حجز آخر في نفس الوقت (مع ${r.doctor.fullName}). اختر وقتاً لا يتعارض معه.`;
  }
  return null;
}

// ─── Slot booking ─────────────────────────────────────────────────────────────

export interface SlotBookingInput {
  patientId: string;
  /** The visit's first slot. */
  slotId: string;
  items?: BookingItemRequest[] | null;
  notes?: string | null;
  /** Multi-tenant guard: the slot's doctor must belong to this clinic. */
  clinicId?: string;
  /** Staff booking: the slot must be in their branches. */
  branchScope?: BranchScope;
  /** Doctor referral: may target referral-only slots; recorded on the visit. */
  referredByDoctorId?: string;
  /** Reschedule: the booking being replaced doesn't block itself. */
  excludeAppointmentId?: string;
  status?: AppointmentStatus;
}

export interface SlotBookingResult {
  id: string;
  slotIds: string[];
  booking: ResolvedBooking;
}

/** Load a slot plus the consecutive slots a visit of `durationMin` needs. */
async function consecutiveSlots(
  start: {
    id: string;
    doctorId: string;
    ruleId: string | null;
    date: Date;
    startTime: Date;
    endTime: Date;
  },
  durationMin: number,
  opts: { allowReferralOnly: boolean; reuseHeldBy?: string }
): Promise<Result<string[]>> {
  const slotMs = start.endTime.getTime() - start.startTime.getTime();
  if (slotMs <= 0) return err("الموعد غير صالح");
  const needed = Math.max(1, Math.ceil((durationMin * 60_000) / slotMs));
  if (needed === 1) return ok([start.id]);

  const run = await prisma.slot.findMany({
    where: {
      doctorId: start.doctorId,
      ruleId: start.ruleId,
      date: start.date,
      startTime: { gte: start.startTime },
    },
    orderBy: { startTime: "asc" },
    take: needed,
  });
  const tooShort =
    "مدة الخدمات المختارة أطول من الوقت المتاح بعد هذا الموعد. اختر موعداً أبكر أو خدمات أقل.";
  if (run.length < needed) return err(tooShort);
  for (let i = 0; i < run.length; i++) {
    const s = run[i];
    if (i > 0 && s.startTime.getTime() !== run[i - 1].endTime.getTime()) return err(tooShort);
    if (s.isBlocked || (s.referralOnly && !opts.allowReferralOnly)) return err(tooShort);
    if (s.heldById && s.heldById !== opts.reuseHeldBy)
      return err("الوقت التالي لهذا الموعد محجوز ولا يكفي لمدة الخدمات المختارة. اختر موعداً آخر.");
  }
  return ok(run.map((s) => s.id));
}

export async function bookSlotAppointment(
  input: SlotBookingInput
): Promise<Result<SlotBookingResult>> {
  const slot = await prisma.slot.findUnique({
    where: { id: input.slotId },
    include: {
      doctor: { select: { clinicId: true, isActive: true } },
      rule: { include: { services: { select: { serviceId: true } } } },
    },
  });
  const NOT_FOUND = "الموعد غير موجود";
  if (!slot) return err(NOT_FOUND);
  if (input.clinicId && slot.doctor.clinicId !== input.clinicId) return err(NOT_FOUND);
  if (input.branchScope && (!slot.branchId || !input.branchScope.includes(slot.branchId)))
    return err(NOT_FOUND);
  if (slot.isBlocked) return err("هذا الموعد غير متاح");
  if (slot.referralOnly && !input.referredByDoctorId)
    return err("هذا الموعد مخصّص للتحويلات من الأطباء ولا يمكن حجزه مباشرةً");
  if (slot.heldById && slot.heldById !== input.excludeAppointmentId)
    return err("هذا الموعد محجوز بالفعل");
  if (slot.startTime < new Date()) return err("لا يمكن حجز مواعيد في الماضي");
  if (input.referredByDoctorId && slot.doctorId === input.referredByDoctorId)
    return err("لا يمكن تحويل المريض إلى نفس الطبيب");

  const rule: RuleContext = slot.rule
    ? {
        id: slot.rule.id,
        doctorId: slot.doctorId,
        clinicId: slot.doctor.clinicId,
        branchId: slot.branchId,
        // The slot's own length is the schedule's unit.
        slotDurationMin: Math.round((slot.endTime.getTime() - slot.startTime.getTime()) / 60_000),
        estimatedDurationMin: null,
        services: slot.rule.services,
      }
    : {
        id: "",
        doctorId: slot.doctorId,
        clinicId: slot.doctor.clinicId,
        branchId: slot.branchId,
        slotDurationMin: Math.round((slot.endTime.getTime() - slot.startTime.getTime()) / 60_000),
        estimatedDurationMin: null,
        services: [],
      };

  const resolved = await resolveBookingItems(rule, dayKey(slot.date), input.items, {
    patientId: input.patientId,
    replacingAppointmentId: input.excludeAppointmentId,
  });
  if (!resolved.ok) return resolved;
  const booking = resolved.data;

  const run = await consecutiveSlots(slot, booking.totalDurationMin, {
    allowReferralOnly: !!input.referredByDoctorId,
    reuseHeldBy: input.excludeAppointmentId,
  });
  if (!run.ok) return run;
  const slotIds = run.data;

  const overlap = await patientOverlap(
    input.patientId,
    slot.date,
    [slot.startTime.getTime(), slot.startTime.getTime() + booking.totalDurationMin * 60_000],
    input.excludeAppointmentId
  );
  if (overlap) return err(overlap);

  try {
    const id = await prisma.$transaction(async (tx) => {
      const appt = await tx.appointment.create({
        data: {
          clinicId: slot.doctor.clinicId,
          branchId: slot.branchId,
          patientId: input.patientId,
          doctorId: slot.doctorId,
          referredByDoctorId: input.referredByDoctorId ?? null,
          slotId: slot.id,
          ruleId: slot.ruleId,
          status: input.status ?? AppointmentStatus.PENDING,
          ...(input.status === AppointmentStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
          patientNotes: input.notes ?? null,
          totalDurationMin: booking.totalDurationMin,
          estimatedTotal: booking.estimatedTotal,
          items: { create: itemRows(slot.doctor.clinicId, slot.doctorId, booking.lines) },
        },
      });
      // A reschedule first releases what the old booking holds that the new one
      // needs: overlapping slots, and its reserved package sessions (the new
      // visit reserves them again right below).
      if (input.excludeAppointmentId) {
        await tx.slot.updateMany({
          where: { heldById: input.excludeAppointmentId, id: { in: slotIds } },
          data: { heldById: null },
        });
        await releaseAppointmentPackages(tx, input.excludeAppointmentId);
      }
      // Claim every slot atomically: Postgres re-checks `heldById IS NULL` after
      // taking each row lock, so a concurrent booking of any of them loses.
      const claimed = await tx.slot.updateMany({
        where: { id: { in: slotIds }, heldById: null, isBlocked: false },
        data: { heldById: appt.id },
      });
      if (claimed.count !== slotIds.length) throw new SlotTakenError();
      await reserveAppointmentPackages(tx, appt.id);
      return appt.id;
    });
    return ok({ id, slotIds, booking });
  } catch (e) {
    if (e instanceof SlotTakenError) return err("تم حجز هذا الموعد للتو. يرجى اختيار موعد آخر.");
    if (e instanceof PackageCreditError) return err(e.message);
    return err(e instanceof Error ? e.message : "فشل حجز الموعد");
  }
}

class SlotTakenError extends Error {}

// ─── Queue booking (order / arrival) ──────────────────────────────────────────

export interface QueueBookingInput {
  patientId: string;
  doctorId: string;
  date: Date;
  branchId?: string | null;
  items?: BookingItemRequest[] | null;
  notes?: string | null;
  clinicId?: string;
  branchScope?: BranchScope;
  status?: AppointmentStatus;
}

export async function bookQueueAppointment(
  input: QueueBookingInput
): Promise<Result<OrderBookingResult & { booking: ResolvedBooking }>> {
  const day = toDateOnly(input.date);
  if (day < toDateOnly(new Date())) return err("لا يمكن الحجز في يوم مضى");

  const doctor = await prisma.doctor.findUnique({
    where: { id: input.doctorId },
    select: { clinicId: true },
  });
  if (!doctor || (input.clinicId && doctor.clinicId !== input.clinicId))
    return err("الطبيب غير موجود");

  const rule = await getOrderRuleForDate(input.doctorId, day, input.branchId, input.branchScope);
  if (!rule) return err("هذا الطبيب لا يعمل بنظام الدور أو أسبقية الحضور في هذا اليوم");
  if (!rule.branchId) return err("قاعدة الدور بدون فرع محدد");
  const branchId = rule.branchId;
  const ruleServices = await prisma.ruleService.findMany({
    where: { ruleId: rule.id },
    select: { serviceId: true },
  });

  const resolved = await resolveBookingItems(
    { ...rule, branchId, services: ruleServices },
    dayKey(day),
    input.items,
    { patientId: input.patientId }
  );
  if (!resolved.ok) return resolved;
  const booking = resolved.data;
  const minutes = booking.totalDurationMin;

  const overlap = await patientOverlap(
    input.patientId,
    day,
    sessionWindow(day, rule.startTime, rule.endTime)
  );
  if (overlap) return err(overlap);

  const arrival = isArrivalMode(rule.mode);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const queue =
        (await tx.doctorDayQueue.findUnique({
          where: { doctorId_branchId_date: { doctorId: input.doctorId, branchId, date: day } },
        })) ??
        (await tx.doctorDayQueue.create({
          data: {
            clinicId: doctor.clinicId,
            doctorId: input.doctorId,
            branchId,
            ruleId: rule.id,
            date: day,
            capType: rule.capType,
            dailyCap: rule.dailyCap,
            dailyCapMinutes: rule.dailyCapMinutes,
            estimatedDurationMin: rule.estimatedDurationMin,
          },
        }));

      // Claim a place (and its minutes) under the cap in one guarded UPDATE, so
      // concurrent bookings can never overshoot it.
      const capWhere: Prisma.DoctorDayQueueWhereInput =
        queue.capType === QueueCapType.PATIENTS && queue.dailyCap != null
          ? { nextOrder: { lte: queue.dailyCap } }
          : queue.capType === QueueCapType.MINUTES && queue.dailyCapMinutes != null
            ? { bookedMinutes: { lte: queue.dailyCapMinutes - minutes } }
            : {};
      const bumped = await tx.doctorDayQueue.updateMany({
        where: { id: queue.id, ...capWhere },
        data: { nextOrder: { increment: 1 }, bookedMinutes: { increment: minutes } },
      });
      if (bumped.count === 0) return { capped: true as const, capType: queue.capType };

      const after = await tx.doctorDayQueue.findUniqueOrThrow({ where: { id: queue.id } });
      const orderNumber = arrival ? null : after.nextOrder - 1;
      const appt = await tx.appointment.create({
        data: {
          clinicId: doctor.clinicId,
          branchId,
          patientId: input.patientId,
          doctorId: input.doctorId,
          ruleId: rule.id,
          queueId: queue.id,
          bookingDate: day,
          orderNumber,
          estimatedDurationMin: minutes,
          status: input.status ?? AppointmentStatus.PENDING,
          ...(input.status === AppointmentStatus.CONFIRMED ? { confirmedAt: new Date() } : {}),
          patientNotes: input.notes ?? null,
          totalDurationMin: minutes,
          estimatedTotal: booking.estimatedTotal,
          items: { create: itemRows(doctor.clinicId, input.doctorId, booking.lines) },
        },
      });
      await reserveAppointmentPackages(tx, appt.id);
      return { capped: false as const, appt, orderNumber, after };
    });

    if (result.capped)
      return err(
        result.capType === QueueCapType.MINUTES
          ? "لا يتسع وقت هذا اليوم لمدة الخدمات المختارة. اختر يوماً آخر."
          : "اكتمل عدد الحجوزات المتاحة لهذا اليوم"
      );
    return ok({
      id: result.appt.id,
      mode: rule.mode,
      orderNumber: result.orderNumber,
      bookingDate: day,
      estimatedDurationMin: minutes,
      currentOrder: result.after.currentOrder,
      trackCurrentOrder: result.after.trackCurrentOrder,
      booking,
    });
  } catch (e) {
    if (e instanceof PackageCreditError) return err(e.message);
    return err(e instanceof Error ? e.message : "فشل حجز الدور");
  }
}

// ─── Release (cancel / reschedule) ────────────────────────────────────────────

/**
 * Give back what an appointment holds: its slots (slot days), its booked
 * minutes (queue days) and the package sessions it reserved. Called when it is cancelled. Idempotent: a second call
 * finds nothing held. The order counter itself is never rewound (a queue's
 * numbers stay unique).
 */
export async function releaseAppointmentHold(
  appointmentId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<void> {
  await tx.slot.updateMany({ where: { heldById: appointmentId }, data: { heldById: null } });
  await releaseAppointmentPackages(tx, appointmentId);
  const appt = await tx.appointment.findUnique({
    where: { id: appointmentId },
    select: { queueId: true, totalDurationMin: true, estimatedDurationMin: true },
  });
  const minutes = appt?.totalDurationMin ?? appt?.estimatedDurationMin ?? 0;
  if (appt?.queueId && minutes > 0) {
    await tx.doctorDayQueue.updateMany({
      where: { id: appt.queueId, bookedMinutes: { gte: minutes } },
      data: { bookedMinutes: { decrement: minutes } },
    });
  }
}

/**
 * Move a slot booking to another start slot with the same services (re-priced
 * for the new day/branch). Books the new visit first, then cancels the old one,
 * so a failure leaves the original untouched.
 */
export async function rescheduleToSlot(
  appointmentId: string,
  newSlotId: string,
  opts: { patientId: string; clinicId?: string; reason?: string }
): Promise<Result<SlotBookingResult>> {
  const old = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      patientId: opts.patientId,
      ...(opts.clinicId ? { clinicId: opts.clinicId } : {}),
    },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!old) return err("الموعد غير موجود");
  if (!ACTIVE_STATUSES.includes(old.status as (typeof ACTIVE_STATUSES)[number]))
    return err("لا يمكن إعادة جدولة هذا الموعد");

  const created = await bookSlotAppointment({
    patientId: opts.patientId,
    slotId: newSlotId,
    clinicId: opts.clinicId,
    notes: old.patientNotes,
    excludeAppointmentId: old.id,
    items: old.items.map((i) => ({
      serviceId: i.serviceId,
      quantity: i.quantity,
      patientPackageId: i.patientPackageId,
    })),
  });
  if (!created.ok) return created;

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: old.id },
      data: {
        status: AppointmentStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: opts.reason ?? "إعادة جدولة",
      },
    });
    // Only the old booking's remaining holds — the new one already owns its slots.
    await releaseAppointmentHold(old.id, tx);
  });
  return created;
}

// ─── Availability helpers ─────────────────────────────────────────────────────

/**
 * Which (rule, branch) combinations can take a visit for `serviceIds` with this
 * doctor: the doctor provides every service, each is offered in the branch and
 * allowed by the rule. Returns null when no services are given (no filter).
 */
export async function serviceFit(
  doctorId: string,
  serviceIds: readonly string[] | null | undefined
): Promise<((ruleId: string | null, branchId: string | null) => boolean) | null> {
  if (!serviceIds || serviceIds.length === 0) return null;
  const ids = [...new Set(serviceIds)];
  const [services, provided, ruleRows] = await Promise.all([
    prisma.service.findMany({
      where: { id: { in: ids }, isActive: true, bookable: true },
      select: { id: true, allBranches: true, branches: { select: { branchId: true } } },
    }),
    prisma.doctorService.count({ where: { doctorId, serviceId: { in: ids } } }),
    prisma.ruleService.findMany({
      where: { rule: { doctorId } },
      select: { ruleId: true, serviceId: true },
    }),
  ]);
  if (services.length !== ids.length || provided !== ids.length) return () => false;
  const restricted = new Map<string, Set<string>>();
  for (const r of ruleRows) {
    restricted.set(r.ruleId, (restricted.get(r.ruleId) ?? new Set()).add(r.serviceId));
  }
  return (ruleId, branchId) => {
    const only = ruleId ? restricted.get(ruleId) : undefined;
    if (only && ids.some((id) => !only.has(id))) return false;
    return services.every(
      (s) => s.allBranches || (!!branchId && s.branches.some((b) => b.branchId === branchId))
    );
  };
}

/**
 * How long a visit for `serviceIds` takes with this doctor: `fixed` minutes from
 * services with a duration (practitioner override first), plus `defaults`
 * services without one — each of those takes the rule's default length, which
 * the caller knows (slot length / the queue estimate). null = no services given.
 */
export interface VisitLength {
  fixed: number;
  defaults: number;
}

export async function visitMinutes(
  doctorId: string,
  serviceIds: readonly string[] | null | undefined
): Promise<VisitLength | null> {
  if (!serviceIds || serviceIds.length === 0) return null;
  const rows = await prisma.service.findMany({
    where: { id: { in: [...new Set(serviceIds)] } },
    select: { durationMin: true, doctors: { where: { doctorId }, select: { durationMin: true } } },
  });
  let fixed = 0;
  let defaults = 0;
  for (const r of rows) {
    const d = r.doctors[0]?.durationMin ?? r.durationMin;
    if (d == null) defaults++;
    else fixed += d;
  }
  return { fixed, defaults };
}

/** Minutes of a visit given the rule's default length for duration-less services. */
export function lengthWith(length: VisitLength | null, defaultMin: number): number | null {
  return length ? length.fixed + length.defaults * defaultMin : null;
}

export interface SlotLike {
  id: string;
  ruleId: string | null;
  branchId: string | null;
  date: Date;
  startTime: Date;
  endTime: Date;
  isBlocked: boolean;
  referralOnly: boolean;
  heldById: string | null;
}

/**
 * The slots a visit of `durationMin` can START at: the slot and as many
 * following ones as the visit needs are free, unblocked and back to back
 * within the same rule and day. `length` null = one slot.
 */
export function fittingStartSlots<T extends SlotLike>(
  slots: readonly T[],
  length: VisitLength | null,
  opts?: { allowReferralOnly?: boolean }
): T[] {
  const usable = (s: T) =>
    !s.isBlocked && !s.heldById && (opts?.allowReferralOnly || !s.referralOnly);
  const groups = new Map<string, T[]>();
  for (const s of slots) {
    const key = `${s.ruleId ?? ""}|${dayKey(s.date)}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out: T[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    for (let i = 0; i < group.length; i++) {
      const first = group[i];
      const slotMs = first.endTime.getTime() - first.startTime.getTime();
      const durationMin = lengthWith(length, slotMs / 60_000);
      const needed =
        durationMin && slotMs > 0 ? Math.max(1, Math.ceil((durationMin * 60_000) / slotMs)) : 1;
      let ok = true;
      for (let k = 0; k < needed; k++) {
        const s = group[i + k];
        if (
          !s ||
          !usable(s) ||
          (k > 0 && s.startTime.getTime() !== group[i + k - 1].endTime.getTime())
        ) {
          ok = false;
          break;
        }
      }
      if (ok) out.push(first);
    }
  }
  return out.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}
