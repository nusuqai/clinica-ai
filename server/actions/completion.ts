"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { getClinicContext, getPermittedContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as Scope from "@/server/services/branchScope";
import * as Completion from "@/server/services/completion";

// The completion window's actions: clinic staff with "appointments" (within
// their branches) or the practitioner who owns the visit.

const uuid = z.uuid();
const completeSchema = z.object({
  appointmentId: uuid,
  lines: z
    .array(
      z.object({
        itemId: uuid,
        remove: z.boolean().optional(),
        finalQuantity: z.number().int().min(0).max(10_000_000).nullable().optional(),
        finalPrice: z.number().min(0).max(99_999_999).nullable().optional(),
        preCheckDecision: z.enum(["APPROVED", "DECLINED"]).nullable().optional(),
        preCheckNote: z.string().trim().max(500).nullable().optional(),
      })
    )
    .max(50),
  add: z
    .array(
      z.object({
        serviceId: uuid,
        quantity: z.number().int().min(1).nullable().optional(),
        patientPackageId: uuid.nullable().optional(),
        finalQuantity: z.number().int().min(0).max(10_000_000).nullable().optional(),
        finalPrice: z.number().min(0).max(99_999_999).nullable().optional(),
      })
    )
    .max(20),
  confirmPaymentFor: z.array(uuid).max(20),
});

/** Who may complete this visit: { clinicId, actorId } or null. */
async function authorize(appointmentId: string) {
  const staff = await getPermittedContext(["appointments"]);
  if (staff) {
    if (!(await Scope.appointmentInScope(appointmentId, staff.clinic.id, staff.branchIds)))
      return null;
    return { clinicId: staff.clinic.id, actorId: staff.user.id };
  }
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.DOCTOR) return null;
  const own = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinic.id, doctor: { profileId: ctx.user.id } },
    select: { id: true },
  });
  return own ? { clinicId: ctx.clinic.id, actorId: ctx.user.id } : null;
}

export async function getCompletionDraftAction(appointmentId: string) {
  if (!uuid.safeParse(appointmentId).success) return { error: "الموعد غير موجود" };
  const who = await authorize(appointmentId);
  if (!who) return { error: "الموعد غير موجود أو غير مصرح" };
  const res = await Completion.getCompletionDraft(appointmentId, who.clinicId);
  return res.ok ? { draft: res.data } : { error: res.error };
}

export async function completeVisitAction(input: unknown) {
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  const who = await authorize(parsed.data.appointmentId);
  if (!who) return { error: "الموعد غير موجود أو غير مصرح" };
  const res = await Completion.completeVisit(who.clinicId, who.actorId, parsed.data);
  if (!res.ok) return { error: res.error };
  revalidatePath(`/admin/appointments/${parsed.data.appointmentId}`, "page");
  revalidatePath("/doctor/appointments", "page");
  revalidatePath("/doctor", "page");
  return { success: true as const, finalTotal: res.data.finalTotal, rewards: res.data.rewards };
}
