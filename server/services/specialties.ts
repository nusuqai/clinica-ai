import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { Prisma, type Specialty } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SpecialtyWithCount = Specialty & { _count: { doctors: number } };

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listSpecialties(
  clinicId: string,
): Promise<SpecialtyWithCount[]> {
  return prisma.specialty.findMany({
    where: { clinicId },
    include: { _count: { select: { doctors: true } } },
    orderBy: { name: "asc" },
  });
}

/** Lightweight list for dropdowns. */
export async function listSpecialtyOptions(
  clinicId: string,
): Promise<{ id: string; name: string }[]> {
  return prisma.specialty.findMany({
    where: { clinicId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Case-insensitive lookup of a specialty by name within a clinic. */
async function findByName(clinicId: string, name: string) {
  return prisma.specialty.findFirst({
    where: { clinicId, name: { equals: name, mode: "insensitive" } },
  });
}

export async function createSpecialty(
  clinicId: string,
  rawName: string,
): Promise<Result<{ id: string }>> {
  const name = rawName.trim();
  if (!name) return err("اسم التخصص مطلوب");
  try {
    if (await findByName(clinicId, name)) return err("هذا التخصص موجود بالفعل.");
    const s = await prisma.specialty.create({ data: { clinicId, name } });
    return ok({ id: s.id });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("هذا التخصص موجود بالفعل.");
    }
    return err(e instanceof Error ? e.message : "فشل إنشاء التخصص");
  }
}

/** Return the id of an existing (case-insensitive) specialty or create it. */
export async function findOrCreateSpecialty(
  clinicId: string,
  rawName: string,
): Promise<Result<{ id: string }>> {
  const name = rawName.trim();
  if (!name) return err("اسم التخصص مطلوب");
  const existing = await findByName(clinicId, name);
  if (existing) return ok({ id: existing.id });
  return createSpecialty(clinicId, name);
}

export async function renameSpecialty(
  clinicId: string,
  specialtyId: string,
  rawName: string,
): Promise<Result<void>> {
  const name = rawName.trim();
  if (!name) return err("اسم التخصص مطلوب");
  try {
    const clash = await findByName(clinicId, name);
    if (clash && clash.id !== specialtyId) return err("هذا التخصص موجود بالفعل.");
    await prisma.specialty.update({ where: { id: specialtyId }, data: { name } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تعديل التخصص");
  }
}

/** Delete a specialty. Doctors keep their record (specialtyId set to null). */
export async function deleteSpecialty(specialtyId: string): Promise<Result<void>> {
  try {
    await prisma.specialty.delete({ where: { id: specialtyId } });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حذف التخصص");
  }
}

/**
 * Resolve a specialty selection from a form/tool: an explicit id, or a new name
 * to find-or-create. Returns the specialtyId (or null when nothing supplied).
 */
export async function resolveSpecialtyId(
  clinicId: string,
  input: { specialtyId?: string | null; newSpecialtyName?: string | null },
): Promise<Result<string | null>> {
  const newName = input.newSpecialtyName?.trim();
  if (newName) {
    const res = await findOrCreateSpecialty(clinicId, newName);
    return res.ok ? ok(res.data.id) : res;
  }
  if (input.specialtyId) {
    // Verify the specialty belongs to this clinic.
    const found = await prisma.specialty.findFirst({
      where: { id: input.specialtyId, clinicId },
      select: { id: true },
    });
    if (!found) return err("التخصص المحدد غير موجود في هذه العيادة.");
    return ok(found.id);
  }
  return ok(null);
}
