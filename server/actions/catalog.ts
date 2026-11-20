"use server";

import { revalidatePath } from "next/cache";
import { getPermittedContext } from "@/lib/auth";
import type { BranchScope } from "@/lib/branch-scope";
import type { Permission } from "@/lib/permissions";
import {
  categorySchema,
  doctorServicesInputSchema,
  serviceInputSchema,
} from "@/lib/validations/catalog";
import * as Catalog from "@/server/services/catalog";
import * as Scope from "@/server/services/branchScope";

// Server actions for the service catalog (categories + services). Every action
// re-validates its payload and resolves the caller's clinic and branch scope on
// the server — nothing the client sends is trusted for either.

type ActionResult = { success?: true; error?: string };

async function requireScoped(
  ...permissions: Permission[]
): Promise<{ clinicId: string; scope: BranchScope }> {
  const ctx = await getPermittedContext(permissions);
  if (!ctx) throw new Error("غير مصرح");
  return { clinicId: ctx.clinic.id, scope: ctx.branchIds };
}

const CLINIC_WIDE_ONLY = "التصنيفات مشتركة بين كل الفروع، ويعدّلها من يدير كل الفروع فقط";

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "بيانات غير صالحة";
}

function refresh() {
  revalidatePath("/admin/services", "layout");
  revalidatePath("/admin/doctors", "layout");
}

// ─── Categories (clinic-wide: all-branch members only) ────────────────────────

export async function createCategoryAction(name: string) {
  const { clinicId, scope } = await requireScoped("services");
  if (scope !== null) return { error: CLINIC_WIDE_ONLY };
  const parsed = categorySchema.safeParse({ name });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Catalog.createCategory(clinicId, parsed.data.name);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true as const, id: result.data.id, error: undefined };
}

export async function renameCategoryAction(
  categoryId: string,
  name: string
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  if (scope !== null) return { error: CLINIC_WIDE_ONLY };
  const parsed = categorySchema.safeParse({ name });
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Catalog.updateCategory(clinicId, categoryId, { name: parsed.data.name });
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function setCategoryActiveAction(
  categoryId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  if (scope !== null) return { error: CLINIC_WIDE_ONLY };
  const result = await Catalog.updateCategory(clinicId, categoryId, { isActive: !!isActive });
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function reorderCategoriesAction(orderedIds: string[]): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  if (scope !== null) return { error: CLINIC_WIDE_ONLY };
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string"))
    return { error: "بيانات غير صالحة" };
  const result = await Catalog.reorderCategories(clinicId, orderedIds);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  if (scope !== null) return { error: CLINIC_WIDE_ONLY };
  const result = await Catalog.deleteCategory(clinicId, categoryId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

// ─── Services ─────────────────────────────────────────────────────────────────

export async function createServiceAction(input: unknown) {
  const { clinicId, scope } = await requireScoped("services");
  const parsed = serviceInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Catalog.createService(clinicId, scope, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true as const, id: result.data.id, error: undefined };
}

export async function updateServiceAction(
  serviceId: string,
  input: unknown
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  const parsed = serviceInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Catalog.updateService(clinicId, scope, serviceId, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function setServiceActiveAction(
  serviceId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  const result = await Catalog.setServiceActive(clinicId, scope, serviceId, !!isActive);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function deleteServiceAction(serviceId: string): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  const result = await Catalog.deleteService(clinicId, scope, serviceId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

// ─── A practitioner's services ────────────────────────────────────────────────

// Reachable from the doctor page ("doctors") as well as the catalog ("services").
export async function setDoctorServicesAction(
  doctorId: string,
  input: unknown
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("doctors", "services");
  if (!(await Scope.doctorInScope(doctorId, clinicId, scope))) return { error: "الطبيب غير موجود" };
  const parsed = doctorServicesInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Catalog.setDoctorServices(clinicId, scope, doctorId, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}
