import "server-only";
import { ClinicKind, type DoctorTitle, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";

// Solo-doctor clinics (Clinic.kind = SOLO_DOCTOR).
//
// The flag is presentation only: the solo doctor is an ordinary Doctor row, so
// a clinic can go SOLO_DOCTOR → CENTER by flipping the flag. Two rules keep that
// switch safe and are enforced here:
//   1. A solo clinic has at most ONE active doctor (createDoctor /
//      createDoctorAccount / setDoctorActive call assertCanActivateDoctor).
//   2. That doctor always has a specialty — the solo UI hides specialties, but a
//      later switch to CENTER needs one for the landing filters and the agent.

export const SOLO_DOCTOR_LIMIT_ERROR =
  "هذه عيادة طبيب واحد ولا يمكن إضافة أو تفعيل طبيب آخر. تواصل مع إدارة المنصة لتحويلها إلى مركز طبي.";
export const SOLO_SPECIALTY_REQUIRED_ERROR = "التخصص مطلوب لطبيب العيادة";

type Tx = Prisma.TransactionClient;

export async function getClinicKind(clinicId: string, db: Tx = prisma): Promise<ClinicKind> {
  const clinic = await db.clinic.findUnique({ where: { id: clinicId }, select: { kind: true } });
  return clinic?.kind ?? ClinicKind.CENTER;
}

export async function isSoloClinic(clinicId: string, db: Tx = prisma): Promise<boolean> {
  return (await getClinicKind(clinicId, db)) === ClinicKind.SOLO_DOCTOR;
}

/**
 * Inside a transaction: refuses to add/activate a doctor when the clinic is
 * solo and already has an active doctor (other than `exceptDoctorId`). Locks
 * the clinic row first so two concurrent creates can't both pass the count.
 * Returns an error message, or null when allowed.
 */
export async function assertCanActivateDoctor(
  tx: Tx,
  clinicId: string,
  exceptDoctorId?: string
): Promise<string | null> {
  await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${clinicId}::uuid FOR UPDATE`;
  if (!(await isSoloClinic(clinicId, tx))) return null;
  const active = await tx.doctor.count({
    where: {
      clinicId,
      isActive: true,
      ...(exceptDoctorId ? { id: { not: exceptDoctorId } } : {}),
    },
  });
  return active > 0 ? SOLO_DOCTOR_LIMIT_ERROR : null;
}

export async function countActiveDoctors(clinicId: string): Promise<number> {
  return prisma.doctor.count({ where: { clinicId, isActive: true } });
}

/** Thrown inside a transaction to roll it back with a user-facing message. */
export class SoloDoctorError extends Error {}

export type SoloDoctor = {
  id: string;
  fullName: string;
  title: DoctorTitle | null;
  specialty: string | null;
  qualifications: string | null;
  expertiseAreas: string | null;
  bio: string | null;
  yearsOfExperience: number | null;
  examinationFee: number | null;
  consultationFee: number | null;
  requiresAdvanceBooking: boolean;
  acceptsChildren: boolean;
  branches: { id: string; name: string; address: string | null }[];
};

/** The solo clinic's one active doctor, in a shape safe to pass to the client. */
export async function getSoloDoctor(clinicId: string): Promise<SoloDoctor | null> {
  const d = await prisma.doctor.findFirst({
    where: { clinicId, isActive: true },
    orderBy: { fullName: "asc" },
    include: {
      specialty: { select: { name: true } },
      branches: {
        where: { branch: { isActive: true } },
        include: { branch: { select: { id: true, name: true, address: true, isMain: true } } },
      },
    },
  });
  if (!d) return null;
  return {
    id: d.id,
    fullName: d.fullName,
    title: d.title,
    specialty: d.specialty?.name ?? null,
    qualifications: d.qualifications,
    expertiseAreas: d.expertiseAreas,
    bio: d.bio,
    yearsOfExperience: d.yearsOfExperience,
    examinationFee: d.examinationFee == null ? null : Number(d.examinationFee),
    consultationFee: d.consultationFee == null ? null : Number(d.consultationFee),
    requiresAdvanceBooking: d.requiresAdvanceBooking,
    acceptsChildren: d.acceptsChildren,
    branches: d.branches
      .map((db) => db.branch)
      .sort((a, b) => Number(b.isMain) - Number(a.isMain))
      .map(({ id, name, address }) => ({ id, name, address })),
  };
}

/**
 * Platform admin: switch a clinic's kind. → SOLO_DOCTOR needs exactly one
 * active doctor who has a specialty; → CENTER always works.
 */
export async function setClinicKind(clinicId: string, kind: ClinicKind): Promise<Result<void>> {
  try {
    const msg = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM clinics WHERE id = ${clinicId}::uuid FOR UPDATE`;
      if (kind === ClinicKind.SOLO_DOCTOR) {
        const active = await tx.doctor.findMany({
          where: { clinicId, isActive: true },
          select: { specialtyId: true },
        });
        if (active.length > 1)
          return `لا يمكن التحويل إلى عيادة طبيب واحد: يوجد ${active.length} أطباء مفعّلين. أوقف الأطباء الآخرين أولاً.`;
        if (active.length === 1 && !active[0].specialtyId)
          return "حدّد تخصص الطبيب أولاً قبل التحويل إلى عيادة طبيب واحد.";
      }
      const res = await tx.clinic.updateMany({ where: { id: clinicId }, data: { kind } });
      return res.count === 0 ? "العيادة غير موجودة" : null;
    });
    return msg ? err(msg) : ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تغيير نوع العيادة");
  }
}
