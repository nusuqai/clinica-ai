import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus, ProcedureKind, type Prisma } from "@prisma/client";
import { updateAppointmentStatus } from "./appointments";

// Treatment records — the clinical history of a patient, as opposed to the
// scheduling history Appointment already holds.
//
// EVERY function here takes `clinicId` and filters on it. That is the whole
// tenancy guarantee: the clinic comes from the request host (lib/tenant.ts), so
// a patient reading their history at demo.clinica-ai.nusuqai.com gets demo's
// records and nothing else, even though the Profile behind them is shared
// across clinics. Never add a query here that resolves a record by id alone.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcedureInput {
  kind: ProcedureKind;
  name: string;
  note?: string | null;
  cost?: number | null;
}

export interface PrescriptionInput {
  drugName: string;
  dose?: string | null;
  frequency?: string | null;
  durationDays?: number | null;
  instructions?: string | null;
}

export interface TreatmentRecordInput {
  visitDate: Date;
  chiefComplaint?: string | null;
  diagnosis?: string | null;
  clinicalNotes?: string | null;
  followUpDate?: Date | null;
  procedures: ProcedureInput[];
  prescriptions: PrescriptionInput[];
}

// What the timeline views render. Shared by the doctor, admin and patient
// pages — they differ in which records they're allowed to ask for, not in the
// shape they get back.
export interface TreatmentRecordView {
  id: string;
  visitDate: Date;
  chiefComplaint: string | null;
  diagnosis: string | null;
  clinicalNotes: string | null;
  followUpDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  doctorId: string;
  doctorName: string;
  doctorSpecialty: string | null;
  branchName: string | null;
  appointmentId: string | null;
  procedures: {
    id: string;
    kind: ProcedureKind;
    name: string;
    note: string | null;
    cost: string | null;
  }[];
  prescriptions: {
    id: string;
    drugName: string;
    dose: string | null;
    frequency: string | null;
    durationDays: number | null;
    instructions: string | null;
  }[];
  /** How many times this record has been edited since it was written. */
  revisionCount: number;
  /**
   * Who typed it in, when that wasn't the treating doctor themselves — e.g. a
   * clinic admin entering it on the doctor's behalf. Null when the doctor wrote it.
   */
  enteredByName: string | null;
}

const recordInclude = {
  doctor: {
    select: { id: true, fullName: true, profileId: true, specialty: { select: { name: true } } },
  },
  createdBy: { select: { id: true, fullName: true } },
  branch: { select: { name: true } },
  procedures: { orderBy: { createdAt: "asc" } },
  prescriptions: { orderBy: { createdAt: "asc" } },
  _count: { select: { revisions: true } },
} as const;

type RecordRow = Prisma.TreatmentRecordGetPayload<{ include: typeof recordInclude }>;

function toView(row: RecordRow): TreatmentRecordView {
  return {
    id: row.id,
    visitDate: row.visitDate,
    chiefComplaint: row.chiefComplaint,
    diagnosis: row.diagnosis,
    clinicalNotes: row.clinicalNotes,
    followUpDate: row.followUpDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    doctorId: row.doctor.id,
    doctorName: row.doctor.fullName,
    doctorSpecialty: row.doctor.specialty?.name ?? null,
    branchName: row.branch?.name ?? null,
    appointmentId: row.appointmentId,
    procedures: row.procedures.map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      note: p.note,
      // Decimal never crosses the server/client boundary as-is.
      cost: p.cost ? p.cost.toString() : null,
    })),
    prescriptions: row.prescriptions.map((p) => ({
      id: p.id,
      drugName: p.drugName,
      dose: p.dose,
      frequency: p.frequency,
      durationDays: p.durationDays,
      instructions: p.instructions,
    })),
    revisionCount: row._count.revisions,
    enteredByName: row.createdBy.id === row.doctor.profileId ? null : row.createdBy.fullName,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * A patient's full clinical timeline INSIDE one clinic, newest visit first.
 *
 * `doctorId` narrows it to one doctor's own records — what a doctor sees of a
 * patient they treat. Without it the caller must already have established
 * clinic-wide read access (admin), or be the patient themselves.
 */
