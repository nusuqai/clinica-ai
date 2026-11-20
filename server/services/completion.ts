import "server-only";
import {
  AppointmentStatus,
  CreditType,
  OfferType,
  PackagePaymentStatus,
  type PricingType,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pricingUsesUnits, tierForQuantity } from "@/lib/catalog";
import { applyOffer, dayKey } from "@/lib/offers";
import { resolveBookingItems, type BookingItemRequest } from "./booking";
import {
  consumeForLine,
  grantOfferReward,
  settleSessionLines,
  usablePackagesFor,
} from "./packages";
import { advanceQueueOnComplete } from "./queue";
import { ok, err, type Result } from "./_result";

// The completion window: when a visit is marked completed, the practitioner or
// reception records what actually happened, and everything that depends on it
// is written in ONE transaction with the status change:
//
//   FIXED / FREE                      → nothing to enter
//   PER_UNIT / TIERED                 → actual quantity (required)
//   STARTING_FROM / AFTER_CONSULTATION→ final price (required)
//   paid from a UNITS package         → actual units (deducted; any excess is
//                                       recorded as uncovered, not charged)
//   paid from a SESSIONS package      → nothing (the reserved session is used)
//
// Lines can be removed (not done) or added (decided on the spot), unpaid
// packages can be marked paid, and BUY_X_GET_Y offers grant their free
// sessions. Design: docs/services-and-packages.md §3.8.

// ─── Types ────────────────────────────────────────────────────────────────────

export type LineInput = "none" | "quantity" | "price" | "units";

export interface CompletionLine {
  itemId: string;
  serviceId: string;
  serviceName: string;
  pricingType: PricingType;
  unitLabel: string | null;
  quantity: number;
  unitPrice: number | null;
  total: number | null;
  offerLabel: string | null;
  input: LineInput;
  package: {
    id: string;
    name: string;
    creditType: CreditType;
    /** Credit free for this line (its own reservation included). */
    available: number;
    paymentStatus: PackagePaymentStatus;
  } | null;
}

export interface AddableService {
  id: string;
  name: string;
  pricingType: PricingType;
  unitLabel: string | null;
  packages: { patientPackageId: string; name: string; creditType: CreditType; available: number }[];
}

export interface CompletionDraft {
  appointmentId: string;
  patientName: string;
  doctorName: string;
  status: AppointmentStatus;
  lines: CompletionLine[];
  addable: AddableService[];
  /** Unpaid packages this visit draws on — can be marked paid here. */
  unpaidPackages: { id: string; name: string; pricePaid: number }[];
}

export interface CompleteVisitInput {
  appointmentId: string;
  lines: {
    itemId: string;
    remove?: boolean;
    finalQuantity?: number | null;
    finalPrice?: number | null;
  }[];
  add: (BookingItemRequest & { finalQuantity?: number | null; finalPrice?: number | null })[];
  confirmPaymentFor: string[];
}

const OPEN = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];
const round2 = (n: number) => Math.round(n * 100) / 100;
const dec = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

function inputFor(pricingType: PricingType, creditType: CreditType | null): LineInput {
  if (creditType === CreditType.SESSIONS) return "none";
  if (creditType === CreditType.UNITS) return "units";
  if (pricingUsesUnits(pricingType)) return "quantity";
  if (pricingType === "STARTING_FROM" || pricingType === "AFTER_CONSULTATION") return "price";
  return "none";
}

/** The visit's day ("YYYY-MM-DD") and its rule, for re-resolving added lines. */
async function visitContext(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      rule: { include: { services: { select: { serviceId: true } } } },
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          service: { select: { pricingType: true, unitLabel: true, categoryId: true } },
          offer: { select: { label: true } },
          balance: true,
          patientPackage: {
            select: { id: true, name: true, paymentStatus: true, pricePaid: true },
          },
        },
      },
    },
  });
}

// ─── Draft ────────────────────────────────────────────────────────────────────

