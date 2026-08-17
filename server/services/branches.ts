import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import {
  Prisma,
  type Branch,
  type BranchPhone,
  type BranchHours,
  type DayOfWeek,
  type PhoneType,
} from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BranchWithDetails = Branch & {
  phones: BranchPhone[];
  hours: BranchHours[];
  _count: { doctors: number };
};

export interface BranchPhoneInput {
  type: PhoneType;
  number: string;
  label?: string | null;
  isPrimary?: boolean;
}

export interface BranchHoursInput {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime?: string | null;
  closeTime?: string | null;
}

export interface CreateBranchInput {
  clinicId: string;
  name: string;
  isMain?: boolean;
  address?: string | null;
  mapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hasParking?: boolean;
  parkingInfo?: string | null;
  nearestLandmark?: string | null;
  directions?: string | null;
  phones?: BranchPhoneInput[];
  hours?: BranchHoursInput[];
}

export interface UpdateBranchInput
  extends Partial<Omit<CreateBranchInput, "clinicId">> {
  branchId: string;
}

const detailInclude = {
  phones: { orderBy: [{ isPrimary: "desc" }, { number: "asc" }] },
  hours: true,
  _count: { select: { doctors: true } },
} satisfies Prisma.BranchInclude;

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listBranches(
  clinicId: string,
  options?: { activeOnly?: boolean },
): Promise<BranchWithDetails[]> {
  return prisma.branch.findMany({
    where: { clinicId, ...(options?.activeOnly ? { isActive: true } : {}) },
    include: detailInclude,
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
  });
}

export async function getBranch(
  branchId: string,
  clinicId?: string,
): Promise<BranchWithDetails | null> {
  return prisma.branch.findFirst({
    where: { id: branchId, ...(clinicId ? { clinicId } : {}) },
    include: detailInclude,
  });
}

/** The clinic's main branch (or its first branch as a fallback). */
export async function getMainBranch(clinicId: string): Promise<Branch | null> {
  return (
    (await prisma.branch.findFirst({ where: { clinicId, isMain: true } })) ??
    (await prisma.branch.findFirst({
      where: { clinicId },
      orderBy: { createdAt: "asc" },
    }))
  );
}

/** Branch opening window for one weekday. Null = no hours row configured. */
export async function getBranchDayWindow(
  branchId: string,
  dayOfWeek: DayOfWeek,
): Promise<{ isClosed: boolean; openTime: string | null; closeTime: string | null } | null> {
  const row = await prisma.branchHours.findUnique({
    where: { branchId_dayOfWeek: { branchId, dayOfWeek } },
  });
  return row
    ? { isClosed: row.isClosed, openTime: row.openTime, closeTime: row.closeTime }
    : null;
}

export async function doctorWorksAtBranch(
  doctorId: string,
  branchId: string,
): Promise<boolean> {
  const link = await prisma.doctorBranch.findUnique({
    where: { doctorId_branchId: { doctorId, branchId } },
  });
  return !!link;
}

export async function listDoctorBranchIds(doctorId: string): Promise<string[]> {
  const rows = await prisma.doctorBranch.findMany({
    where: { doctorId },
    select: { branchId: true },
  });
  return rows.map((r) => r.branchId);
}

// ─── Mutations ──────────────────────────────────────────────────────────────

function phoneCreateData(branchId: string, phones: BranchPhoneInput[]) {
  return phones
    .filter((p) => p.number.trim())
    .map((p) => ({
      branchId,
      type: p.type,
      number: p.number.trim(),
      label: p.label?.trim() || null,
      isPrimary: p.isPrimary ?? false,
    }));
}

function hoursCreateData(branchId: string, hours: BranchHoursInput[]) {
  return hours.map((h) => ({
    branchId,
    dayOfWeek: h.dayOfWeek,
    isClosed: h.isClosed,
    openTime: h.isClosed ? null : h.openTime?.trim() || null,
    closeTime: h.isClosed ? null : h.closeTime?.trim() || null,
  }));
}

