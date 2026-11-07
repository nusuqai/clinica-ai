// Branch scope for clinic staff (GitHub #52). A scope is either `null` — every
// branch, which is what ADMINs and unrestricted staff have — or the list of
// branch ids a staff member is limited to. An empty list is a real scope: the
// member is limited and currently has no branch, so they match nothing.
//
// Rows whose branchId is null (legacy data from before branches existed) are
// outside every limited scope: only all-branch members see them.

export type BranchScope = readonly string[] | null;

/** Is a row carrying `branchId` inside `scope`? */
export function inBranchScope(scope: BranchScope, branchId: string | null | undefined): boolean {
  return scope === null || (!!branchId && scope.includes(branchId));
}

/** Prisma WHERE fragment for a model with a `branchId` column. */
export function branchIdFilter(scope: BranchScope | undefined): { branchId?: { in: string[] } } {
  return scope == null ? {} : { branchId: { in: [...scope] } };
}

/** Prisma WHERE fragment for a Doctor: works at one of the scope's branches. */
export function doctorBranchFilter(scope: BranchScope | undefined): {
  branches?: { some: { branchId: { in: string[] } } };
} {
  return scope == null ? {} : { branches: { some: { branchId: { in: [...scope] } } } };
}
