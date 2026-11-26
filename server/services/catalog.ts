import "server-only";
import { Prisma, type PricingType, type ServiceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { doctorBranchFilter, type BranchScope } from "@/lib/branch-scope";
import type { DoctorServicesInput, ServiceInput } from "@/lib/validations/catalog";
import { ok, err, type Result } from "./_result";

// The service catalog: categories and services, with which branches offer a
// service and which practitioners provide it. Design and rules:
// docs/services-and-packages.md (§3.1–3.3, §4).
//
// Branch scope (staff limited to some branches) follows the doctor model in
// branchScope.ts: a service is *visible* when it is offered in one of the
// member's branches; they get *full* control only when it is offered in their
// branches alone, otherwise *partial* — their own branches' rows and their own
// practitioners, never the service itself.

// ─── Types ────────────────────────────────────────────────────────────────────

export type ServiceAccess = "full" | "partial";

export interface CategoryView {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  serviceCount: number;
  packageCount: number;
}

export interface ServiceView {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  prepInstructions: string | null;
  agentNotes: string | null;
  kind: ServiceKind;
  pricingType: PricingType;
  price: number | null;
  unitLabel: string | null;
  durationMin: number | null;
  bookable: boolean;
  isActive: boolean;
  allBranches: boolean;
  sortOrder: number;
  operationChecklist: string[];
  postOpInstructions: string | null;
  branches: { branchId: string; price: number | null }[];
  tiers: { minQty: number; maxQty: number | null; price: number }[];
  doctors: { doctorId: string; price: number | null; durationMin: number | null }[];
  /** Booked at least once — can be deactivated but not deleted. */
  used: boolean;
  /** What the caller may do with it (see the header comment). */
  access: ServiceAccess;
}

export interface PractitionerOption {
  id: string;
  fullName: string;
  title: string | null;
  isActive: boolean;
  branchIds: string[];
}

const SERVICE_NOT_FOUND = "الخدمة غير موجودة";
const CATEGORY_NOT_FOUND = "التصنيف غير موجود";
const NO_BRANCH = "اختر فرعاً واحداً على الأقل تُقدَّم فيه الخدمة";
const FULL_SCOPE_ONLY = "هذا الإجراء متاح فقط لمن يدير كل فروع الخدمة";

const dec = (v: Prisma.Decimal | null): number | null => (v == null ? null : Number(v));

// ─── Scope helpers ────────────────────────────────────────────────────────────

/** Prisma WHERE fragment: services offered in at least one of the scope's branches. */
export function serviceScopeFilter(scope: BranchScope): Prisma.ServiceWhereInput {
  if (scope === null) return {};
  return {
    OR: [{ allBranches: true }, { branches: { some: { branchId: { in: [...scope] } } } }],
  };
}

/** Prisma WHERE fragment: packages sold in at least one of the scope's branches. */
export function packageScopeFilter(scope: BranchScope): Prisma.PackageWhereInput {
  if (scope === null) return {};
  return {
    OR: [{ allBranches: true }, { branches: { some: { branchId: { in: [...scope] } } } }],
  };
}

function accessFor(
  service: { allBranches: boolean; branches: { branchId: string }[] },
  scope: BranchScope
): ServiceAccess {
  if (scope === null) return "full";
  if (service.allBranches) return "partial";
  return service.branches.every((b) => scope.includes(b.branchId)) ? "full" : "partial";
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listCategories(clinicId: string): Promise<CategoryView[]> {
  const rows = await prisma.category.findMany({
    where: { clinicId },
    include: { _count: { select: { services: true, packages: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    serviceCount: c._count.services,
    packageCount: c._count.packages,
  }));
}

async function categoryNameTaken(clinicId: string, name: string, exceptId?: string) {
  const clash = await prisma.category.findFirst({
    where: { clinicId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return !!clash && clash.id !== exceptId;
}

export async function createCategory(
  clinicId: string,
  rawName: string
): Promise<Result<{ id: string }>> {
  const name = rawName.trim();
  if (!name) return err("أدخل اسم التصنيف.");
  if (await categoryNameTaken(clinicId, name)) return err("هذا التصنيف موجود بالفعل.");
  try {
    const last = await prisma.category.aggregate({
      where: { clinicId },
      _max: { sortOrder: true },
    });
    const c = await prisma.category.create({
      data: { clinicId, name, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return ok({ id: c.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return err("هذا التصنيف موجود بالفعل.");
    throw e;
  }
}

export async function updateCategory(
  clinicId: string,
  categoryId: string,
  patch: { name?: string; isActive?: boolean }
): Promise<Result<void>> {
  const existing = await prisma.category.findFirst({ where: { id: categoryId, clinicId } });
  if (!existing) return err(CATEGORY_NOT_FOUND);
  const data: Prisma.CategoryUpdateInput = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return err("أدخل اسم التصنيف.");
    if (await categoryNameTaken(clinicId, name, categoryId))
      return err("هذا التصنيف موجود بالفعل.");
    data.name = name;
  }
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  await prisma.category.update({ where: { id: categoryId }, data });
  return ok(undefined);
}

/** Persist a new order: `orderedIds` is every category id, first to last. */
export async function reorderCategories(
  clinicId: string,
  orderedIds: string[]
): Promise<Result<void>> {
  const owned = await prisma.category.findMany({ where: { clinicId }, select: { id: true } });
  const ownedIds = new Set(owned.map((c) => c.id));
  const ids = orderedIds.filter((id) => ownedIds.has(id));
  await prisma.$transaction(
    ids.map((id, i) => prisma.category.update({ where: { id }, data: { sortOrder: i } }))
  );
  return ok(undefined);
}

/** A category in use can't be deleted — deactivate it, or empty it first. */
export async function deleteCategory(clinicId: string, categoryId: string): Promise<Result<void>> {
  const c = await prisma.category.findFirst({
    where: { id: categoryId, clinicId },
    include: { _count: { select: { services: true, packages: true, packageItems: true } } },
  });
  if (!c) return err(CATEGORY_NOT_FOUND);
  if (c._count.services + c._count.packages + c._count.packageItems > 0)
    return err("لا يمكن حذف تصنيف مستخدم. انقل خدماته وباقاته أولاً أو عطّله بدلاً من حذفه.");
  await prisma.category.delete({ where: { id: categoryId } });
  return ok(undefined);
}

// ─── Services: queries ────────────────────────────────────────────────────────

const serviceInclude = {
  branches: true,
  tiers: { orderBy: { minQty: "asc" } },
  doctors: true,
  _count: { select: { appointmentItems: true } },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof serviceInclude }>;

function toView(s: ServiceRow, scope: BranchScope): ServiceView {
  return {
    id: s.id,
    categoryId: s.categoryId,
    name: s.name,
    description: s.description,
    prepInstructions: s.prepInstructions,
    agentNotes: s.agentNotes,
    kind: s.kind,
    pricingType: s.pricingType,
    price: dec(s.price),
    unitLabel: s.unitLabel,
    durationMin: s.durationMin,
    bookable: s.bookable,
    isActive: s.isActive,
    allBranches: s.allBranches,
    sortOrder: s.sortOrder,
    operationChecklist: s.operationChecklist,
    postOpInstructions: s.postOpInstructions,
    branches: s.branches.map((b) => ({ branchId: b.branchId, price: dec(b.price) })),
    tiers: s.tiers.map((t) => ({ minQty: t.minQty, maxQty: t.maxQty, price: Number(t.price) })),
    doctors: s.doctors.map((d) => ({
      doctorId: d.doctorId,
      price: dec(d.price),
      durationMin: d.durationMin,
    })),
    used: s._count.appointmentItems > 0,
    access: accessFor(s, scope),
  };
}

/** Every service the scope can see (admin catalog — includes inactive ones). */
export async function listServices(clinicId: string, scope: BranchScope): Promise<ServiceView[]> {
  const rows = await prisma.service.findMany({
    where: { clinicId, ...serviceScopeFilter(scope) },
    include: serviceInclude,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((s) => toView(s, scope));
}

async function loadService(serviceId: string, clinicId: string, scope: BranchScope) {
  return prisma.service.findFirst({
    where: { id: serviceId, clinicId, ...serviceScopeFilter(scope) },
    include: serviceInclude,
  });
}

/** Practitioners the scope can assign to services. */
export async function listPractitionerOptions(
  clinicId: string,
  scope: BranchScope
): Promise<PractitionerOption[]> {
  const rows = await prisma.doctor.findMany({
    where: { clinicId, ...doctorBranchFilter(scope) },
    select: {
      id: true,
      fullName: true,
      title: true,
      isActive: true,
      branches: { select: { branchId: true } },
    },
    orderBy: { fullName: "asc" },
  });
  return rows.map((d) => ({
    id: d.id,
    fullName: d.fullName,
    title: d.title,
    isActive: d.isActive,
    branchIds: d.branches.map((b) => b.branchId),
  }));
}

// ─── Services: mutations ──────────────────────────────────────────────────────

async function serviceNameTaken(clinicId: string, name: string, exceptId?: string) {
  const clash = await prisma.service.findFirst({
    where: { clinicId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  return !!clash && clash.id !== exceptId;
}

/** Checks the ids in an input belong to this clinic (and the caller's scope). */
async function validateRefs(
  clinicId: string,
  scope: BranchScope,
  input: Pick<ServiceInput, "categoryId" | "branches" | "doctors">
): Promise<string | null> {
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, clinicId },
    select: { id: true },
  });
  if (!category) return CATEGORY_NOT_FOUND;

  const branchIds = input.branches.map((b) => b.branchId);
  if (branchIds.length) {
    const found = await prisma.branch.count({ where: { clinicId, id: { in: branchIds } } });
    if (found !== branchIds.length) return "أحد الفروع غير موجود";
  }
  const doctorIds = input.doctors.map((d) => d.doctorId);
  if (doctorIds.length) {
    const found = await prisma.doctor.count({
      where: { clinicId, id: { in: doctorIds }, ...doctorBranchFilter(scope) },
    });
    if (found !== doctorIds.length) return "أحد مقدمي الخدمة غير موجود";
  }
  return null;
}

const coreData = (input: ServiceInput) => ({
  categoryId: input.categoryId,
  name: input.name,
  description: input.description,
  prepInstructions: input.prepInstructions,
  agentNotes: input.agentNotes,
  kind: input.kind,
  pricingType: input.pricingType,
  price: input.price,
  unitLabel: input.unitLabel,
  durationMin: input.durationMin,
  bookable: input.kind === "OPERATION" ? false : input.bookable,
  operationChecklist: input.operationChecklist,
  postOpInstructions: input.postOpInstructions,
});

export async function createService(
  clinicId: string,
  scope: BranchScope,
  input: ServiceInput
): Promise<Result<{ id: string }>> {
  // A branch-limited member creates services for their own branches only —
  // an all-branches service would reach branches they don't manage.
  if (scope !== null) {
    if (input.allBranches) return err("اختر الفروع التي تُقدَّم فيها الخدمة من فروعك");
    if (input.branches.some((b) => !scope.includes(b.branchId)))
      return err("لا يمكنك إضافة الخدمة لفرع خارج فروعك");
  }
  if (!input.allBranches && input.branches.length === 0) return err(NO_BRANCH);
  const refError = await validateRefs(clinicId, scope, input);
  if (refError) return err(refError);
  if (await serviceNameTaken(clinicId, input.name)) return err("توجد خدمة بهذا الاسم بالفعل.");

  try {
    const last = await prisma.service.aggregate({ where: { clinicId }, _max: { sortOrder: true } });
    const s = await prisma.service.create({
      data: {
        clinicId,
        ...coreData(input),
        allBranches: input.allBranches,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        branches: { create: input.branches },
        tiers: { create: input.tiers },
        doctors: { create: input.doctors },
      },
    });
    return ok({ id: s.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return err("توجد خدمة بهذا الاسم بالفعل.");
    throw e;
  }
}

export async function updateService(
  clinicId: string,
  scope: BranchScope,
  serviceId: string,
  input: ServiceInput
): Promise<Result<void>> {
  const existing = await loadService(serviceId, clinicId, scope);
  if (!existing) return err(SERVICE_NOT_FOUND);
  const access = accessFor(existing, scope);

  const refError = await validateRefs(clinicId, scope, input);
  if (refError) return err(refError);

  // Practitioners: the caller replaces the assignments of the practitioners
  // they can see; those of practitioners outside their scope are kept.
  const visibleDoctorIds =
    scope === null
      ? null
      : (
          await prisma.doctor.findMany({
            where: { clinicId, ...doctorBranchFilter(scope) },
            select: { id: true },
          })
        ).map((d) => d.id);
  const doctorDelete: Prisma.DoctorServiceWhereInput = {
    serviceId,
    ...(visibleDoctorIds ? { doctorId: { in: visibleDoctorIds } } : {}),
  };

  if (access === "partial") {
    // Only the caller's own branches' rows change; the service itself and every
    // other branch stay exactly as they are.
    const mine = scope as readonly string[];
    const rows = input.branches.filter((b) => mine.includes(b.branchId));
    await prisma.$transaction([
      prisma.serviceBranch.deleteMany({ where: { serviceId, branchId: { in: [...mine] } } }),
      prisma.serviceBranch.createMany({
        // All-branches: a row is only a price override, so one without a price
        // is dropped. Specific branches: a row is what makes the branch offer it.
        data: rows
          .filter((b) => !existing.allBranches || b.price != null)
          .map((b) => ({ serviceId, branchId: b.branchId, price: b.price })),
      }),
      prisma.doctorService.deleteMany({ where: doctorDelete }),
      prisma.doctorService.createMany({
        data: input.doctors.map((d) => ({ serviceId, ...d })),
      }),
    ]);
    return ok(undefined);
  }

  // Full access. A branch-limited member still can't widen the service past
  // their own branches.
  if (scope !== null) {
    if (input.allBranches) return err("اختر الفروع التي تُقدَّم فيها الخدمة من فروعك");
    if (input.branches.some((b) => !scope.includes(b.branchId)))
      return err("لا يمكنك إضافة الخدمة لفرع خارج فروعك");
  }
  if (!input.allBranches && input.branches.length === 0) return err(NO_BRANCH);
  if (await serviceNameTaken(clinicId, input.name, serviceId))
    return err("توجد خدمة بهذا الاسم بالفعل.");

  try {
    await prisma.$transaction([
      prisma.service.update({
        where: { id: serviceId },
        data: { ...coreData(input), allBranches: input.allBranches },
      }),
      prisma.serviceBranch.deleteMany({ where: { serviceId } }),
      prisma.serviceBranch.createMany({
        data: input.branches.map((b) => ({ serviceId, ...b })),
      }),
      prisma.servicePriceTier.deleteMany({ where: { serviceId } }),
      prisma.servicePriceTier.createMany({
        data: input.tiers.map((t) => ({ serviceId, ...t })),
      }),
      prisma.doctorService.deleteMany({ where: doctorDelete }),
      prisma.doctorService.createMany({
        data: input.doctors.map((d) => ({ serviceId, ...d })),
      }),
    ]);
    return ok(undefined);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      return err("توجد خدمة بهذا الاسم بالفعل.");
    throw e;
  }
}

/** Activate / deactivate — clinic-wide, so it needs full access. */
export async function setServiceActive(
  clinicId: string,
  scope: BranchScope,
  serviceId: string,
  isActive: boolean
): Promise<Result<void>> {
  const existing = await loadService(serviceId, clinicId, scope);
  if (!existing) return err(SERVICE_NOT_FOUND);
  if (accessFor(existing, scope) !== "full") return err(FULL_SCOPE_ONLY);
  await prisma.service.update({ where: { id: serviceId }, data: { isActive } });
  return ok(undefined);
}

/** Delete a service that was never booked; a booked one is deactivated instead. */
export async function deleteService(
  clinicId: string,
  scope: BranchScope,
  serviceId: string
): Promise<Result<void>> {
  const existing = await loadService(serviceId, clinicId, scope);
  if (!existing) return err(SERVICE_NOT_FOUND);
  if (accessFor(existing, scope) !== "full") return err(FULL_SCOPE_ONLY);
  if (existing._count.appointmentItems > 0)
    return err("هذه الخدمة مستخدمة في حجوزات سابقة ولا يمكن حذفها. يمكنك تعطيلها بدلاً من ذلك.");
  await prisma.service.delete({ where: { id: serviceId } });
  return ok(undefined);
}

// ─── A practitioner's services (doctor-side editor) ───────────────────────────

export interface DoctorServiceView {
  serviceId: string;
  price: number | null;
  durationMin: number | null;
}

export async function listDoctorServices(doctorId: string): Promise<DoctorServiceView[]> {
  const rows = await prisma.doctorService.findMany({ where: { doctorId } });
  return rows.map((r) => ({
    serviceId: r.serviceId,
    price: dec(r.price),
    durationMin: r.durationMin,
  }));
}

/**
 * Replace what a practitioner provides. The caller sets the assignments for the
 * services they can see; assignments to services outside their scope are kept.
 * The caller must already have been checked against the doctor (doctorInScope).
 */
export async function setDoctorServices(
  clinicId: string,
  scope: BranchScope,
  doctorId: string,
  input: DoctorServicesInput
): Promise<Result<void>> {
  const visible = await prisma.service.findMany({
    where: { clinicId, ...serviceScopeFilter(scope) },
    select: { id: true },
  });
  const visibleIds = new Set(visible.map((s) => s.id));
  if (input.some((s) => !visibleIds.has(s.serviceId))) return err(SERVICE_NOT_FOUND);

  await prisma.$transaction([
    prisma.doctorService.deleteMany({
      where: { doctorId, serviceId: { in: [...visibleIds] } },
    }),
    prisma.doctorService.createMany({ data: input.map((s) => ({ doctorId, ...s })) }),
  ]);
  return ok(undefined);
}

/** The practitioner's active services as {id, name} options (rule restriction picker). */
export async function listDoctorServiceOptions(
  doctorId: string
): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.doctorService.findMany({
    where: { doctorId, service: { isActive: true } },
    select: { service: { select: { id: true, name: true, sortOrder: true } } },
    orderBy: { service: { sortOrder: "asc" } },
  });
  return rows.map((r) => ({ id: r.service.id, name: r.service.name }));
}

// ─── Public catalog (agent, landing page, booking UIs) ────────────────────────

export interface PublicOffer {
  id: string;
  label: string;
  type: string;
  /** Price after the offer (unit price for PER_UNIT); null for non-price offers. */
  price: number | null;
  /** Last day, "YYYY-MM-DD", or null when open-ended. */
  endsAt: string | null;
}

export interface PublicService {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  kind: ServiceKind;
  pricingType: PricingType;
  unitLabel: string | null;
  description: string | null;
  prepInstructions: string | null;
  /** AI-only instructions — never send to a patient-facing page. */
  agentNotes: string | null;
  durationMin: number | null;
  bookable: boolean;
  /** Price for the asked branch (or the base price when no branch was given). */
  price: number | null;
  offer: PublicOffer | null;
  tiers: { minQty: number; maxQty: number | null; price: number }[];
  /** Where it is offered, each with its own price. */
  branches: { id: string; name: string; price: number | null }[];
  providerCount: number;
}

/**
 * Active services as patients see them: only those offered in `branchId` when
 * given, priced for that branch, with the offer live there today.
 */
export async function listPublicServices(
  clinicId: string,
  filter: {
    query?: string | null;
    categoryId?: string | null;
    branchId?: string | null;
    ids?: string[];
  } = {}
): Promise<PublicService[]> {
  const q = filter.query?.trim();
  const [rows, branches] = await Promise.all([
    prisma.service.findMany({
      where: {
        clinicId,
        isActive: true,
        category: { isActive: true },
        ...(filter.ids ? { id: { in: filter.ids } } : {}),
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        // Two independent OR groups (text match, branch availability) — kept in
        // AND so one never overwrites the other.
        AND: [
          q
            ? {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                  { category: { name: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {},
          filter.branchId
            ? { OR: [{ allBranches: true }, { branches: { some: { branchId: filter.branchId } } }] }
            : {},
        ],
      },
      include: {
        category: { select: { name: true, sortOrder: true } },
        branches: true,
        tiers: { orderBy: { minQty: "asc" } },
        _count: { select: { doctors: { where: { doctor: { isActive: true } } } } },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.branch.findMany({
      where: { clinicId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ isMain: "desc" }, { name: "asc" }],
    }),
  ]);
  const { loadLiveOffers, offerForItem } = await import("./offers");
  const offers = await loadLiveOffers(clinicId, filter.branchId ?? null);

  return rows.map((s) => {
    const branchRow = filter.branchId
      ? s.branches.find((b) => b.branchId === filter.branchId)
      : null;
    const price = dec(branchRow?.price ?? null) ?? dec(s.price);
    const tiers = s.tiers.map((t) => ({
      minQty: t.minQty,
      maxQty: t.maxQty,
      price: Number(t.price),
    }));
    const match = offerForItem(offers, { serviceId: s.id, categoryId: s.categoryId }, price);
    const offered = s.allBranches
      ? branches
      : branches.filter((b) => s.branches.some((r) => r.branchId === b.id));
    return {
      id: s.id,
      name: s.name,
      categoryId: s.categoryId,
      categoryName: s.category.name,
      kind: s.kind,
      pricingType: s.pricingType,
      unitLabel: s.unitLabel,
      description: s.description,
      prepInstructions: s.prepInstructions,
      agentNotes: s.agentNotes,
      durationMin: s.durationMin,
      bookable: s.bookable,
      price,
      offer: match
        ? {
            id: match.offer.id,
            label: match.offer.label,
            type: match.offer.type,
            price: match.offer.type === "BUY_X_GET_Y" ? null : match.price,
            endsAt: match.offer.endsAt,
          }
        : null,
      tiers,
      branches: offered.map((b) => ({
        id: b.id,
        name: b.name,
        price: dec(s.branches.find((r) => r.branchId === b.id)?.price ?? null) ?? dec(s.price),
      })),
      providerCount: s._count.doctors,
    };
  });
}

/** Practitioners who provide a service (optionally working in a branch that offers it). */
export async function listServiceProviders(
  clinicId: string,
  serviceId: string,
  branchId?: string | null
) {
  const service = await prisma.service.findFirst({
    where: { id: serviceId, clinicId, isActive: true },
    include: { branches: true },
  });
  if (!service) return null;
  const offeredIn = (id: string) =>
    service.allBranches || service.branches.some((b) => b.branchId === id);
  const rows = await prisma.doctorService.findMany({
    where: {
      serviceId,
      doctor: {
        isActive: true,
        ...(branchId ? { branches: { some: { branchId } } } : {}),
      },
    },
    include: {
      doctor: {
        select: {
          id: true,
          fullName: true,
          title: true,
          sex: true,
          specialty: { select: { name: true } },
          branches: { select: { branch: { select: { id: true, name: true, isActive: true } } } },
        },
      },
    },
    orderBy: { doctor: { fullName: "asc" } },
  });
  return rows
    .map((r) => {
      const branches = r.doctor.branches
        .map((b) => b.branch)
        .filter((b) => b.isActive && offeredIn(b.id));
      return {
        doctorId: r.doctor.id,
        fullName: r.doctor.fullName,
        title: r.doctor.title,
        sex: r.doctor.sex,
        specialty: r.doctor.specialty?.name ?? null,
        /** Practitioner's own price for this service, if it overrides the service's. */
        priceOverride: dec(r.price),
        durationMin: r.durationMin ?? service.durationMin,
        branches: branches.map((b) => ({ id: b.id, name: b.name })),
      };
    })
    .filter((p) => p.branches.length > 0);
}

/** Each practitioner's active service names (doctor lists). */
export async function serviceNamesByDoctor(doctorIds: string[]): Promise<Map<string, string[]>> {
  const rows = await prisma.doctorService.findMany({
    where: { doctorId: { in: doctorIds }, service: { isActive: true } },
    select: { doctorId: true, service: { select: { name: true, sortOrder: true } } },
    orderBy: { service: { sortOrder: "asc" } },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) map.set(r.doctorId, [...(map.get(r.doctorId) ?? []), r.service.name]);
  return map;
}

// ─── Clinic-type templates ────────────────────────────────────────────────────

/**
 * Create a template's categories and services that don't exist yet (by name,
 * case-insensitive). Services are created inactive and unpriced.
 */
export async function applyCatalogTemplate(
  clinicId: string,
  key: string
): Promise<Result<{ categories: number; services: number; skipped: number }>> {
  const { CATALOG_TEMPLATES } = await import("@/lib/catalog-templates");
  const template = CATALOG_TEMPLATES.find((t) => t.key === key);
  if (!template) return err("القالب غير موجود");

  const [existingCats, existingServices, lastCat, lastSvc] = await Promise.all([
    prisma.category.findMany({ where: { clinicId }, select: { id: true, name: true } }),
    prisma.service.findMany({ where: { clinicId }, select: { name: true } }),
    prisma.category.aggregate({ where: { clinicId }, _max: { sortOrder: true } }),
    prisma.service.aggregate({ where: { clinicId }, _max: { sortOrder: true } }),
  ]);
  const norm = (n: string) => n.trim().toLowerCase();
  const catByName = new Map(existingCats.map((c) => [norm(c.name), c.id]));
  const svcNames = new Set(existingServices.map((s) => norm(s.name)));
  let catOrder = (lastCat._max.sortOrder ?? -1) + 1;
  let svcOrder = (lastSvc._max.sortOrder ?? -1) + 1;
  let categories = 0;
  let services = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const cat of template.categories) {
      let categoryId = catByName.get(norm(cat.name));
      if (!categoryId) {
        const created = await tx.category.create({
          data: { clinicId, name: cat.name, sortOrder: catOrder++ },
        });
        categoryId = created.id;
        catByName.set(norm(cat.name), categoryId);
        categories++;
      }
      for (const sv of cat.services) {
        if (svcNames.has(norm(sv.name))) {
          skipped++;
          continue;
        }
        await tx.service.create({
          data: {
            clinicId,
            categoryId,
            name: sv.name,
            description: sv.description ?? null,
            kind: sv.kind,
            pricingType: sv.pricingType,
            unitLabel: sv.unitLabel ?? null,
            durationMin: sv.durationMin,
            price: null,
            isActive: false,
            sortOrder: svcOrder++,
          },
        });
        svcNames.add(norm(sv.name));
        services++;
      }
    }
  });
  return ok({ categories, services, skipped });
}
