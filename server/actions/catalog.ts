"use server";

import { revalidatePath } from "next/cache";
import { getPermittedContext } from "@/lib/auth";
import type { BranchScope } from "@/lib/branch-scope";
import type { Permission } from "@/lib/permissions";
import {
  adjustBalanceSchema,
  cancelPackageSchema,
  categorySchema,
  extendPackageSchema,
  packageInputSchema,
  sellPackageSchema,
  doctorServicesInputSchema,
  offerInputSchema,
  serviceInputSchema,
} from "@/lib/validations/catalog";
import * as Catalog from "@/server/services/catalog";
import * as Offers from "@/server/services/offers";
import * as Packages from "@/server/services/packages";
import { isClinicPatient } from "@/server/services/users";
import { prisma } from "@/lib/prisma";
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

// ─── Offers ("offers" permission — separate from editing the catalog) ─────────

async function requireOffers() {
  const ctx = await getPermittedContext(["offers"]);
  if (!ctx) throw new Error("غير مصرح");
  return { clinicId: ctx.clinic.id, scope: ctx.branchIds as BranchScope, userId: ctx.user.id };
}

function refreshOffers() {
  revalidatePath("/admin/services", "layout");
}

export async function createOfferAction(input: unknown) {
  const { clinicId, scope, userId } = await requireOffers();
  const parsed = offerInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Offers.createOffer(clinicId, scope, userId, parsed.data);
  if (!result.ok) return { error: result.error };
  refreshOffers();
  return { success: true as const, id: result.data.id, error: undefined };
}

export async function updateOfferAction(offerId: string, input: unknown): Promise<ActionResult> {
  const { clinicId, scope } = await requireOffers();
  const parsed = offerInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Offers.updateOffer(clinicId, scope, offerId, parsed.data);
  if (!result.ok) return { error: result.error };
  refreshOffers();
  return { success: true };
}

export async function setOfferActiveAction(
  offerId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { clinicId, scope } = await requireOffers();
  const result = await Offers.setOfferActive(clinicId, scope, offerId, !!isActive);
  if (!result.ok) return { error: result.error };
  refreshOffers();
  return { success: true };
}

export async function duplicateOfferAction(offerId: string): Promise<ActionResult> {
  const { clinicId, scope, userId } = await requireOffers();
  const result = await Offers.duplicateOffer(clinicId, scope, userId, offerId);
  if (!result.ok) return { error: result.error };
  refreshOffers();
  return { success: true };
}

export async function deleteOfferAction(offerId: string): Promise<ActionResult> {
  const { clinicId, scope } = await requireOffers();
  const result = await Offers.deleteOffer(clinicId, scope, offerId);
  if (!result.ok) return { error: result.error };
  refreshOffers();
  return { success: true };
}

// ─── Packages: catalog ("services") ───────────────────────────────────────────

export async function createPackageAction(input: unknown) {
  const { clinicId, scope } = await requireScoped("services");
  const parsed = packageInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Packages.createPackage(clinicId, scope, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true as const, id: result.data.id, error: undefined };
}

export async function updatePackageAction(
  packageId: string,
  input: unknown
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  const parsed = packageInputSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Packages.updatePackage(clinicId, scope, packageId, parsed.data);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function setPackageActiveAction(
  packageId: string,
  isActive: boolean
): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  const result = await Packages.setPackageActive(clinicId, scope, packageId, !!isActive);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

export async function deletePackageAction(packageId: string): Promise<ActionResult> {
  const { clinicId, scope } = await requireScoped("services");
  const result = await Packages.deletePackage(clinicId, scope, packageId);
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true };
}

// ─── Patient packages ("patient_packages") ────────────────────────────────────

async function requirePatientPackages() {
  const ctx = await getPermittedContext(["patient_packages"]);
  if (!ctx) throw new Error("غير مصرح");
  return { clinicId: ctx.clinic.id, scope: ctx.branchIds as BranchScope, userId: ctx.user.id };
}

