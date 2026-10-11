import "server-only";
import { prisma } from "@/lib/prisma";
import { branchIdFilter, doctorBranchFilter, type BranchScope } from "@/lib/branch-scope";

// Single-row guards for the admin dashboard's server actions: "does this id
// belong to the caller's clinic AND fall inside their branch scope?". Every
// action that takes an id from the client runs one of these before touching the
// row, so a staff member limited to some branches can't reach another branch's
// data by guessing or replaying an id — and no id from another clinic ever
// resolves. A `null` scope (ADMIN / all-branch staff) checks the clinic only.

export async function appointmentInScope(
  appointmentId: string,
  clinicId: string,
  scope: BranchScope
): Promise<boolean> {
  const row = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId, ...branchIdFilter(scope) },
    select: { id: true },
  });
  return !!row;
}

/** A doctor is in scope when they work at one of the scope's branches. */
export async function doctorInScope(
  doctorId: string,
  clinicId: string,
  scope: BranchScope
): Promise<boolean> {
  const row = await prisma.doctor.findFirst({
    where: { id: doctorId, clinicId, ...doctorBranchFilter(scope) },
    select: { id: true },
  });
  return !!row;
}

export async function ruleInScope(
  ruleId: string,
  clinicId: string,
  scope: BranchScope
): Promise<boolean> {
  const row = await prisma.availabilityRule.findFirst({
    where: { id: ruleId, clinicId, ...branchIdFilter(scope) },
    select: { id: true },
  });
  return !!row;
}

export async function slotInScope(
  slotId: string,
  clinicId: string,
  scope: BranchScope
): Promise<boolean> {
  const row = await prisma.slot.findFirst({
    where: { id: slotId, clinicId, ...branchIdFilter(scope) },
    select: { id: true },
  });
  return !!row;
}

export async function queueInScope(
  queueId: string,
  clinicId: string,
  scope: BranchScope
): Promise<boolean> {
  const row = await prisma.doctorDayQueue.findFirst({
    where: { id: queueId, clinicId, ...branchIdFilter(scope) },
    select: { id: true },
  });
  return !!row;
}

/**
 * True when every branch the doctor works at is inside the scope — required for
 * actions whose effect is clinic-wide (deactivate, delete), which a
 * branch-limited member must not apply to a doctor shared with other branches.
 */
export async function doctorOnlyInScope(doctorId: string, scope: BranchScope): Promise<boolean> {
  if (scope === null) return true;
  const outside = await prisma.doctorBranch.findFirst({
    where: { doctorId, branchId: { notIn: [...scope] } },
    select: { branchId: true },
  });
  return !outside;
}

/** A branch of this clinic that the scope covers. */
export async function branchInScope(
  branchId: string,
  clinicId: string,
  scope: BranchScope
): Promise<boolean> {
  if (scope !== null && !scope.includes(branchId)) return false;
  const row = await prisma.branch.findFirst({
    where: { id: branchId, clinicId },
    select: { id: true },
  });
  return !!row;
}

/**
 * The branch ids a scoped member may leave on a doctor after an edit: what they
 * picked (limited to their own branches) plus the doctor's existing branches
 * OUTSIDE their scope, which they can't see and so must not be able to drop.
 * For a `null` scope the picked list is returned untouched.
 */
export async function mergeDoctorBranches(
  doctorId: string | null,
  picked: string[],
  scope: BranchScope
): Promise<string[]> {
  if (scope === null) return picked;
  const mine = picked.filter((id) => scope.includes(id));
  if (!doctorId) return mine;
  const existing = await prisma.doctorBranch.findMany({
    where: { doctorId, branchId: { notIn: [...scope] } },
    select: { branchId: true },
  });
  return [...new Set([...mine, ...existing.map((b) => b.branchId)])];
}
