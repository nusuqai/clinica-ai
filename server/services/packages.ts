import "server-only";
import {
  CreditType,
  PackageLedgerType,
  PackagePaymentStatus,
  PatientPackageSource,
  PatientPackageStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchScope } from "@/lib/branch-scope";
import { applyOffer, dayFromKey, dayKey, todayInZone } from "@/lib/offers";
import type {
  PackageInput,
  adjustBalanceSchema,
  cancelPackageSchema,
  extendPackageSchema,
} from "@/lib/validations/catalog";
import type { z } from "zod";
import { packageScopeFilter } from "./catalog";
import { loadLiveOffers, offerForItem } from "./offers";
import { ok, err, type Result } from "./_result";

// Prepaid packages: the catalog (what can be bought) and what each patient owns
// (balances + a ledger of every change). Rules: docs/services-and-packages.md §3.4.
//
//  - A package is usable only in the branch it was bought in, until its last
//    valid day (`expiresAt`, a clinic wall-clock day like Slot.date).
//  - Payment is tracked apart from usage: an UNPAID package can still be used.
//  - SESSIONS credit is reserved at booking (so the last session can't be
//    booked twice), consumed on completion AND on a no-show, released on any
//    cancellation. UNITS credit is never reserved; the actual units are
//    consumed at completion, and nothing on a no-show.
//  - Use beyond the balance is deducted down to 0 and the rest is recorded on
//    the visit line (`uncoveredQuantity`) — not charged for now.
//
// Ledger `quantity` is the signed change of the line's REMAINING credit
// (total − used): PURCHASE +n, CONSUME −n, ADJUST ±n, EXPIRE/CANCEL −remaining.
// RESERVE (−n) / RELEASE (+n) record movements of the reservation instead, and
// EXTEND carries 0.

// ─── Types ────────────────────────────────────────────────────────────────────

export type PackageAccess = "full" | "partial";

export interface PackageItemView {
  creditType: CreditType;
  quantity: number;
  categoryId: string | null;
  serviceIds: string[];
}

export interface PackageView {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  terms: string | null;
  agentNotes: string | null;
  price: number;
  validityDays: number;
  allBranches: boolean;
  isActive: boolean;
  branches: { branchId: string; price: number | null }[];
  items: PackageItemView[];
  soldCount: number;
  access: PackageAccess;
}

export interface BalanceView {
  id: string;
  creditType: CreditType;
  total: number;
  used: number;
  reserved: number;
  /** total − used − reserved */
  available: number;
  categoryId: string | null;
  serviceIds: string[];
}

export interface LedgerView {
  id: string;
  balanceId: string;
  type: PackageLedgerType;
  quantity: number;
  note: string | null;
  createdAt: Date;
  appointmentId: string | null;
  serviceName: string | null;
}

export interface PatientPackageView {
  id: string;
  name: string;
  packageId: string | null;
  branchId: string;
  branchName: string;
  source: PatientPackageSource;
  status: PatientPackageStatus;
  paymentStatus: PackagePaymentStatus;
  basePrice: number;
  pricePaid: number;
  offerLabel: string | null;
  purchasedAt: Date;
  /** Last valid day, "YYYY-MM-DD". */
  expiresOn: string;
  balances: BalanceView[];
  ledger: LedgerView[];
  /** Inside the caller's branch scope — may be managed. */
  manageable: boolean;
}

const PACKAGE_NOT_FOUND = "الباقة غير موجودة";
const OWNED_NOT_FOUND = "باقة المريض غير موجودة";
const FULL_SCOPE_ONLY = "هذا الإجراء متاح فقط لمن يدير كل فروع الباقة";

const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

function accessFor(
  p: { allBranches: boolean; branches: { branchId: string }[] },
  scope: BranchScope
): PackageAccess {
  if (scope === null) return "full";
  if (p.allBranches) return "partial";
  return p.branches.every((b) => scope.includes(b.branchId)) ? "full" : "partial";
}

async function clinicToday(clinicId: string, tx: Prisma.TransactionClient = prisma) {
  const c = await tx.clinic.findUnique({ where: { id: clinicId }, select: { timezone: true } });
  return todayInZone(c?.timezone ?? "Africa/Cairo");
}