export async function getCompletionDraft(
  appointmentId: string,
  clinicId: string
): Promise<Result<CompletionDraft>> {
  const a = await visitContext(appointmentId);
  if (!a || a.clinicId !== clinicId) return err("الموعد غير موجود");
  if (!OPEN.includes(a.status as (typeof OPEN)[number]))
    return err("هذا الموعد ليس قيد الانتظار أو مؤكداً");

  const lines: CompletionLine[] = a.items.map((i) => {
    const b = i.balance;
    const ownReservation = b?.creditType === CreditType.SESSIONS ? 1 : 0;
    return {
      itemId: i.id,
      serviceId: i.serviceId,
      serviceName: i.serviceName,
      pricingType: i.service.pricingType,
      unitLabel: i.service.unitLabel,
      quantity: i.quantity,
      unitPrice: dec(i.unitPrice),
      total: dec(i.total),
      offerLabel: i.offer?.label ?? null,
      input: inputFor(i.service.pricingType, b?.creditType ?? null),
      package:
        b && i.patientPackage
          ? {
              id: i.patientPackage.id,
              name: i.patientPackage.name,
              creditType: b.creditType,
              available: Math.max(0, b.total - b.used - b.reserved + ownReservation),
              paymentStatus: i.patientPackage.paymentStatus,
            }
          : null,
    };
  });

  // Services that could be added on the spot: what this practitioner provides
  // in this branch, each with the patient's packages that would cover it.
  const visitDay = dayKey(a.slot?.date ?? a.bookingDate ?? new Date());
  const provided = await prisma.doctorService.findMany({
    where: {
      doctorId: a.doctorId,
      service: {
        isActive: true,
        OR: [
          { allBranches: true },
          ...(a.branchId ? [{ branches: { some: { branchId: a.branchId } } }] : []),
        ],
      },
    },
    select: {
      service: {
        select: {
          id: true,
          name: true,
          pricingType: true,
          unitLabel: true,
          categoryId: true,
          sortOrder: true,
        },
      },
    },
    orderBy: { service: { sortOrder: "asc" } },
  });
  const addable: AddableService[] = [];
  for (const { service: s } of provided) {
    const packages = a.branchId
      ? await usablePackagesFor(clinicId, a.patientId, {
          branchId: a.branchId,
          serviceId: s.id,
          categoryId: s.categoryId,
          visitDay,
        })
      : [];
    addable.push({
      id: s.id,
      name: s.name,
      pricingType: s.pricingType,
      unitLabel: s.unitLabel,
      packages: packages.map((p) => ({
        patientPackageId: p.patientPackageId,
        name: p.name,
        creditType: p.balance.creditType,
        available: p.balance.available,
      })),
    });
  }

  const unpaid = new Map<string, { id: string; name: string; pricePaid: number }>();
  for (const i of a.items)
    if (i.patientPackage && i.patientPackage.paymentStatus === PackagePaymentStatus.UNPAID)
      unpaid.set(i.patientPackage.id, {
        id: i.patientPackage.id,
        name: i.patientPackage.name,
        pricePaid: Number(i.patientPackage.pricePaid),
      });

  return ok({
    appointmentId: a.id,
    patientName: a.patient.fullName,
    doctorName: a.doctor.fullName,
    status: a.status,
    lines,
    addable,
    unpaidPackages: [...unpaid.values()],
  });
}

// ─── Complete ─────────────────────────────────────────────────────────────────

class CompletionError extends Error {}