export async function listPatientRecords(args: {
  clinicId: string;
  patientId: string;
  doctorId?: string;
}): Promise<TreatmentRecordView[]> {
  const rows = await prisma.treatmentRecord.findMany({
    where: {
      clinicId: args.clinicId,
      patientId: args.patientId,
      ...(args.doctorId ? { doctorId: args.doctorId } : {}),
    },
    include: recordInclude,
    orderBy: [{ visitDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toView);
}

/** One record, or null when it doesn't belong to this clinic. */
export async function getRecord(
  recordId: string,
  clinicId: string
): Promise<TreatmentRecordView | null> {
  const row = await prisma.treatmentRecord.findFirst({
    where: { id: recordId, clinicId },
    include: recordInclude,
  });
  return row ? toView(row) : null;
}

/** The record written for one appointment, if any. Clinic-scoped. */
export async function getRecordForAppointment(
  appointmentId: string,
  clinicId: string
): Promise<TreatmentRecordView | null> {
  const row = await prisma.treatmentRecord.findFirst({
    where: { appointmentId, clinicId },
    include: recordInclude,
  });
  return row ? toView(row) : null;
}

export interface RevisionView {
  id: string;
  editedAt: Date;
  editedByName: string;
  snapshot: unknown;
}

/** Edit history for one record, oldest first. Clinic-scoped via the record. */
export async function listRecordRevisions(
  recordId: string,
  clinicId: string
): Promise<RevisionView[]> {
  const rows = await prisma.treatmentRecordRevision.findMany({
    where: { recordId, clinicId },
    include: { editedBy: { select: { fullName: true } } },
    orderBy: { editedAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    editedAt: r.editedAt,
    editedByName: r.editedBy.fullName,
    snapshot: r.snapshot,
  }));
}

/**
 * Which of a patient's records exist per appointment, so the doctor's
 * appointment list can show "record written" vs "add record" without an N+1.
 */
export async function mapRecordsByAppointment(
  appointmentIds: string[],
  clinicId: string
): Promise<Map<string, string>> {
  if (appointmentIds.length === 0) return new Map();
  const rows = await prisma.treatmentRecord.findMany({
    where: { clinicId, appointmentId: { in: appointmentIds } },
    select: { id: true, appointmentId: true },
  });
  return new Map(rows.flatMap((r) => (r.appointmentId ? [[r.appointmentId, r.id]] : [])));
}

export interface RecordableVisit {
  id: string;
  doctorName: string;
  /** The visit day — slot date for slot-based, booking date for order-based. */
  date: Date | null;
}

/**
 * A patient's COMPLETED appointments in this clinic that have no record yet,
 * newest first — the only visits an admin may file a record against. A visit
 * that hasn't happened (or was cancelled / a no-show) has nothing clinical to
 * document, so it never appears here.
 */
export async function listRecordableVisits(
  clinicId: string,
  patientId: string
): Promise<RecordableVisit[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      clinicId,
      patientId,
      status: AppointmentStatus.COMPLETED,
      treatmentRecord: null,
    },
    select: {
      id: true,
      bookingDate: true,
      slot: { select: { date: true } },
      doctor: { select: { fullName: true } },
    },
    orderBy: [{ slot: { date: "desc" } }, { bookingDate: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    doctorName: r.doctor.fullName,
    date: r.slot?.date ?? r.bookingDate,
  }));
}

/** Count of a patient's records in this clinic — for the admin user header. */
export async function countPatientRecords(clinicId: string, patientId: string): Promise<number> {
  return prisma.treatmentRecord.count({ where: { clinicId, patientId } });
}

// ─── Validation ───────────────────────────────────────────────────────────────

// A record with nothing clinical in it is not a record. Requiring at least one
// populated field stops an empty row being created by a stray submit.
function validate(input: TreatmentRecordInput): string | null {
  const hasNarrative = Boolean(
    input.chiefComplaint?.trim() || input.diagnosis?.trim() || input.clinicalNotes?.trim()
  );
  const procedures = input.procedures.filter((p) => p.name.trim());
  const prescriptions = input.prescriptions.filter((p) => p.drugName.trim());
  if (!hasNarrative && procedures.length === 0 && prescriptions.length === 0) {
    return "أضف تشخيصاً أو ملاحظات أو إجراءً واحداً على الأقل";
  }
  if (Number.isNaN(input.visitDate.getTime())) return "تاريخ الزيارة غير صالح";
  if (input.followUpDate && Number.isNaN(input.followUpDate.getTime())) {
    return "تاريخ المتابعة غير صالح";
  }
  for (const p of prescriptions) {
    if (p.durationDays != null && (!Number.isInteger(p.durationDays) || p.durationDays <= 0)) {
      return "مدة العلاج يجب أن تكون عدد أيام صحيح أكبر من صفر";
    }
  }
  for (const p of procedures) {
    if (p.cost != null && (Number.isNaN(p.cost) || p.cost < 0)) {
      return "تكلفة الإجراء غير صالحة";
    }
  }
  return null;
}

// Drops blank rows and trims. Applied to both create and update so a line the
// doctor cleared in the form disappears rather than saving as an empty row.
function cleanProcedures(rows: ProcedureInput[]) {
  return rows
    .filter((p) => p.name.trim())
    .map((p) => ({
      kind: p.kind,
      name: p.name.trim(),
      note: p.note?.trim() || null,
      cost: p.cost ?? null,
    }));
}

function cleanPrescriptions(rows: PrescriptionInput[]) {
  return rows
    .filter((p) => p.drugName.trim())
    .map((p) => ({
      drugName: p.drugName.trim(),
      dose: p.dose?.trim() || null,
      frequency: p.frequency?.trim() || null,
      durationDays: p.durationDays ?? null,
      instructions: p.instructions?.trim() || null,
    }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Write the clinical record for a visit.
 *
 * `doctorId` is the TREATING doctor; `authorId` is whoever is typing — the
 * doctor themselves, or a clinic admin entering it on their behalf.
 *
 * `appointmentId` is optional — a walk-in or a back-filled paper note has no
 * scheduling row. When given, the appointment must belong to this clinic AND to
 * this doctor (and to `patientId`, if that was given too), and it supplies the
 * branch snapshot. Recording what happened also completes a still-open
 * appointment, so the two never disagree.
 */
export async function createRecord(args: {
  clinicId: string;
  doctorId: string;
  /** The Profile writing it — the doctor, or an admin on the doctor's behalf. */
  authorId: string;
  /** Required without an appointment; with one, it must match the appointment's. */
  patientId?: string;
  appointmentId?: string | null;
  input: TreatmentRecordInput;
}): Promise<Result<{ id: string }>> {
  const invalid = validate(args.input);
  if (invalid) return err(invalid);

  // An admin picks the doctor from a list, so the id is client-supplied: make
  // sure it names a doctor of THIS clinic before filing anything against it.
  const doctor = await prisma.doctor.findFirst({
    where: { id: args.doctorId, clinicId: args.clinicId },
    select: { id: true },
  });
  if (!doctor) return err("الطبيب غير موجود في هذه العيادة");

  let branchId: string | null = null;
  let patientId = args.patientId ?? "";
  let completeAppointment = false;

  if (args.appointmentId) {
    const appt = await prisma.appointment.findFirst({
      where: { id: args.appointmentId, clinicId: args.clinicId, doctorId: args.doctorId },
      select: { id: true, patientId: true, branchId: true, status: true },
    });
    if (!appt) return err("الموعد غير موجود أو غير مصرح");
    if (args.patientId && appt.patientId !== args.patientId) {
      return err("الموعد لا يخص هذا المريض");
    }

    const existing = await prisma.treatmentRecord.findUnique({
      where: { appointmentId: appt.id },
      select: { id: true },
    });
    if (existing) return err("يوجد سجل علاجي لهذه الزيارة بالفعل");

    // The appointment is the authority on who the visit was for.
    patientId = appt.patientId;
    branchId = appt.branchId;
    completeAppointment =
      appt.status === AppointmentStatus.PENDING || appt.status === AppointmentStatus.CONFIRMED;
  } else {
    // Standalone record: the patient must at least be a member of this clinic,
    // or we'd be filing history against someone who was never treated here.
    const member = await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId: patientId, clinicId: args.clinicId } },
      select: { userId: true },
    });
    if (!member) return err("المريض ليس عضواً في هذه العيادة");
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.treatmentRecord.create({
        data: {
          clinicId: args.clinicId,
          patientId,
          doctorId: args.doctorId,
          branchId,
          appointmentId: args.appointmentId ?? null,
          visitDate: args.input.visitDate,
          chiefComplaint: args.input.chiefComplaint?.trim() || null,
          diagnosis: args.input.diagnosis?.trim() || null,
          clinicalNotes: args.input.clinicalNotes?.trim() || null,
          followUpDate: args.input.followUpDate ?? null,
          createdById: args.authorId,
          procedures: {
            create: cleanProcedures(args.input.procedures).map((p) => ({
              ...p,
              clinicId: args.clinicId,
            })),
          },
          prescriptions: {
            create: cleanPrescriptions(args.input.prescriptions).map((p) => ({
              ...p,
              clinicId: args.clinicId,
            })),
          },
        },
        select: { id: true },
      });

      return created;
    });

    // Completing the visit goes through the appointments service rather than a
    // status write of our own: completion has side effects beyond the column
    // (completedAt, and advancing an order-based queue's "now serving"), and
    // duplicating them here would leave the queue stale for exactly the visits
    // a doctor records instead of clicking "مكتمل".
    //
    // Deliberately outside the transaction above: the clinical record is the
    // thing that must not be lost. If this fails the record still stands and
    // the appointment can be completed by hand.
    if (completeAppointment && args.appointmentId) {
      await updateAppointmentStatus(args.appointmentId, AppointmentStatus.COMPLETED);
    }

    return ok({ id: record.id });
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حفظ السجل العلاجي");
  }
}