export async function createBranch(
  input: CreateBranchInput,
): Promise<Result<{ id: string }>> {
  try {
    const branch = await prisma.$transaction(async (tx) => {
      const b = await tx.branch.create({
        data: {
          clinicId: input.clinicId,
          name: input.name.trim(),
          isMain: input.isMain ?? false,
          address: input.address?.trim() || null,
          mapsUrl: input.mapsUrl?.trim() || null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          hasParking: input.hasParking ?? false,
          parkingInfo: input.parkingInfo?.trim() || null,
          nearestLandmark: input.nearestLandmark?.trim() || null,
          directions: input.directions?.trim() || null,
        },
      });
      if (input.phones?.length) {
        await tx.branchPhone.createMany({ data: phoneCreateData(b.id, input.phones) });
      }
      if (input.hours?.length) {
        await tx.branchHours.createMany({ data: hoursCreateData(b.id, input.hours) });
      }
      return b;
    });
    return ok({ id: branch.id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل إنشاء الفرع");
  }
}

export async function updateBranch(
  input: UpdateBranchInput,
): Promise<Result<void>> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.branch.update({
        where: { id: input.branchId },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.isMain !== undefined && { isMain: input.isMain }),
          ...(input.address !== undefined && { address: input.address?.trim() || null }),
          ...(input.mapsUrl !== undefined && { mapsUrl: input.mapsUrl?.trim() || null }),
          ...(input.latitude !== undefined && { latitude: input.latitude ?? null }),
          ...(input.longitude !== undefined && { longitude: input.longitude ?? null }),
          ...(input.hasParking !== undefined && { hasParking: input.hasParking }),
          ...(input.parkingInfo !== undefined && {
            parkingInfo: input.parkingInfo?.trim() || null,
          }),
          ...(input.nearestLandmark !== undefined && {
            nearestLandmark: input.nearestLandmark?.trim() || null,
          }),
          ...(input.directions !== undefined && {
            directions: input.directions?.trim() || null,
          }),
        },
      });
      // Nested collections are replaced wholesale when provided.
      if (input.phones !== undefined) {
        await tx.branchPhone.deleteMany({ where: { branchId: input.branchId } });
        if (input.phones.length) {
          await tx.branchPhone.createMany({
            data: phoneCreateData(input.branchId, input.phones),
          });
        }
      }
      if (input.hours !== undefined) {
        await tx.branchHours.deleteMany({ where: { branchId: input.branchId } });
        if (input.hours.length) {
          await tx.branchHours.createMany({
            data: hoursCreateData(input.branchId, input.hours),
          });
        }
      }
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث الفرع");
  }
}

export async function setBranchActive(
  branchId: string,
  isActive: boolean,
): Promise<Result<void>> {
  try {
    await prisma.branch.update({ where: { id: branchId }, data: { isActive } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة الفرع");
  }
}

/**
 * Delete a branch. Guards: a clinic must always keep at least one branch, and
 * the main branch can't be deleted (reassign isMain first).
 */
export async function deleteBranch(branchId: string): Promise<Result<void>> {
  try {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return err("الفرع غير موجود");
    if (branch.isMain) return err("لا يمكن حذف الفرع الرئيسي. عيّن فرعاً رئيسياً آخر أولاً.");
    const count = await prisma.branch.count({ where: { clinicId: branch.clinicId } });
    if (count <= 1) return err("لا يمكن حذف الفرع الوحيد للعيادة.");
    await prisma.branch.delete({ where: { id: branchId } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حذف الفرع");
  }
}

/** Make `branchId` the clinic's single main branch. */
export async function setMainBranch(
  clinicId: string,
  branchId: string,
): Promise<Result<void>> {
  try {
    await prisma.$transaction([
      prisma.branch.updateMany({ where: { clinicId }, data: { isMain: false } }),
      prisma.branch.update({ where: { id: branchId }, data: { isMain: true } }),
    ]);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تعيين الفرع الرئيسي");
  }
}

/** Replace the set of branches a doctor works at. */
export async function setDoctorBranches(
  doctorId: string,
  branchIds: string[],
): Promise<Result<void>> {
  try {
    const unique = [...new Set(branchIds)];
    await prisma.$transaction([
      prisma.doctorBranch.deleteMany({
        where: { doctorId, branchId: { notIn: unique.length ? unique : ["__none__"] } },
      }),
      prisma.doctorBranch.createMany({
        data: unique.map((branchId) => ({ doctorId, branchId })),
        skipDuplicates: true,
      }),
    ]);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث فروع الطبيب");
  }
}