export async function completeVisit(
  clinicId: string,
  actorId: string | null,
  input: CompleteVisitInput
): Promise<Result<{ finalTotal: number | null; rewards: number }>> {
  const a = await visitContext(input.appointmentId);
  if (!a || a.clinicId !== clinicId) return err("الموعد غير موجود");
  if (!OPEN.includes(a.status as (typeof OPEN)[number]))
    return err("هذا الموعد ليس قيد الانتظار أو مؤكداً");

  const byItem = new Map(input.lines.map((l) => [l.itemId, l]));
  const kept = a.items.filter((i) => !byItem.get(i.id)?.remove);
  if (kept.length + input.add.length === 0)
    return err("يجب أن تبقى خدمة واحدة على الأقل في الزيارة");

  // Added lines are resolved like a booking (offered here, provided by this
  // practitioner, priced with the visit day's offer, payable by a package).
  let added: Awaited<ReturnType<typeof resolveBookingItems>> | null = null;
  if (input.add.length) {
    const slotMin = a.slot
      ? Math.round((a.slot.endTime.getTime() - a.slot.startTime.getTime()) / 60_000)
      : (a.rule?.slotDurationMin ?? 30);
    added = await resolveBookingItems(
      {
        id: a.ruleId ?? "",
        doctorId: a.doctorId,
        clinicId,
        branchId: a.branchId,
        slotDurationMin: slotMin,
        estimatedDurationMin: a.rule?.estimatedDurationMin ?? null,
        // On-the-spot additions aren't held to the day's service restriction.
        services: [],
      },
      dayKey(a.slot?.date ?? a.bookingDate ?? new Date()),
      input.add,
      { patientId: a.patientId }
    );
    if (!added.ok) return added;
    const existing = new Set(kept.map((i) => i.serviceId));
    if (added.data.lines.some((l) => existing.has(l.serviceId)))
      return err("الخدمة المضافة موجودة بالفعل في الزيارة");
  }

  // Every kept line must have what its type needs.
  for (const i of kept) {
    const need = inputFor(i.service.pricingType, i.balance?.creditType ?? null);
    const v = byItem.get(i.id);
    if ((need === "quantity" || need === "units") && !(v?.finalQuantity && v.finalQuantity >= 0))
      return err(`أدخل الكمية المستخدمة فعلياً لخدمة «${i.serviceName}»`);
    if (need === "price" && (v?.finalPrice == null || v.finalPrice < 0))
      return err(`أدخل السعر النهائي لخدمة «${i.serviceName}»`);
  }
  if (added?.ok) {
    for (const [idx, l] of added.data.lines.entries()) {
      const need = inputFor(l.pricingType, l.balanceId ? await creditTypeOf(l.balanceId) : null);
      const v = input.add[idx];
      if ((need === "quantity" || need === "units") && !(v.finalQuantity && v.finalQuantity >= 0))
        return err(`أدخل الكمية المستخدمة فعلياً لخدمة «${l.serviceName}»`);
      if (need === "price" && (v.finalPrice == null || v.finalPrice < 0))
        return err(`أدخل السعر النهائي لخدمة «${l.serviceName}»`);
    }
  }
  const paymentIds = [
    ...new Set(
      input.confirmPaymentFor.filter((id) => a.items.some((i) => i.patientPackageId === id))
    ),
  ];

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Claim the visit first, so a double submit completes it once.
      const claimed = await tx.appointment.updateMany({
        where: { id: a.id, status: { in: OPEN } },
        data: { status: AppointmentStatus.COMPLETED, completedAt: new Date() },
      });
      if (claimed.count === 0) throw new CompletionError("تم تحديث هذا الموعد بالفعل");

      // Removed lines: give back their reserved session, then drop them.
      for (const i of a.items.filter((x) => byItem.get(x.id)?.remove)) {
        if (i.balance?.creditType === CreditType.SESSIONS) {
          await tx.$executeRaw`UPDATE "patient_package_balances" SET "reserved" = GREATEST("reserved" - 1, 0) WHERE "id" = ${i.balanceId}::uuid`;
          await tx.packageLedger.create({
            data: {
              clinicId,
              balanceId: i.balanceId!,
              type: "RELEASE",
              quantity: 1,
              note: "حُذفت الخدمة من الزيارة",
              createdById: actorId,
            },
          });
        }
        await tx.packageLedger.updateMany({
          where: { appointmentItemId: i.id },
          data: { appointmentItemId: null },
        });
        await tx.appointmentItem.delete({ where: { id: i.id } });
      }

      // Added lines.
      const addedRows: { id: string; idx: number }[] = [];
      if (added?.ok) {
        for (const [idx, l] of added.data.lines.entries()) {
          const row = await tx.appointmentItem.create({
            data: {
              clinicId,
              appointmentId: a.id,
              serviceId: l.serviceId,
              serviceName: l.serviceName,
              doctorId: a.doctorId,
              quantity: l.quantity,
              basePrice: l.basePrice,
              offerId: l.offerId,
              discount: l.discount,
              unitPrice: l.unitPrice,
              total: l.total,
              durationMin: l.durationMin,
              patientPackageId: l.patientPackageId,
              balanceId: l.balanceId,
              sortOrder: a.items.length + idx,
            },
          });
          addedRows.push({ id: row.id, idx });
        }
      }

      // Final quantity / price per line.
      const finals: { id: string; finalQuantity: number | null; finalPrice: number | null }[] = [
        ...kept.map((i) => ({
          id: i.id,
          finalQuantity: byItem.get(i.id)?.finalQuantity ?? null,
          finalPrice: byItem.get(i.id)?.finalPrice ?? null,
        })),
        ...addedRows.map((r) => ({
          id: r.id,
          finalQuantity: input.add[r.idx].finalQuantity ?? null,
          finalPrice: input.add[r.idx].finalPrice ?? null,
        })),
      ];
      const items = await tx.appointmentItem.findMany({
        where: { appointmentId: a.id },
        include: {
          service: { include: { tiers: { orderBy: { minQty: "asc" } } } },
          offer: true,
          balance: true,
        },
      });
      let rewards = 0;
      for (const f of finals) {
        const i = items.find((x) => x.id === f.id)!;
        // Package-paid lines.
        if (i.balanceId && i.balance) {
          if (i.balance.creditType === CreditType.UNITS) {
            const q = Math.max(0, Math.floor(f.finalQuantity ?? 0));
            const { uncovered } = await consumeForLine(
              tx,
              { id: i.id, clinicId, balanceId: i.balanceId },
              q,
              { heldReservation: false, createdById: actorId }
            );
            await tx.appointmentItem.update({
              where: { id: i.id },
              data: { finalQuantity: q, finalTotal: 0, uncoveredQuantity: uncovered || null },
            });
          } else if (addedRows.some((r) => r.id === i.id)) {
            // A session added on the spot was never reserved: use it directly.
            const { uncovered } = await consumeForLine(
              tx,
              { id: i.id, clinicId, balanceId: i.balanceId },
              1,
              { heldReservation: false, createdById: actorId }
            );
            await tx.appointmentItem.update({
              where: { id: i.id },
              data: { finalQuantity: 1, finalTotal: 0, uncoveredQuantity: uncovered || null },
            });
          }
          continue; // reserved sessions are settled below
        }

        // Normally paid lines.
        const pt = i.service.pricingType;
        let finalQuantity = i.quantity;
        let finalTotal = dec(i.total);
        if (pt === "PER_UNIT") {
          finalQuantity = Math.max(0, Math.floor(f.finalQuantity ?? 0));
          finalTotal = dec(i.unitPrice) == null ? null : round2(dec(i.unitPrice)! * finalQuantity);
        } else if (pt === "TIERED") {
          finalQuantity = Math.max(0, Math.floor(f.finalQuantity ?? 0));
          const tier = tierForQuantity(
            i.service.tiers.map((t) => ({
              minQty: t.minQty,
              maxQty: t.maxQty,
              price: Number(t.price),
            })),
            finalQuantity
          );
          const base = tier?.price ?? null;
          finalTotal =
            base == null
              ? null
              : i.offer
                ? applyOffer({ type: i.offer.type, value: dec(i.offer.value) }, base).price
                : base;
        } else if (pt === "STARTING_FROM" || pt === "AFTER_CONSULTATION") {
          finalTotal = f.finalPrice != null ? round2(f.finalPrice) : finalTotal;
        } else if (pt === "FREE") {
          finalTotal = 0;
        }
        await tx.appointmentItem.update({
          where: { id: i.id },
          data: { finalQuantity, finalTotal },
        });

        // Buy X get Y: completing a paid line earns the free sessions.
        if (
          i.offer?.type === OfferType.BUY_X_GET_Y &&
          i.offer.getQty &&
          finalQuantity >= (i.offer.buyQty ?? 1) &&
          a.branchId
        ) {
          await grantOfferReward(tx, {
            clinicId,
            patientId: a.patientId,
            branchId: a.branchId,
            serviceId: i.serviceId,
            serviceName: i.serviceName,
            sessions: i.offer.getQty,
            validityDays: i.offer.rewardValidityDays ?? 90,
            offerId: i.offer.id,
            offerLabel: i.offer.label,
            appointmentItemId: i.id,
            createdById: actorId,
          });
          rewards++;
        }
      }

      // Sessions reserved at booking are used now.
      await settleSessionLines(tx, a.id, "COMPLETED", actorId);

      for (const id of paymentIds)
        await tx.patientPackage.updateMany({
          where: { id, paymentStatus: PackagePaymentStatus.UNPAID },
          data: {
            paymentStatus: PackagePaymentStatus.PAID,
            paidAt: new Date(),
            paidConfirmedById: actorId,
          },
        });

      const after = await tx.appointmentItem.findMany({
        where: { appointmentId: a.id },
        select: { finalTotal: true, durationMin: true },
      });
      const priced = after.filter((x) => x.finalTotal != null);
      const finalTotal = priced.length
        ? round2(priced.reduce((s, x) => s + Number(x.finalTotal), 0))
        : null;
      await tx.appointment.update({
        where: { id: a.id },
        data: {
          finalTotal,
          totalDurationMin: after.reduce((s, x) => s + x.durationMin, 0),
        },
      });
      return { finalTotal, rewards };
    });

    await advanceQueueOnComplete(a.id);
    return ok(result);
  } catch (e) {
    if (e instanceof CompletionError) return err(e.message);
    return err(e instanceof Error ? e.message : "فشل إتمام الزيارة");
  }
}

async function creditTypeOf(balanceId: string): Promise<CreditType | null> {
  const b = await prisma.patientPackageBalance.findUnique({
    where: { id: balanceId },
    select: { creditType: true },
  });
  return b?.creditType ?? null;
}