/** "YYYY-MM-DD" + n days. */
function addDays(key: string, days: number): string {
  const d = dayFromKey(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dayKey(d);
}

// ─── Catalog: queries ─────────────────────────────────────────────────────────

const packageInclude = {
  branches: true,
  items: { include: { services: { select: { serviceId: true } } } },
  _count: { select: { patientPackages: true } },
} satisfies Prisma.PackageInclude;

type PackageRow = Prisma.PackageGetPayload<{ include: typeof packageInclude }>;

function toPackageView(p: PackageRow, scope: BranchScope): PackageView {
  return {
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    description: p.description,
    terms: p.terms,
    agentNotes: p.agentNotes,
    price: Number(p.price),
    validityDays: p.validityDays,
    allBranches: p.allBranches,
    isActive: p.isActive,
    branches: p.branches.map((b) => ({ branchId: b.branchId, price: num(b.price) })),
    items: p.items.map((i) => ({
      creditType: i.creditType,
      quantity: i.quantity,
      categoryId: i.categoryId,
      serviceIds: i.services.map((s) => s.serviceId),
    })),
    soldCount: p._count.patientPackages,
    access: accessFor(p, scope),
  };
}

export async function listPackages(clinicId: string, scope: BranchScope): Promise<PackageView[]> {
  const rows = await prisma.package.findMany({
    where: { clinicId, ...packageScopeFilter(scope) },
    include: packageInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((p) => toPackageView(p, scope));
}

// ─── Catalog: mutations ───────────────────────────────────────────────────────

async function nameTaken(clinicId: string, name: string, exceptId?: string) {
  const clash = await prisma.package.findFirst({
    where: { clinicId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return !!clash && clash.id !== exceptId;
}

async function validatePackageRefs(clinicId: string, input: PackageInput): Promise<string | null> {
  const categoryIds = [
    input.categoryId,
    ...input.items.flatMap((i) => (i.categoryId ? [i.categoryId] : [])),
  ];
  const uniqueCats = [...new Set(categoryIds)];
  const serviceIds = [...new Set(input.items.flatMap((i) => i.serviceIds))];
  const branchIds = input.branches.map((b) => b.branchId);
  const [cats, services, branches] = await Promise.all([
    prisma.category.count({ where: { clinicId, id: { in: uniqueCats } } }),
    serviceIds.length ? prisma.service.count({ where: { clinicId, id: { in: serviceIds } } }) : 0,
    branchIds.length ? prisma.branch.count({ where: { clinicId, id: { in: branchIds } } }) : 0,
  ]);
  if (cats !== uniqueCats.length) return "التصنيف غير موجود";
  if (services !== serviceIds.length) return "إحدى الخدمات غير موجودة";
  if (branches !== branchIds.length) return "أحد الفروع غير موجود";
  return null;
}

const coreData = (input: PackageInput) => ({
  categoryId: input.categoryId,
  name: input.name,
  description: input.description,
  terms: input.terms,
  agentNotes: input.agentNotes,
  price: input.price,
  validityDays: input.validityDays,
});

function itemCreates(input: PackageInput) {
  return input.items.map((i) => ({
    creditType: i.creditType,
    quantity: i.quantity,
    categoryId: i.categoryId,
    services: { create: i.serviceIds.map((serviceId) => ({ serviceId })) },
  }));
}

function scopeBranchError(scope: BranchScope, input: PackageInput): string | null {
  if (scope === null) return null;
  if (input.allBranches) return "اختر الفروع التي تُباع فيها الباقة من فروعك";
  if (input.branches.some((b) => !scope.includes(b.branchId)))
    return "لا يمكنك إضافة الباقة لفرع خارج فروعك";
  return null;
}

export async function createPackage(
  clinicId: string,
  scope: BranchScope,
  input: PackageInput
): Promise<Result<{ id: string }>> {
  const scopeErr = scopeBranchError(scope, input);
  if (scopeErr) return err(scopeErr);
  if (!input.allBranches && input.branches.length === 0)
    return err("اختر فرعاً واحداً على الأقل تُباع فيه الباقة");
  const refErr = await validatePackageRefs(clinicId, input);
  if (refErr) return err(refErr);
  if (await nameTaken(clinicId, input.name)) return err("توجد باقة بهذا الاسم بالفعل.");
  try {
    const last = await prisma.package.aggregate({ where: { clinicId }, _max: { sortOrder: true } });
    const p = await prisma.package.create({
      data: {
        clinicId,
        ...coreData(input),
        allBranches: input.allBranches,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        branches: { create: input.branches },
        items: { create: itemCreates(input) },
      },
    });
    return ok({ id: p.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return err("توجد باقة بهذا الاسم بالفعل.");
    throw e;
  }
}

/**
 * Edit a package. What patients already bought is snapshotted, so this only
 * affects future purchases. A member who doesn't manage every branch of it
 * edits only their own branches' rows.
 */
export async function updatePackage(
  clinicId: string,
  scope: BranchScope,
  packageId: string,
  input: PackageInput
): Promise<Result<void>> {
  const existing = await prisma.package.findFirst({
    where: { id: packageId, clinicId, ...packageScopeFilter(scope) },
    include: { branches: true },
  });
  if (!existing) return err(PACKAGE_NOT_FOUND);

  if (accessFor(existing, scope) === "partial") {
    const mine = scope as readonly string[];
    const rows = input.branches.filter((b) => mine.includes(b.branchId));
    await prisma.$transaction([
      prisma.packageBranch.deleteMany({ where: { packageId, branchId: { in: [...mine] } } }),
      prisma.packageBranch.createMany({
        data: rows
          .filter((b) => !existing.allBranches || b.price != null)
          .map((b) => ({ packageId, branchId: b.branchId, price: b.price })),
      }),
    ]);
    return ok(undefined);
  }

  const scopeErr = scopeBranchError(scope, input);
  if (scopeErr) return err(scopeErr);
  if (!input.allBranches && input.branches.length === 0)
    return err("اختر فرعاً واحداً على الأقل تُباع فيه الباقة");
  const refErr = await validatePackageRefs(clinicId, input);
  if (refErr) return err(refErr);
  if (await nameTaken(clinicId, input.name, packageId)) return err("توجد باقة بهذا الاسم بالفعل.");

  await prisma.$transaction([
    prisma.package.update({
      where: { id: packageId },
      data: { ...coreData(input), allBranches: input.allBranches },
    }),
    prisma.packageBranch.deleteMany({ where: { packageId } }),
    prisma.packageBranch.createMany({ data: input.branches.map((b) => ({ packageId, ...b })) }),
    prisma.packageItem.deleteMany({ where: { packageId } }),
    ...input.items.map((i) =>
      prisma.packageItem.create({
        data: {
          packageId,
          creditType: i.creditType,
          quantity: i.quantity,
          categoryId: i.categoryId,
          services: { create: i.serviceIds.map((serviceId) => ({ serviceId })) },
        },
      })
    ),
  ]);
  return ok(undefined);
}

export async function setPackageActive(
  clinicId: string,
  scope: BranchScope,
  packageId: string,
  isActive: boolean
): Promise<Result<void>> {
  const p = await prisma.package.findFirst({
    where: { id: packageId, clinicId, ...packageScopeFilter(scope) },
    include: { branches: true },
  });
  if (!p) return err(PACKAGE_NOT_FOUND);
  if (accessFor(p, scope) !== "full") return err(FULL_SCOPE_ONLY);
  await prisma.package.update({ where: { id: packageId }, data: { isActive } });
  return ok(undefined);
}

/** Delete a package nobody bought; a sold one is deactivated instead. */
export async function deletePackage(
  clinicId: string,
  scope: BranchScope,
  packageId: string
): Promise<Result<void>> {
  const p = await prisma.package.findFirst({
    where: { id: packageId, clinicId, ...packageScopeFilter(scope) },
    include: { branches: true, _count: { select: { patientPackages: true } } },
  });
  if (!p) return err(PACKAGE_NOT_FOUND);
  if (accessFor(p, scope) !== "full") return err(FULL_SCOPE_ONLY);
  if (p._count.patientPackages > 0)
    return err("هذه الباقة بيعت لمرضى ولا يمكن حذفها. يمكنك تعطيلها بدلاً من ذلك.");
  await prisma.package.delete({ where: { id: packageId } });
  return ok(undefined);
}

// ─── Buying ───────────────────────────────────────────────────────────────────

export interface PackageQuote {
  packageId: string;
  name: string;
  branchId: string;
  basePrice: number;
  price: number;
  discount: number;
  offerId: string | null;
  offerLabel: string | null;
  /** BONUS_UNITS offer: units added to each UNITS line. */
  bonusUnits: number;
  validityDays: number;
  /** Last valid day if bought today. */
  expiresOn: string;
  items: PackageItemView[];
  terms: string | null;
}

/** The price of a package in a branch today (branch price, then the live offer). */
export async function quotePackage(
  clinicId: string,
  packageId: string,
  branchId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<Result<PackageQuote>> {
  const p = await tx.package.findFirst({
    where: { id: packageId, clinicId },
    include: { branches: true, items: { include: { services: true } } },
  });
  if (!p || !p.isActive) return err(PACKAGE_NOT_FOUND);
  const branchRow = p.branches.find((b) => b.branchId === branchId);
  if (!p.allBranches && !branchRow) return err("هذه الباقة غير متاحة في هذا الفرع");

  const today = await clinicToday(clinicId, tx);
  const basePrice = num(branchRow?.price ?? null) ?? Number(p.price);
  const offers = await loadLiveOffers(clinicId, branchId, today);
  const match = offerForItem(offers, { packageId: p.id, categoryId: p.categoryId }, basePrice);
  const after = match ? applyOffer(match.offer, basePrice) : { price: basePrice, discount: 0 };
  const bonusUnits =
    match?.offer.type === "BONUS_UNITS" && match.offer.value ? Math.floor(match.offer.value) : 0;

  return ok({
    packageId: p.id,
    name: p.name,
    branchId,
    basePrice,
    price: after.price ?? basePrice,
    discount: round2(after.discount),
    offerId: match?.offer.id ?? null,
    offerLabel: match?.offer.label ?? null,
    bonusUnits,
    validityDays: p.validityDays,
    expiresOn: addDays(today, p.validityDays - 1),
    items: p.items.map((i) => ({
      creditType: i.creditType,
      quantity: i.quantity,
      categoryId: i.categoryId,
      serviceIds: i.services.map((s) => s.serviceId),
    })),
    terms: p.terms,
  });
}

/**
 * Create a patient's package from the catalog: snapshots the price, the offer,
 * the coverage and the expiry, opens the balances and writes PURCHASE rows.
 * `soldById` null = requested by the patient (agent / website).
 */
export async function purchasePackage(
  input: {
    clinicId: string;
    patientId: string;
    packageId: string;
    branchId: string;
    soldById: string | null;
    paid: boolean;
    note?: string | null;
  },
  tx?: Prisma.TransactionClient
): Promise<Result<{ id: string; quote: PackageQuote }>> {
  const run = async (
    t: Prisma.TransactionClient
  ): Promise<Result<{ id: string; quote: PackageQuote }>> => {
    const patient = await t.profile.findUnique({
      where: { id: input.patientId },
      select: { id: true },
    });
    if (!patient) return err("المريض غير موجود");
    const quote = await quotePackage(input.clinicId, input.packageId, input.branchId, t);
    if (!quote.ok) return quote;
    const q = quote.data;
    const pp = await t.patientPackage.create({
      data: {
        clinicId: input.clinicId,
        patientId: input.patientId,
        packageId: q.packageId,
        branchId: input.branchId,
        name: q.name,
        source: PatientPackageSource.PURCHASE,
        offerId: q.offerId,
        basePrice: q.basePrice,
        pricePaid: q.price,
        expiresAt: dayFromKey(q.expiresOn),
        soldById: input.soldById,
        paymentStatus: input.paid ? PackagePaymentStatus.PAID : PackagePaymentStatus.UNPAID,
        ...(input.paid ? { paidAt: new Date(), paidConfirmedById: input.soldById } : {}),
      },
    });
    for (const item of q.items) {
      const total = item.quantity + (item.creditType === CreditType.UNITS ? q.bonusUnits : 0);
      const bal = await t.patientPackageBalance.create({
        data: {
          patientPackageId: pp.id,
          creditType: item.creditType,
          total,
          categoryId: item.categoryId,
          serviceIds: item.serviceIds,
        },
      });
      await t.packageLedger.create({
        data: {
          clinicId: input.clinicId,
          balanceId: bal.id,
          type: PackageLedgerType.PURCHASE,
          quantity: total,
          note:
            [
              input.note,
              q.bonusUnits && item.creditType === CreditType.UNITS
                ? `منها ${q.bonusUnits} وحدة هدية (${q.offerLabel})`
                : null,
            ]
              .filter(Boolean)
              .join(" — ") || null,
          createdById: input.soldById,
        },
      });
    }
    return ok({ id: pp.id, quote: q });
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * A BUY_X_GET_Y reward: free SESSIONS of one service, valid `validityDays`,
 * usable in the visit's branch. Written with the completion that earned it.
 */
export async function grantOfferReward(
  tx: Prisma.TransactionClient,
  input: {
    clinicId: string;
    patientId: string;
    branchId: string;
    serviceId: string;
    serviceName: string;
    sessions: number;
    validityDays: number;
    offerId: string;
    offerLabel: string;
    appointmentItemId: string;
    createdById: string | null;
  }
): Promise<string> {
  const today = await clinicToday(input.clinicId, tx);
  const pp = await tx.patientPackage.create({
    data: {
      clinicId: input.clinicId,
      patientId: input.patientId,
      branchId: input.branchId,
      name: `هدية: ${input.serviceName} (${input.offerLabel})`,
      source: PatientPackageSource.OFFER,
      offerId: input.offerId,
      basePrice: 0,
      pricePaid: 0,
      expiresAt: dayFromKey(addDays(today, input.validityDays - 1)),
      paymentStatus: PackagePaymentStatus.PAID,
      paidAt: new Date(),
    },
  });
  const bal = await tx.patientPackageBalance.create({
    data: {
      patientPackageId: pp.id,
      creditType: CreditType.SESSIONS,
      total: input.sessions,
      serviceIds: [input.serviceId],
    },
  });
  await tx.packageLedger.create({
    data: {
      clinicId: input.clinicId,
      balanceId: bal.id,
      appointmentItemId: input.appointmentItemId,
      type: PackageLedgerType.PURCHASE,
      quantity: input.sessions,
      note: `هدية من العرض «${input.offerLabel}»`,
      createdById: input.createdById,
    },
  });
  return pp.id;
}

// ─── Patient packages: queries ────────────────────────────────────────────────

const ownedInclude = {
  branch: { select: { name: true } },
  offer: { select: { label: true } },
  balances: {
    orderBy: { creditType: "asc" },
    include: {
      ledger: {
        orderBy: { createdAt: "desc" },
        include: { appointmentItem: { select: { appointmentId: true, serviceName: true } } },
      },
    },
  },
} satisfies Prisma.PatientPackageInclude;

type OwnedRow = Prisma.PatientPackageGetPayload<{ include: typeof ownedInclude }>;

function toOwnedView(p: OwnedRow, scope: BranchScope): PatientPackageView {
  return {
    id: p.id,
    name: p.name,
    packageId: p.packageId,
    branchId: p.branchId,
    branchName: p.branch.name,
    source: p.source,
    status: p.status,
    paymentStatus: p.paymentStatus,
    basePrice: Number(p.basePrice),
    pricePaid: Number(p.pricePaid),
    offerLabel: p.offer?.label ?? null,
    purchasedAt: p.purchasedAt,
    expiresOn: dayKey(p.expiresAt),
    balances: p.balances.map((b) => ({
      id: b.id,
      creditType: b.creditType,
      total: b.total,
      used: b.used,
      reserved: b.reserved,
      available: Math.max(0, b.total - b.used - b.reserved),
      categoryId: b.categoryId,
      serviceIds: b.serviceIds,
    })),
    ledger: p.balances
      .flatMap((b) =>
        b.ledger.map((l) => ({
          id: l.id,
          balanceId: b.id,
          type: l.type,
          quantity: l.quantity,
          note: l.note,
          createdAt: l.createdAt,
          appointmentId: l.appointmentItem?.appointmentId ?? null,
          serviceName: l.appointmentItem?.serviceName ?? null,
        }))
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    manageable: scope === null || scope.includes(p.branchId),
  };
}

/** A patient's packages at this clinic, newest first (all statuses). */
export async function listPatientPackages(
  clinicId: string,
  patientId: string,
  scope: BranchScope = null
): Promise<PatientPackageView[]> {
  const rows = await prisma.patientPackage.findMany({
    where: { clinicId, patientId },
    include: ownedInclude,
    orderBy: { purchasedAt: "desc" },
  });
  return rows.map((p) => toOwnedView(p, scope));
}

/**
 * The patient's packages that can pay for `serviceId` at `branchId` on
 * `visitDay`: active, same branch, not expired by then, covering the service
 * and with credit left (a SESSIONS line needs a free session).
 */
export async function usablePackagesFor(
  clinicId: string,
  patientId: string,
  where: { branchId: string; serviceId: string; categoryId: string; visitDay: string }
): Promise<
  {
    patientPackageId: string;
    name: string;
    balance: BalanceView;
    expiresOn: string;
    paymentStatus: PackagePaymentStatus;
  }[]
> {
  const rows = await prisma.patientPackage.findMany({
    where: {
      clinicId,
      patientId,
      branchId: where.branchId,
      status: PatientPackageStatus.ACTIVE,
      expiresAt: { gte: dayFromKey(where.visitDay) },
    },
    include: { balances: true },
    orderBy: { expiresAt: "asc" },
  });
  const out = [];
  for (const p of rows) {
    const bal = pickBalance(p.balances, where);
    if (!bal) continue;
    out.push({
      patientPackageId: p.id,
      name: p.name,
      expiresOn: dayKey(p.expiresAt),
      paymentStatus: p.paymentStatus,
      balance: {
        id: bal.id,
        creditType: bal.creditType,
        total: bal.total,
        used: bal.used,
        reserved: bal.reserved,
        available: Math.max(0, bal.total - bal.used - bal.reserved),
        categoryId: bal.categoryId,
        serviceIds: bal.serviceIds,
      },
    });
  }
  return out;
}

type BalanceRow = {
  id: string;
  creditType: CreditType;
  total: number;
  used: number;
  reserved: number;
  categoryId: string | null;
  serviceIds: string[];
};

/** The credit line that covers the service and still has credit (sessions first). */
function pickBalance<T extends BalanceRow>(
  balances: readonly T[],
  item: { serviceId: string; categoryId: string }
): T | null {
  const covering = balances.filter(
    (b) =>
      (b.categoryId != null && b.categoryId === item.categoryId) ||
      b.serviceIds.includes(item.serviceId)
  );
  const withCredit = covering.filter((b) =>
    b.creditType === CreditType.SESSIONS ? b.total - b.used - b.reserved >= 1 : b.total - b.used > 0
  );
  return withCredit.find((b) => b.creditType === CreditType.SESSIONS) ?? withCredit[0] ?? null;
}

// ─── Booking integration ──────────────────────────────────────────────────────

/**
 * Validate that a line may be paid from `patientPackageId` and pick its credit
 * line. Used by the booking engine while resolving lines (read-only).
 */
export async function packageLineFor(input: {
  clinicId: string;
  patientId: string;
  patientPackageId: string;
  branchId: string | null;
  serviceId: string;
  serviceName: string;
  categoryId: string;
  visitDay: string;
  /** Reschedule: the booking being replaced — its reserved sessions count as free. */
  replacingAppointmentId?: string;
}): Promise<Result<{ balanceId: string; creditType: CreditType }>> {
  const p = await prisma.patientPackage.findFirst({
    where: { id: input.patientPackageId, clinicId: input.clinicId, patientId: input.patientId },
    include: { balances: true },
  });
  if (p && input.replacingAppointmentId) {
    const held = await heldByAppointment(prisma, input.replacingAppointmentId);
    p.balances = p.balances.map((b) => ({ ...b, reserved: b.reserved - (held.get(b.id) ?? 0) }));
  }
  if (!p) return err(OWNED_NOT_FOUND);
  if (p.status !== PatientPackageStatus.ACTIVE) return err(`الباقة «${p.name}» غير نشطة`);
  if (p.branchId !== input.branchId)
    return err(`الباقة «${p.name}» تُستخدم فقط في الفرع الذي اشتُريت منه`);
  if (dayKey(p.expiresAt) < input.visitDay)
    return err(`تنتهي صلاحية الباقة «${p.name}» قبل يوم الموعد`);
  const bal = pickBalance(p.balances, input);
  if (!bal) {
    const covers = p.balances.some(
      (b) => b.categoryId === input.categoryId || b.serviceIds.includes(input.serviceId)
    );
    return err(
      covers
        ? `لا يوجد رصيد متبقٍ في الباقة «${p.name}» لخدمة «${input.serviceName}»`
        : `الباقة «${p.name}» لا تشمل خدمة «${input.serviceName}»`
    );
  }
  return ok({ balanceId: bal.id, creditType: bal.creditType });
}

export class PackageCreditError extends Error {}

/**
 * Inside the booking transaction: reserve one session per SESSIONS line of the
 * appointment. The guarded UPDATE re-checks the free credit under the row
 * lock, so two bookings can't both take the last session.
 */
export async function reserveAppointmentPackages(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  createdById: string | null = null
): Promise<void> {
  const items = await tx.appointmentItem.findMany({
    where: { appointmentId, balanceId: { not: null } },
    include: { balance: { select: { creditType: true } } },
  });
  for (const item of items) {
    if (item.balance?.creditType !== CreditType.SESSIONS) continue;
    const n = 1;
    const updated = await tx.$executeRaw`
      UPDATE "patient_package_balances"
      SET "reserved" = "reserved" + ${n}
      WHERE "id" = ${item.balanceId}::uuid AND "total" - "used" - "reserved" >= ${n}`;
    if (updated === 0)
      throw new PackageCreditError(`لا توجد جلسات متبقية في الباقة لخدمة «${item.serviceName}»`);
    await tx.packageLedger.create({
      data: {
        clinicId: item.clinicId,
        balanceId: item.balanceId!,
        appointmentItemId: item.id,
        type: PackageLedgerType.RESERVE,
        quantity: -n,
        createdById,
      },
    });
  }
}

/** Sessions each balance still has reserved for an appointment (RESERVE − RELEASE − CONSUME). */
async function heldByAppointment(
  tx: Prisma.TransactionClient,
  appointmentId: string
): Promise<Map<string, number>> {
  const moves = await tx.packageLedger.findMany({
    where: {
      appointmentItem: { appointmentId },
      type: {
        in: [PackageLedgerType.RESERVE, PackageLedgerType.RELEASE, PackageLedgerType.CONSUME],
      },
    },
    select: {
      balanceId: true,
      type: true,
      appointmentItem: { select: { balance: { select: { creditType: true } } } },
    },
  });
  const held = new Map<string, number>();
  for (const m of moves) {
    if (m.appointmentItem?.balance?.creditType !== CreditType.SESSIONS) continue;
    held.set(
      m.balanceId,
      (held.get(m.balanceId) ?? 0) + (m.type === PackageLedgerType.RESERVE ? 1 : -1)
    );
  }
  return held;
}

/** Cancellation (any time): give back the sessions the visit reserved. */
export async function releaseAppointmentPackages(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  createdById: string | null = null
): Promise<void> {
  const items = await tx.appointmentItem.findMany({
    where: { appointmentId, balanceId: { not: null }, finalQuantity: null },
    include: { balance: { select: { creditType: true } } },
  });
  for (const item of items) {
    if (item.balance?.creditType !== CreditType.SESSIONS) continue;
    // Only if this line still holds a reservation (RESERVE without RELEASE/CONSUME).
    const moves = await tx.packageLedger.findMany({
      where: { appointmentItemId: item.id, type: { in: ["RESERVE", "RELEASE", "CONSUME"] } },
      select: { type: true },
    });
    const held =
      moves.filter((m) => m.type === "RESERVE").length -
      moves.filter((m) => m.type !== "RESERVE").length;
    if (held <= 0) continue;
    await tx.$executeRaw`
      UPDATE "patient_package_balances" SET "reserved" = GREATEST("reserved" - 1, 0)
      WHERE "id" = ${item.balanceId}::uuid`;
    await tx.packageLedger.create({
      data: {
        clinicId: item.clinicId,
        balanceId: item.balanceId!,
        appointmentItemId: item.id,
        type: PackageLedgerType.RELEASE,
        quantity: 1,
        note: "إلغاء الموعد",
        createdById,
      },
    });
  }
}

/**
 * Deduct `quantity` from a line's balance (down to 0) and record it. A
 * reservation the line held is turned into usage. Returns the uncovered part.
 */
export async function consumeForLine(
  tx: Prisma.TransactionClient,
  item: { id: string; clinicId: string; balanceId: string },
  quantity: number,
  opts: { note?: string | null; createdById?: string | null; heldReservation: boolean }
): Promise<{ consumed: number; uncovered: number }> {
  const bal = await tx.patientPackageBalance.findUniqueOrThrow({ where: { id: item.balanceId } });
  const freeBefore = bal.total - bal.used - (bal.reserved - (opts.heldReservation ? 1 : 0));
  const consumed = Math.max(0, Math.min(quantity, freeBefore));
  await tx.patientPackageBalance.update({
    where: { id: bal.id },
    data: {
      used: { increment: consumed },
      ...(opts.heldReservation ? { reserved: { decrement: Math.min(1, bal.reserved) } } : {}),
    },
  });
  await tx.packageLedger.create({
    data: {
      clinicId: item.clinicId,
      balanceId: bal.id,
      appointmentItemId: item.id,
      type: PackageLedgerType.CONSUME,
      quantity: -consumed,
      note: opts.note ?? null,
      createdById: opts.createdById ?? null,
    },
  });
  await markUsedUpIfEmpty(tx, bal.patientPackageId);
  return { consumed, uncovered: Math.max(0, quantity - consumed) };
}

async function markUsedUpIfEmpty(tx: Prisma.TransactionClient, patientPackageId: string) {
  const balances = await tx.patientPackageBalance.findMany({ where: { patientPackageId } });
  if (balances.length && balances.every((b) => b.total - b.used <= 0))
    await tx.patientPackage.updateMany({
      where: { id: patientPackageId, status: PatientPackageStatus.ACTIVE },
      data: { status: PatientPackageStatus.USED_UP },
    });
}

/**
 * Settle the SESSIONS lines of a visit that ended: COMPLETED and NO_SHOW both
 * consume the reserved session. UNITS lines are settled by the completion
 * modal (actual units); a no-show deducts nothing from them. Idempotent: a
 * settled line has finalQuantity set.
 */
export async function settleSessionLines(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  outcome: "COMPLETED" | "NO_SHOW",
  createdById: string | null = null
): Promise<void> {
  const items = await tx.appointmentItem.findMany({
    where: { appointmentId, balanceId: { not: null }, finalQuantity: null },
    include: { balance: { select: { creditType: true } } },
  });
  for (const item of items) {
    if (item.balance?.creditType !== CreditType.SESSIONS) continue;
    const { uncovered } = await consumeForLine(
      tx,
      { id: item.id, clinicId: item.clinicId, balanceId: item.balanceId! },
      1,
      {
        heldReservation: true,
        createdById,
        note: outcome === "NO_SHOW" ? "عدم حضور — تُخصم الجلسة" : null,
      }
    );
    await tx.appointmentItem.update({
      where: { id: item.id },
      data: {
        finalQuantity: 1,
        finalTotal: 0,
        ...(uncovered ? { uncoveredQuantity: uncovered } : {}),
      },
    });
  }
}

// ─── Patient packages: staff actions ──────────────────────────────────────────

async function loadOwned(clinicId: string, scope: BranchScope, id: string) {
  const p = await prisma.patientPackage.findFirst({
    where: { id, clinicId },
    include: { balances: true },
  });
  if (!p) return err(OWNED_NOT_FOUND);
  if (scope !== null && !scope.includes(p.branchId)) return err("يمكنك إدارة باقات فروعك فقط");
  return ok(p);
}

export async function confirmPackagePayment(
  clinicId: string,
  scope: BranchScope,
  actorId: string,
  patientPackageId: string
): Promise<Result<void>> {
  const loaded = await loadOwned(clinicId, scope, patientPackageId);
  if (!loaded.ok) return loaded;
  if (loaded.data.paymentStatus === PackagePaymentStatus.PAID) return ok(undefined);
  await prisma.patientPackage.update({
    where: { id: patientPackageId },
    data: {
      paymentStatus: PackagePaymentStatus.PAID,
      paidAt: new Date(),
      paidConfirmedById: actorId,
    },
  });
  return ok(undefined);
}

export async function adjustBalance(
  clinicId: string,
  scope: BranchScope,
  actorId: string,
  input: z.output<typeof adjustBalanceSchema>
): Promise<Result<void>> {
  const bal = await prisma.patientPackageBalance.findUnique({
    where: { id: input.balanceId },
    select: { patientPackageId: true },
  });
  if (!bal) return err(OWNED_NOT_FOUND);
  const loaded = await loadOwned(clinicId, scope, bal.patientPackageId);
  if (!loaded.ok) return loaded;
  const p = loaded.data;
  if (p.status === PatientPackageStatus.CANCELLED || p.status === PatientPackageStatus.EXPIRED)
    return err("لا يمكن تعديل رصيد باقة ملغاة أو منتهية. مدّد صلاحيتها أولاً إن لزم.");
  const b = p.balances.find((x) => x.id === input.balanceId)!;
  if (b.total + input.delta < b.used + b.reserved)
    return err("لا يمكن خصم أكثر من الرصيد المتاح (غير المستخدم وغير المحجوز).");

  await prisma.$transaction(async (tx) => {
    await tx.patientPackageBalance.update({
      where: { id: b.id },
      data: { total: { increment: input.delta } },
    });
    await tx.packageLedger.create({
      data: {
        clinicId,
        balanceId: b.id,
        type: PackageLedgerType.ADJUST,
        quantity: input.delta,
        note: input.note,
        createdById: actorId,
      },
    });
    // Adding credit to a used-up package re-opens it; removing the rest closes it.
    const after = await tx.patientPackageBalance.findMany({
      where: { patientPackageId: p.id },
    });
    const empty = after.every((x) => x.total - x.used <= 0);
    await tx.patientPackage.update({
      where: { id: p.id },
      data: { status: empty ? PatientPackageStatus.USED_UP : PatientPackageStatus.ACTIVE },
    });
  });
  return ok(undefined);
}

/** Move the last valid day (later or earlier). Re-opens an expired package. */
export async function extendPackage(
  clinicId: string,
  scope: BranchScope,
  actorId: string,
  input: z.output<typeof extendPackageSchema>
): Promise<Result<void>> {
  const loaded = await loadOwned(clinicId, scope, input.patientPackageId);
  if (!loaded.ok) return loaded;
  const p = loaded.data;
  if (p.status === PatientPackageStatus.CANCELLED) return err("لا يمكن تمديد باقة ملغاة");
  const today = await clinicToday(clinicId);
  if (input.expiresOn < today) return err("تاريخ الانتهاء الجديد في الماضي");
  const old = dayKey(p.expiresAt);
  const reopen = p.status === PatientPackageStatus.EXPIRED;

  await prisma.$transaction(async (tx) => {
    await tx.patientPackage.update({
      where: { id: p.id },
      data: {
        expiresAt: dayFromKey(input.expiresOn),
        ...(reopen ? { status: PatientPackageStatus.ACTIVE } : {}),
      },
    });
    for (const b of p.balances) {
      // Re-opening an expired package gives back what expiry removed.
      const restored = reopen ? await expiredAmount(tx, b.id) : 0;
      await tx.packageLedger.create({
        data: {
          clinicId,
          balanceId: b.id,
          type: PackageLedgerType.EXTEND,
          quantity: restored,
          note: `${input.note} (من ${old} إلى ${input.expiresOn})`,
          createdById: actorId,
        },
      });
    }
  });
  return ok(undefined);
}

/** What the latest EXPIRE took from a line (to restore on re-opening). */
async function expiredAmount(tx: Prisma.TransactionClient, balanceId: string): Promise<number> {
  const last = await tx.packageLedger.findFirst({
    where: { balanceId, type: PackageLedgerType.EXPIRE },
    orderBy: { createdAt: "desc" },
    select: { quantity: true },
  });
  return last ? -last.quantity : 0;
}

/**
 * Cancel a patient's package (no refund logic here — money is outside the
 * system). Refused while sessions are reserved for upcoming visits.
 */
export async function cancelPatientPackage(
  clinicId: string,
  scope: BranchScope,
  actorId: string,
  input: z.output<typeof cancelPackageSchema>
): Promise<Result<void>> {
  const loaded = await loadOwned(clinicId, scope, input.patientPackageId);
  if (!loaded.ok) return loaded;
  const p = loaded.data;
  if (p.status === PatientPackageStatus.CANCELLED) return ok(undefined);
  if (p.balances.some((b) => b.reserved > 0))
    return err(
      "على هذه الباقة جلسات محجوزة لمواعيد قادمة. ألغِ تلك المواعيد أو غيّر طريقة دفعها أولاً."
    );
  await prisma.$transaction(async (tx) => {
    await tx.patientPackage.update({
      where: { id: p.id },
      data: { status: PatientPackageStatus.CANCELLED },
    });
    for (const b of p.balances) {
      const remaining = Math.max(0, b.total - b.used);
      await tx.packageLedger.create({
        data: {
          clinicId,
          balanceId: b.id,
          type: PackageLedgerType.CANCEL,
          quantity: -remaining,
          note: input.note,
          createdById: actorId,
        },
      });
    }
  });
  return ok(undefined);
}

// ─── Expiry (daily job) ───────────────────────────────────────────────────────

/**
 * Mark ACTIVE packages whose last valid day has passed (on their clinic's
 * clock) as EXPIRED, writing an EXPIRE row for each line's remainder and
 * dropping leftover reservations. Safe to run repeatedly.
 */
export async function expirePackages(now: Date = new Date()): Promise<number> {
  const candidates = await prisma.patientPackage.findMany({
    where: { status: PatientPackageStatus.ACTIVE, expiresAt: { lt: now } },
    include: { balances: true, clinic: { select: { timezone: true } } },
  });
  let count = 0;
  for (const p of candidates) {
    if (todayInZone(p.clinic.timezone, now) <= dayKey(p.expiresAt)) continue;
    await prisma.$transaction(async (tx) => {
      const flipped = await tx.patientPackage.updateMany({
        where: { id: p.id, status: PatientPackageStatus.ACTIVE },
        data: { status: PatientPackageStatus.EXPIRED },
      });
      if (flipped.count === 0) return;
      for (const b of p.balances) {
        const remaining = Math.max(0, b.total - b.used);
        if (b.reserved > 0)
          await tx.patientPackageBalance.update({ where: { id: b.id }, data: { reserved: 0 } });
        if (remaining > 0)
          await tx.packageLedger.create({
            data: {
              clinicId: p.clinicId,
              balanceId: b.id,
              type: PackageLedgerType.EXPIRE,
              quantity: -remaining,
              note: "انتهت صلاحية الباقة",
            },
          });
      }
      count++;
    });
  }
  return count;
}
