import "server-only";
import { Prisma, type OfferType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchScope } from "@/lib/branch-scope";
import {
  applyOffer,
  dayFromKey,
  dayKey,
  offerChangesPrice,
  offerLiveOn,
  offerStatus,
  todayInZone,
  windowsOverlap,
  type OfferStatus,
} from "@/lib/offers";
import type { OfferInput } from "@/lib/validations/catalog";
import { packageScopeFilter, serviceScopeFilter } from "./catalog";
import { ok, err, type Result } from "./_result";

// Offers: many per service / package / category, each with its own dates,
// branches and on/off switch. Two active offers may never cover the same item
// in the same branch on the same day — saving one that would is refused with a
// message naming the clash, so at most one offer ever applies to a line.
// Design: docs/services-and-packages.md §3.5.
//
// Branch scope ("offers" permission): a limited member sees offers that reach
// one of their branches; they edit only offers limited to their branches.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfferView {
  id: string;
  name: string;
  label: string;
  type: OfferType;
  value: number | null;
  buyQty: number | null;
  getQty: number | null;
  rewardValidityDays: number | null;
  /** "YYYY-MM-DD" or null. */
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  status: OfferStatus;
  allBranches: boolean;
  branchIds: string[];
  serviceIds: string[];
  packageIds: string[];
  categoryIds: string[];
  /** Bookings + package purchases that used it — can't be deleted once > 0. */
  usageCount: number;
  editable: boolean;
}

/** A live offer as the pricing code needs it. */
export interface LiveOffer {
  id: string;
  name: string;
  label: string;
  type: OfferType;
  value: number | null;
  buyQty: number | null;
  getQty: number | null;
  rewardValidityDays: number | null;
  endsAt: string | null;
  serviceIds: string[];
  packageIds: string[];
  categoryIds: string[];
}

const OFFER_NOT_FOUND = "العرض غير موجود";
const SCOPE_ONLY = "يمكنك تعديل العروض الخاصة بفروعك فقط";

const offerInclude = {
  branches: { select: { branchId: true } },
  targets: true,
  _count: { select: { appointmentItems: true, patientPackages: true } },
} satisfies Prisma.OfferInclude;

type OfferRow = Prisma.OfferGetPayload<{ include: typeof offerInclude }>;

const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));

function targetsOf(o: { targets: OfferRow["targets"] }) {
  return {
    serviceIds: o.targets.flatMap((t) => (t.serviceId ? [t.serviceId] : [])),
    packageIds: o.targets.flatMap((t) => (t.packageId ? [t.packageId] : [])),
    categoryIds: o.targets.flatMap((t) => (t.categoryId ? [t.categoryId] : [])),
  };
}

function editableBy(o: { allBranches: boolean; branchIds: string[] }, scope: BranchScope) {
  if (scope === null) return true;
  return !o.allBranches && o.branchIds.length > 0 && o.branchIds.every((b) => scope.includes(b));
}

function offerScopeFilter(scope: BranchScope): Prisma.OfferWhereInput {
  if (scope === null) return {};
  return {
    OR: [{ allBranches: true }, { branches: { some: { branchId: { in: [...scope] } } } }],
  };
}

async function clinicToday(clinicId: string): Promise<string> {
  const c = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { timezone: true } });
  return todayInZone(c?.timezone ?? "Africa/Cairo");
}

