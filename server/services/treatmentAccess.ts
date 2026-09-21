import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicContext } from "@/lib/auth";

// THE read rule for medical history, in one place so the doctor, admin and
// patient pages cannot drift apart. Kept out of server/actions/treatments.ts on
// purpose: everything exported from a "use server" module becomes a callable
// endpoint, and an authorization helper has no business being one.

export type HistoryAccess =
  { ok: true; clinicId: string; role: Role } | { ok: false; error: string };

/**
 * Authorizes a READ of one patient's history, for whichever role the caller
 * holds. The clinic always comes from the request host, so a patient signed in
 * at demo.clinica-ai.nusuqai.com is authorized for demo's records and only
 * those — the same Profile at another clinic is a different history.
 *
 *   ADMIN   — any patient in their clinic.
 *   PATIENT — themselves, nobody else.
 *   DOCTOR  — a patient they have treated here (an appointment exists between
 *             the two). They then see the clinic's whole record for that
 *             patient, not only their own entries: a previous doctor's
 *             diagnosis is exactly what makes a history clinically useful.
 *             A doctor with no appointment for that patient gets nothing.
 */
export async function authorizePatientHistory(patientId: string): Promise<HistoryAccess> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "غير مصرح" };

  if (ctx.role === Role.ADMIN) {
    return { ok: true, clinicId: ctx.clinic.id, role: ctx.role };
  }

  if (ctx.role === Role.PATIENT) {
    if (ctx.user.id !== patientId) return { ok: false, error: "غير مصرح" };
    return { ok: true, clinicId: ctx.clinic.id, role: ctx.role };
  }

  if (ctx.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findFirst({
      where: { profileId: ctx.user.id, clinicId: ctx.clinic.id },
      select: { id: true },
    });
    if (!doctor) return { ok: false, error: "غير مصرح" };

    const treated = await prisma.appointment.findFirst({
      where: { clinicId: ctx.clinic.id, doctorId: doctor.id, patientId },
      select: { id: true },
    });
    if (!treated) return { ok: false, error: "غير مصرح" };

    return { ok: true, clinicId: ctx.clinic.id, role: ctx.role };
  }

  return { ok: false, error: "غير مصرح" };
}
