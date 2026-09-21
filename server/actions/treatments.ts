"use server";

import { revalidatePath } from "next/cache";
import { Role, type ProcedureKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicContext } from "@/lib/auth";
import * as TreatmentService from "@/server/services/treatments";
import { authorizePatientHistory } from "@/server/services/treatmentAccess";

// Treatment records are medical data, so every action here re-establishes WHO
// is asking and WHICH clinic they're in — from the session and the request host,
// never from anything the client sent. The clinic id is then passed down to the
// service, which filters every query by it.
//
// Roles, as decided for v1:
//   DOCTOR  — creates and edits their OWN records; reads the history of
//             patients they treat in this clinic.
//   ADMIN   — reads any record in their clinic; does not write.
//   PATIENT — reads only their own records, only in this clinic.

// ─── Wire types ───────────────────────────────────────────────────────────────

// The form posts the whole record, child lines included, as one payload — dates
// as "YYYY-MM-DD" strings, because that is what <input type="date"> gives us.
export interface TreatmentRecordPayload {
  visitDate: string;
  chiefComplaint?: string;
  diagnosis?: string;
  clinicalNotes?: string;
  followUpDate?: string | null;
  procedures: {
    kind: ProcedureKind;
    name: string;
    note?: string;
    cost?: string;
  }[];
  prescriptions: {
    drugName: string;
    dose?: string;
    frequency?: string;
    durationDays?: string;
    instructions?: string;
  }[];
}

// "YYYY-MM-DD" → a UTC midnight Date. The column is @db.Date and the rest of the
// app formats dates with timeZone: "UTC" (see lib/slot-time.ts), so building the
// value in UTC is what keeps the displayed day equal to the day that was typed.
function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toServiceInput(payload: TreatmentRecordPayload): TreatmentService.TreatmentRecordInput {
  return {
    visitDate: parseDateOnly(payload.visitDate),
    chiefComplaint: payload.chiefComplaint ?? null,
    diagnosis: payload.diagnosis ?? null,
    clinicalNotes: payload.clinicalNotes ?? null,
    followUpDate: payload.followUpDate ? parseDateOnly(payload.followUpDate) : null,
    procedures: payload.procedures.map((p) => ({
      kind: p.kind,
      name: p.name,
      note: p.note ?? null,
      cost: p.cost?.trim() ? Number(p.cost) : null,
    })),
    prescriptions: payload.prescriptions.map((p) => ({
      drugName: p.drugName,
      dose: p.dose ?? null,
      frequency: p.frequency ?? null,
      durationDays: p.durationDays?.trim() ? Number(p.durationDays) : null,
      instructions: p.instructions ?? null,
    })),
  };
}

// ─── Guards ───────────────────────────────────────────────────────────────────

async function requireDoctor(): Promise<
  { ok: true; userId: string; doctorId: string; clinicId: string } | { ok: false; error: string }
> {
  const ctx = await getClinicContext();
  if (!ctx || ctx.role !== Role.DOCTOR) return { ok: false, error: "غير مصرح" };

  const doctor = await prisma.doctor.findFirst({
    where: { profileId: ctx.user.id, clinicId: ctx.clinic.id },
    select: { id: true },
  });
  if (!doctor) return { ok: false, error: "غير مصرح" };

  return { ok: true, userId: ctx.user.id, doctorId: doctor.id, clinicId: ctx.clinic.id };
}

// ─── Doctor writes ────────────────────────────────────────────────────────────

/** Create the clinical record for one of the doctor's own appointments. */
export async function createRecordForAppointmentAction(
  appointmentId: string,
  payload: TreatmentRecordPayload
) {
  const auth = await requireDoctor();
  if (!auth.ok) return { error: auth.error };

  const res = await TreatmentService.createRecord({
    clinicId: auth.clinicId,
    doctorId: auth.doctorId,
    authorId: auth.userId,
    // No patientId: the appointment is the authority on who the visit was for.
    appointmentId,
    input: toServiceInput(payload),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/doctor/appointments", "page");
  revalidatePath("/doctor/patients", "page");
  return { success: true, id: res.data.id };
}

/** Create a record with no appointment behind it — a walk-in or a paper note. */
export async function createStandaloneRecordAction(
  patientId: string,
  payload: TreatmentRecordPayload
) {
  const auth = await requireDoctor();
  if (!auth.ok) return { error: auth.error };

  const res = await TreatmentService.createRecord({
    clinicId: auth.clinicId,
    doctorId: auth.doctorId,
    authorId: auth.userId,
    patientId,
    appointmentId: null,
    input: toServiceInput(payload),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/doctor/patients", "page");
  return { success: true, id: res.data.id };
}

/** Edit a record. Restricted to the doctor who owns it; each edit is audited. */
export async function updateRecordAction(recordId: string, payload: TreatmentRecordPayload) {
  const auth = await requireDoctor();
  if (!auth.ok) return { error: auth.error };

  const res = await TreatmentService.updateRecord({
    recordId,
    clinicId: auth.clinicId,
    doctorId: auth.doctorId,
    editorId: auth.userId,
    input: toServiceInput(payload),
  });
  if (!res.ok) return { error: res.error };

  revalidatePath("/doctor/appointments", "page");
  revalidatePath("/doctor/patients", "page");
  return { success: true };
}

// ─── Reads ────────────────────────────────────────────────────────────────────

/**
 * The record attached to one appointment, for the doctor's edit modal. Fetched
 * on open rather than embedded in every table row.
 */
export async function getRecordForAppointmentAction(appointmentId: string) {
  const auth = await requireDoctor();
  if (!auth.ok) return { error: auth.error };

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: auth.clinicId, doctorId: auth.doctorId },
    select: { id: true },
  });
  if (!appt) return { error: "الموعد غير موجود أو غير مصرح" };

  const record = await TreatmentService.getRecordForAppointment(appointmentId, auth.clinicId);
  return { record };
}

/** Edit history for one record — readable by anyone who may read the record. */
export async function getRecordRevisionsAction(recordId: string) {
  const ctx = await getClinicContext();
  if (!ctx) return { error: "غير مصرح" };

  // Resolve the record's patient inside this clinic first, then run that patient
  // through the same read rule the timeline pages use.
  const record = await prisma.treatmentRecord.findFirst({
    where: { id: recordId, clinicId: ctx.clinic.id },
    select: { patientId: true },
  });
  if (!record) return { error: "السجل غير موجود" };

  const auth = await authorizePatientHistory(record.patientId);
  if (!auth.ok) return { error: auth.error };

  const revisions = await TreatmentService.listRecordRevisions(recordId, ctx.clinic.id);
  return { revisions };
}
