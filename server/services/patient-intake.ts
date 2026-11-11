import "server-only";
import { Role, type PatientIntake } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { intakeSchema, staffIntakeSchema, type IntakeValues } from "@/lib/patient-intake";
import { ok, err, type Result } from "./_result";

// Patient intake file — one per (clinic, patient). See lib/patient-intake.ts.

export async function getPatientIntake(
  clinicId: string,
  patientId: string
): Promise<PatientIntake | null> {
  return prisma.patientIntake.findUnique({
    where: { clinicId_patientId: { clinicId, patientId } },
  });
}

export async function hasPatientIntake(clinicId: string, patientId: string): Promise<boolean> {
  const row = await prisma.patientIntake.findUnique({
    where: { clinicId_patientId: { clinicId, patientId } },
    select: { id: true },
  });
  return !!row;
}

/** Create or replace the patient's intake file at this clinic (all answers required). */
export async function savePatientIntake(
  clinicId: string,
  patientId: string,
  input: unknown
): Promise<Result<void>> {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "بيانات ملف المريض غير مكتملة");
  }
  const data: IntakeValues = parsed.data;
  try {
    await prisma.patientIntake.upsert({
      where: { clinicId_patientId: { clinicId, patientId } },
      update: data,
      create: { clinicId, patientId, ...data },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حفظ ملف المريض");
  }
}

/**
 * Staff (admin patient page) create/edit the file. Answers may be empty (saved
 * as null), but an all-empty file isn't created — that would silently let the
 * patient skip the questionnaire at their first booking.
 */
export async function saveStaffPatientIntake(
  clinicId: string,
  patientId: string,
  input: unknown
): Promise<Result<void>> {
  const parsed = staffIntakeSchema.safeParse(input);
  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? "بيانات ملف المريض غير صالحة");
  }
  // Only a patient of THIS clinic.
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: patientId, clinicId } },
    select: { role: true },
  });
  if (member?.role !== Role.PATIENT) return err("المريض غير موجود");

  const data = Object.fromEntries(Object.entries(parsed.data).map(([k, v]) => [k, v || null])) as {
    [K in keyof IntakeValues]: string | null;
  };
  const empty = Object.values(data).every((v) => v === null);
  try {
    if (empty && !(await hasPatientIntake(clinicId, patientId))) {
      return err("أدخل إجابة واحدة على الأقل");
    }
    await prisma.patientIntake.upsert({
      where: { clinicId_patientId: { clinicId, patientId } },
      update: data,
      create: { clinicId, patientId, ...data },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حفظ ملف المريض");
  }
}