function toView(o: OfferRow, scope: BranchScope, today: string): OfferView {
  const branchIds = o.branches.map((b) => b.branchId);
  return {
    id: o.id,
    name: o.name,
    label: o.label,
    type: o.type,
    value: num(o.value),
    buyQty: o.buyQty,
    getQty: o.getQty,
    rewardValidityDays: o.rewardValidityDays,
    startsAt: o.startsAt ? dayKey(o.startsAt) : null,
    endsAt: o.endsAt ? dayKey(o.endsAt) : null,
    isActive: o.isActive,
    status: offerStatus(o, today),
    allBranches: o.allBranches,
    branchIds,
    ...targetsOf(o),
    usageCount: o._count.appointmentItems + o._count.patientPackages,
    editable: editableBy({ allBranches: o.allBranches, branchIds }, scope),
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listOffers(clinicId: string, scope: BranchScope): Promise<OfferView[]> {
  const [rows, today] = await Promise.all([
    prisma.offer.findMany({
      where: { clinicId, ...offerScopeFilter(scope) },
      include: offerInclude,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    }),
    clinicToday(clinicId),
  ]);
  return rows.map((o) => toView(o, scope, today));
}

/** The services and packages an offer may target, for the form's pickers. */
export async function listOfferTargetOptions(clinicId: string, scope: BranchScope) {
  const [services, packages] = await Promise.all([
    prisma.service.findMany({
      where: { clinicId, ...serviceScopeFilter(scope) },
      select: { id: true, name: true, categoryId: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.package.findMany({
      where: { clinicId, ...packageScopeFilter(scope) },
      select: { id: true, name: true, categoryId: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return { services, packages };
}

// ─── Overlap ──────────────────────────────────────────────────────────────────

interface Comparable {
  id?: string;
  name: string;
  isActive: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
  allBranches: boolean;
  branchIds: string[];
  serviceIds: string[];
  packageIds: string[];
  categoryIds: string[];
}

/** Item keys an offer reaches: its direct targets + every member of its categories. */
function reach(o: Comparable, members: Map<string, string[]>): Set<string> {
  const keys = new Set<string>();
  o.serviceIds.forEach((id) => keys.add(`s:${id}`));
  o.packageIds.forEach((id) => keys.add(`p:${id}`));
  for (const c of o.categoryIds) {
    keys.add(`c:${c}`);
    (members.get(c) ?? []).forEach((k) => keys.add(k));
  }
  return keys;
}

function branchesOverlap(a: Comparable, b: Comparable): boolean {
  return a.allBranches || b.allBranches || a.branchIds.some((id) => b.branchIds.includes(id));
}

/** The first active offer that would clash with `candidate`, or null. */
async function findClash(clinicId: string, candidate: Comparable): Promise<Comparable | null> {
  if (!candidate.isActive) return null;
  const [others, services, packages] = await Promise.all([
    prisma.offer.findMany({
      where: { clinicId, isActive: true, ...(candidate.id ? { id: { not: candidate.id } } : {}) },
      include: { branches: { select: { branchId: true } }, targets: true },
    }),
    prisma.service.findMany({ where: { clinicId }, select: { id: true, categoryId: true } }),
    prisma.package.findMany({ where: { clinicId }, select: { id: true, categoryId: true } }),
  ]);
  const members = new Map<string, string[]>();
  for (const s of services)
    members.set(s.categoryId, [...(members.get(s.categoryId) ?? []), `s:${s.id}`]);
  for (const p of packages)
    members.set(p.categoryId, [...(members.get(p.categoryId) ?? []), `p:${p.id}`]);

  const mine = reach(candidate, members);
  for (const o of others) {
    const other: Comparable = {
      id: o.id,
      name: o.name,
      isActive: o.isActive,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      allBranches: o.allBranches,
      branchIds: o.branches.map((b) => b.branchId),
      ...targetsOf(o),
    };
    if (!windowsOverlap(candidate, other) || !branchesOverlap(candidate, other)) continue;
    const theirs = reach(other, members);
    if ([...mine].some((k) => theirs.has(k))) return other;
  }
  return null;
}

function clashMessage(o: Comparable): string {
  const from = o.startsAt ? dayKey(o.startsAt).split("-").reverse().slice(0, 2).join("/") : null;
  const to = o.endsAt ? dayKey(o.endsAt).split("-").reverse().slice(0, 2).join("/") : null;
  const when =
    from && to
      ? ` من ${from} إلى ${to}`
      : from
        ? ` بدءاً من ${from}`
        : to
          ? ` حتى ${to}`
          : " بدون تاريخ انتهاء";
  return `يوجد عرض فعّال «${o.name}» على نفس الخدمة أو الباقة${when} في نفس الفرع. لا يمكن تطبيق عرضين في الوقت نفسه — عدّل التواريخ أو أوقف أحدهما.`;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** The input's branches and targets belong to this clinic and the caller's scope. */
async function validateRefs(
  clinicId: string,
  scope: BranchScope,
  input: OfferInput
): Promise<string | null> {
  if (scope !== null) {
    if (input.allBranches) return "اختر الفروع التي يُطبَّق فيها العرض من فروعك";
    if (input.branchIds.length === 0) return "اختر فرعاً واحداً على الأقل";
    if (input.branchIds.some((b) => !scope.includes(b)))
      return "لا يمكنك إضافة عرض لفرع خارج فروعك";
  } else if (!input.allBranches && input.branchIds.length === 0) {
    return "اختر فرعاً واحداً على الأقل";
  }
  const { serviceIds, packageIds, categoryIds } = input.targets;
  const [branches, services, packages, categories] = await Promise.all([
    input.branchIds.length
      ? prisma.branch.count({ where: { clinicId, id: { in: input.branchIds } } })
      : 0,
    serviceIds.length
      ? prisma.service.count({
          where: { clinicId, id: { in: serviceIds }, ...serviceScopeFilter(scope) },
        })
      : 0,
    packageIds.length
      ? prisma.package.count({
          where: { clinicId, id: { in: packageIds }, ...packageScopeFilter(scope) },
        })
      : 0,
    categoryIds.length
      ? prisma.category.count({ where: { clinicId, id: { in: categoryIds } } })
      : 0,
  ]);
  if (branches !== input.branchIds.length) return "أحد الفروع غير موجود";
  if (services !== serviceIds.length) return "إحدى الخدمات غير موجودة";
  if (packages !== packageIds.length) return "إحدى الباقات غير موجودة";
  if (categories !== categoryIds.length) return "أحد التصنيفات غير موجود";
  return null;
}

function rowData(input: OfferInput) {
  return {
    name: input.name,
    label: input.label,
    type: input.type,
    value: input.value,
    buyQty: input.buyQty,
    getQty: input.getQty,
    rewardValidityDays: input.rewardValidityDays,
    startsAt: input.startsAt ? dayFromKey(input.startsAt) : null,
    endsAt: input.endsAt ? dayFromKey(input.endsAt) : null,
    isActive: input.isActive,
    allBranches: input.allBranches,
  };
}

function targetRows(input: OfferInput) {
  return [
    ...input.targets.serviceIds.map((serviceId) => ({ serviceId })),
    ...input.targets.packageIds.map((packageId) => ({ packageId })),
    ...input.targets.categoryIds.map((categoryId) => ({ categoryId })),
  ];
}

const asComparable = (input: OfferInput, id?: string): Comparable => ({
  id,
  name: input.name,
  isActive: input.isActive,
  startsAt: input.startsAt ? dayFromKey(input.startsAt) : null,
  endsAt: input.endsAt ? dayFromKey(input.endsAt) : null,
  allBranches: input.allBranches,
  branchIds: input.branchIds,
  ...input.targets,
});

export async function createOffer(
  clinicId: string,
  scope: BranchScope,
  createdById: string | null,
  input: OfferInput
): Promise<Result<{ id: string }>> {
  const refError = await validateRefs(clinicId, scope, input);
  if (refError) return err(refError);
  const clash = await findClash(clinicId, asComparable(input));
  if (clash) return err(clashMessage(clash));

  const o = await prisma.offer.create({
    data: {
      clinicId,
      createdById,
      ...rowData(input),
      branches: { create: input.branchIds.map((branchId) => ({ branchId })) },
      targets: { create: targetRows(input) },
    },
  });
  return ok({ id: o.id });
}

async function loadEditable(
  offerId: string,
  clinicId: string,
  scope: BranchScope
): Promise<Result<OfferRow>> {
  const o = await prisma.offer.findFirst({
    where: { id: offerId, clinicId, ...offerScopeFilter(scope) },
    include: offerInclude,
  });
  if (!o) return err(OFFER_NOT_FOUND);
  const branchIds = o.branches.map((b) => b.branchId);
  if (!editableBy({ allBranches: o.allBranches, branchIds }, scope)) return err(SCOPE_ONLY);
  return ok(o);
}

/**
 * Edit an offer. Past bookings and purchases keep their own snapshot (offerId +
 * discount), so editing never rewrites history — but the type of an offer that
 * was already used can't change, or those snapshots would stop making sense.
 */
export async function updateOffer(
  clinicId: string,
  scope: BranchScope,
  offerId: string,
  input: OfferInput
): Promise<Result<void>> {
  const loaded = await loadEditable(offerId, clinicId, scope);
  if (!loaded.ok) return loaded;
  const used = loaded.data._count.appointmentItems + loaded.data._count.patientPackages > 0;
  if (used && loaded.data.type !== input.type)
    return err("لا يمكن تغيير نوع عرض مستخدم في حجوزات سابقة. أنشئ عرضاً جديداً بدلاً منه.");

  const refError = await validateRefs(clinicId, scope, input);
  if (refError) return err(refError);
  const clash = await findClash(clinicId, asComparable(input, offerId));
  if (clash) return err(clashMessage(clash));

  await prisma.$transaction([
    prisma.offer.update({ where: { id: offerId }, data: rowData(input) }),
    prisma.offerBranch.deleteMany({ where: { offerId } }),
    prisma.offerBranch.createMany({
      data: input.branchIds.map((branchId) => ({ offerId, branchId })),
    }),
    prisma.offerTarget.deleteMany({ where: { offerId } }),
    prisma.offerTarget.createMany({ data: targetRows(input).map((t) => ({ offerId, ...t })) }),
  ]);
  return ok(undefined);
}

/** Pause / resume. Resuming runs the same clash check as saving. */
export async function setOfferActive(
  clinicId: string,
  scope: BranchScope,
  offerId: string,
  isActive: boolean
): Promise<Result<void>> {
  const loaded = await loadEditable(offerId, clinicId, scope);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  if (isActive) {
    const clash = await findClash(clinicId, {
      id: o.id,
      name: o.name,
      isActive: true,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      allBranches: o.allBranches,
      branchIds: o.branches.map((b) => b.branchId),
      ...targetsOf(o),
    });
    if (clash) return err(clashMessage(clash));
  }
  await prisma.offer.update({ where: { id: offerId }, data: { isActive } });
  return ok(undefined);
}

/** A paused copy (" (نسخة)") — e.g. last year's campaign with new dates. */
export async function duplicateOffer(
  clinicId: string,
  scope: BranchScope,
  createdById: string | null,
  offerId: string
): Promise<Result<{ id: string }>> {
  const loaded = await loadEditable(offerId, clinicId, scope);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  const copy = await prisma.offer.create({
    data: {
      clinicId,
      createdById,
      name: `${o.name} (نسخة)`,
      label: o.label,
      type: o.type,
      value: o.value,
      buyQty: o.buyQty,
      getQty: o.getQty,
      rewardValidityDays: o.rewardValidityDays,
      startsAt: o.startsAt,
      endsAt: o.endsAt,
      isActive: false,
      allBranches: o.allBranches,
      branches: { create: o.branches.map((b) => ({ branchId: b.branchId })) },
      targets: {
        create: o.targets.map((t) => ({
          serviceId: t.serviceId,
          packageId: t.packageId,
          categoryId: t.categoryId,
        })),
      },
    },
  });
  return ok({ id: copy.id });
}

/** Delete an offer that was never used; a used one can only be paused. */
export async function deleteOffer(
  clinicId: string,
  scope: BranchScope,
  offerId: string
): Promise<Result<void>> {
  const loaded = await loadEditable(offerId, clinicId, scope);
  if (!loaded.ok) return loaded;
  const o = loaded.data;
  if (o._count.appointmentItems + o._count.patientPackages > 0)
    return err(
      "هذا العرض مستخدم في حجوزات أو مشتريات سابقة ولا يمكن حذفه. يمكنك إيقافه بدلاً من ذلك."
    );
  await prisma.offer.delete({ where: { id: offerId } });
  return ok(undefined);
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

/**
 * Every offer live in `branchId` on `day` ("YYYY-MM-DD" clinic day). Load once
 * per request, then resolve items with `offerForItem`.
 */
export async function loadLiveOffers(
  clinicId: string,
  branchId: string | null,
  day?: string
): Promise<LiveOffer[]> {
  const on = day ?? (await clinicToday(clinicId));
  const rows = await prisma.offer.findMany({
    where: {
      clinicId,
      isActive: true,
      ...(branchId
        ? { OR: [{ allBranches: true }, { branches: { some: { branchId } } }] }
        : { allBranches: true }),
    },
    include: { targets: true },
  });
  return rows
    .filter((o) => offerLiveOn(o, on))
    .map((o) => ({
      id: o.id,
      name: o.name,
      label: o.label,
      type: o.type,
      value: num(o.value),
      buyQty: o.buyQty,
      getQty: o.getQty,
      rewardValidityDays: o.rewardValidityDays,
      endsAt: o.endsAt ? dayKey(o.endsAt) : null,
      ...targetsOf(o),
    }));
}

/**
 * The offer that applies to an item, with the resulting price. Overlaps are
 * refused at save time, so there is normally at most one candidate; if data
 * ever ends up with two (e.g. a service moved into an offered category), the
 * one cheapest for the patient wins, deterministically.
 */
export function offerForItem(
  offers: readonly LiveOffer[],
  item: { serviceId?: string; packageId?: string; categoryId: string },
  basePrice: number | null
): { offer: LiveOffer; price: number | null; discount: number } | null {
  const matches = offers.filter(
    (o) =>
      (item.serviceId && o.serviceIds.includes(item.serviceId)) ||
      (item.packageId && o.packageIds.includes(item.packageId)) ||
      o.categoryIds.includes(item.categoryId)
  );
  const applicable = matches.filter((o) =>
    item.serviceId ? o.type !== "BONUS_UNITS" : o.type !== "BUY_X_GET_Y"
  );
  let best: { offer: LiveOffer; price: number | null; discount: number } | null = null;
  for (const offer of applicable) {
    const r = applyOffer(offer, basePrice);
    if (
      !best ||
      r.discount > best.discount ||
      (r.discount === best.discount && offer.id < best.offer.id)
    )
      best = { offer, ...r };
  }
  // A non-price offer (buy-x-get-y / bonus units) is still "the offer" for the item.
  if (best && !offerChangesPrice(best.offer.type))
    return { ...best, price: basePrice, discount: 0 };
  return best;
}
