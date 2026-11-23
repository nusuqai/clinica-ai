"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getClinicContext } from "@/lib/auth";
import { authorizePatientHistory } from "@/server/services/treatmentAccess";
import * as HealthProfileService from "@/server/services/health-profile";

/**
 * Staff edit a patient's health profile — every question, staff-only ones
 * included. Same read rule as the treatment history: an admin, a staff member
 * whose role grants medical_records, or a doctor who has treated the patient.
 * Every change is recorded in the answer history with the editor's name.
 */
export async function saveStaffHealthAnswersAction(
  patientId: string,
  answers: Record<string, unknown>
): Promise<{ success: true } | { error: string }> {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role === Role.PATIENT) return { error: "غير مصرح" };
  const access = await authorizePatientHistory(patientId);
  if (!access.ok) return { error: access.error };

  const res = await HealthProfileService.saveAnswers({
    clinicId: access.clinicId,
    patientId,
    answers,
    source: "STAFF",
    actorId: ctx.user.id,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath("/admin/patients/[id]", "page");
  revalidatePath("/doctor/patients/[id]", "page");
  return { success: true };
}