/**
 * Edit a record, appending a revision snapshot of its previous state in the
 * SAME transaction — so the audit trail cannot drift from the record. The
 * caller must already have checked that `editorId` is allowed to edit this
 * record; the clinic + doctor filter here is the second line of defence.
 *
 * Child lines are replaced wholesale rather than diffed: the form submits the
 * full list every time, and the pre-edit state is preserved in the snapshot, so
 * delete-and-recreate loses nothing.
 */
export async function updateRecord(args: {
  recordId: string;
  clinicId: string;
  /** When set, the record must belong to this doctor. Omitted for admins. */
  doctorId?: string;
  editorId: string;
  input: TreatmentRecordInput;
}): Promise<Result<void>> {
  const invalid = validate(args.input);
  if (invalid) return err(invalid);

  const current = await prisma.treatmentRecord.findFirst({
    where: {
      id: args.recordId,
      clinicId: args.clinicId,
      ...(args.doctorId ? { doctorId: args.doctorId } : {}),
    },
    include: { procedures: true, prescriptions: true },
  });
  if (!current) return err("السجل غير موجود أو غير مصرح");

  // The snapshot is display-only history, so it is stored as plain JSON with
  // Decimal/Date already stringified — it must stay readable after the model
  // changes shape.
  const snapshot = {
    visitDate: current.visitDate.toISOString(),
    chiefComplaint: current.chiefComplaint,
    diagnosis: current.diagnosis,
    clinicalNotes: current.clinicalNotes,
    followUpDate: current.followUpDate?.toISOString() ?? null,
    procedures: current.procedures.map((p) => ({
      kind: p.kind,
      name: p.name,
      note: p.note,
      cost: p.cost?.toString() ?? null,
    })),
    prescriptions: current.prescriptions.map((p) => ({
      drugName: p.drugName,
      dose: p.dose,
      frequency: p.frequency,
      durationDays: p.durationDays,
      instructions: p.instructions,
    })),
  };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.treatmentRecordRevision.create({
        data: {
          recordId: current.id,
          clinicId: args.clinicId,
          editedById: args.editorId,
          snapshot,
        },
      });

      await tx.treatmentProcedure.deleteMany({ where: { recordId: current.id } });
      await tx.prescription.deleteMany({ where: { recordId: current.id } });

      await tx.treatmentRecord.update({
        where: { id: current.id },
        data: {
          visitDate: args.input.visitDate,
          chiefComplaint: args.input.chiefComplaint?.trim() || null,
          diagnosis: args.input.diagnosis?.trim() || null,
          clinicalNotes: args.input.clinicalNotes?.trim() || null,
          followUpDate: args.input.followUpDate ?? null,
          procedures: {
            create: cleanProcedures(args.input.procedures).map((p) => ({
              ...p,
              clinicId: args.clinicId,
            })),
          },
          prescriptions: {
            create: cleanPrescriptions(args.input.prescriptions).map((p) => ({
              ...p,
              clinicId: args.clinicId,
            })),
          },
        },
      });
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث السجل العلاجي");
  }
}