function refreshPatient(patientId: string) {
  revalidatePath(`/admin/patients/${patientId}`, "page");
}

/** Price of a package for a branch today (offer applied) — the sell dialog's preview. */
export async function quotePackageAction(packageId: string, branchId: string) {
  const { clinicId, scope } = await requirePatientPackages();
  if (scope !== null && !scope.includes(branchId)) return { error: "الفرع غير موجود" };
  const res = await Packages.quotePackage(clinicId, packageId, branchId);
  return res.ok ? { quote: res.data } : { error: res.error };
}

export async function sellPackageAction(input: unknown): Promise<ActionResult> {
  const { clinicId, scope, userId } = await requirePatientPackages();
  const parsed = sellPackageSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const v = parsed.data;
  if (scope !== null && !scope.includes(v.branchId))
    return { error: "يمكنك بيع الباقات في فروعك فقط" };
  if (!(await isClinicPatient(v.patientId, clinicId))) return { error: "المريض غير موجود" };
  const result = await Packages.purchasePackage({
    clinicId,
    patientId: v.patientId,
    packageId: v.packageId,
    branchId: v.branchId,
    soldById: userId,
    paid: v.paid,
    note: v.note,
  });
  if (!result.ok) return { error: result.error };
  refreshPatient(v.patientId);
  return { success: true };
}

async function ownerOf(patientPackageId: string, clinicId: string) {
  const p = await prisma.patientPackage.findFirst({
    where: { id: patientPackageId, clinicId },
    select: { patientId: true },
  });
  return p?.patientId ?? null;
}

export async function confirmPackagePaymentAction(patientPackageId: string): Promise<ActionResult> {
  const { clinicId, scope, userId } = await requirePatientPackages();
  const result = await Packages.confirmPackagePayment(clinicId, scope, userId, patientPackageId);
  if (!result.ok) return { error: result.error };
  const patientId = await ownerOf(patientPackageId, clinicId);
  if (patientId) refreshPatient(patientId);
  return { success: true };
}

export async function adjustBalanceAction(input: unknown): Promise<ActionResult> {
  const { clinicId, scope, userId } = await requirePatientPackages();
  const parsed = adjustBalanceSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Packages.adjustBalance(clinicId, scope, userId, parsed.data);
  if (!result.ok) return { error: result.error };
  const bal = await prisma.patientPackageBalance.findUnique({
    where: { id: parsed.data.balanceId },
    select: { patientPackage: { select: { patientId: true } } },
  });
  if (bal) refreshPatient(bal.patientPackage.patientId);
  return { success: true };
}

export async function extendPackageAction(input: unknown): Promise<ActionResult> {
  const { clinicId, scope, userId } = await requirePatientPackages();
  const parsed = extendPackageSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Packages.extendPackage(clinicId, scope, userId, parsed.data);
  if (!result.ok) return { error: result.error };
  const patientId = await ownerOf(parsed.data.patientPackageId, clinicId);
  if (patientId) refreshPatient(patientId);
  return { success: true };
}

export async function cancelPatientPackageAction(input: unknown): Promise<ActionResult> {
  const { clinicId, scope, userId } = await requirePatientPackages();
  const parsed = cancelPackageSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const result = await Packages.cancelPatientPackage(clinicId, scope, userId, parsed.data);
  if (!result.ok) return { error: result.error };
  const patientId = await ownerOf(parsed.data.patientPackageId, clinicId);
  if (patientId) refreshPatient(patientId);
  return { success: true };
}

// ─── Clinic-type templates (clinic-wide: all-branch members only) ─────────────

export async function applyCatalogTemplateAction(key: string) {
  const { clinicId, scope } = await requireScoped("services");
  if (scope !== null) return { error: CLINIC_WIDE_ONLY };
  const result = await Catalog.applyCatalogTemplate(clinicId, String(key));
  if (!result.ok) return { error: result.error };
  refresh();
  return { success: true as const, ...result.data, error: undefined };
}
