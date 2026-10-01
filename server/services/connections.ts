import "server-only";
import { ConnectionRelation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import { type Result, ok, err } from "./_result";
import {
  createPhonelessPatient,
  getOrCreatePatientByPhone,
  isSyntheticEmail,
} from "@/server/services/patients";

// Guardian → dependent links (PatientConnection): the relatives a patient books
// for. A link is stored once, as "guardian books for dependent", and is
// clinic-scoped: a link made at another clinic never shows here.

export interface ConnectionView {
  id: string;
  /** What `other` (the dependent) is to the guardian. */
  relation: ConnectionRelation;
  other: { id: string; fullName: string; phone: string | null };
  canBook: boolean;
  canViewRecords: boolean;
  revokedAt: Date | null;
  createdAt: Date;
  /** `other`'s appointments at this clinic. */
  otherAppointmentCount: number;
}

const personSelect = { select: { id: true, fullName: true, phone: true } } as const;

/** The people this profile books for in this clinic, active first, newest first. */
export async function listPatientConnections(
  clinicId: string,
  profileId: string
): Promise<ConnectionView[]> {
  const rows = await prisma.patientConnection.findMany({
    where: { clinicId, guardianId: profileId },
    include: { dependent: personSelect },
    orderBy: { createdAt: "desc" },
  });
  if (rows.length === 0) return [];

  const counts = await prisma.appointment.groupBy({
    by: ["patientId"],
    where: { clinicId, patientId: { in: rows.map((r) => r.dependentId) } },
    _count: { _all: true },
  });
  const countByPatient = new Map(counts.map((c) => [c.patientId, c._count._all]));

  return rows
    .map((row) => ({
      id: row.id,
      relation: row.relation,
      other: row.dependent,
      canBook: row.canBook,
      canViewRecords: row.canViewRecords,
      revokedAt: row.revokedAt,
      createdAt: row.createdAt,
      otherAppointmentCount: countByPatient.get(row.dependentId) ?? 0,
    }))
    .sort((a, b) => Number(a.revokedAt !== null) - Number(b.revokedAt !== null));
}

/** Active dependents the guardian may book for in this clinic. */
export async function listBookableDependents(clinicId: string, guardianId: string) {
  const rows = await prisma.patientConnection.findMany({
    where: { clinicId, guardianId, revokedAt: null, canBook: true },
    include: { dependent: personSelect },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    relation: r.relation,
    canViewRecords: r.canViewRecords,
    ...r.dependent,
  }));
}

/** True when the guardian holds an active, booking-enabled link to the dependent. */
export async function canBookFor(
  clinicId: string,
  guardianId: string,
  dependentId: string
): Promise<boolean> {
  const link = await prisma.patientConnection.findUnique({
    where: { clinicId_guardianId_dependentId: { clinicId, guardianId, dependentId } },
    select: { revokedAt: true, canBook: true },
  });
  return !!link && link.revokedAt === null && link.canBook;
}

/**
 * True when the guardian holds an active link to the dependent that includes
 * reading their treatment records (and so their visits and attachments).
 */
export async function canViewRecordsOf(
  clinicId: string,
  guardianId: string,
  dependentId: string
): Promise<boolean> {
  const link = await prisma.patientConnection.findUnique({
    where: { clinicId_guardianId_dependentId: { clinicId, guardianId, dependentId } },
    select: { revokedAt: true, canViewRecords: true },
  });
  return !!link && link.revokedAt === null && link.canViewRecords;
}

/** Validates and normalizes a phone typed by a user; null when it's not usable. */
function parsePhone(raw: string): string | null {
  const phone = normalizePhone(raw);
  return isValidPhone(phone) ? phone : null;
}

const INVALID_PHONE = "رقم الهاتف غير صحيح — اكتبه بالصيغة الدولية مثل 201014443991";

/**
 * Add a relative the guardian books for. Creates the relative's account when
 * needed: keyed by their WhatsApp number when one is given (an existing account
 * with that number is linked rather than duplicated), otherwise a phoneless
 * account. Re-adding a previously revoked relative restores the same link.
 *
 * The guardian may read the relative's treatment records only when this call
 * created the relative's account — knowing someone's phone number must not be
 * enough to open the medical history of an account they already had.
 */
export async function addDependent(args: {
  clinicId: string;
  guardianId: string;
  fullName: string;
  relation: ConnectionRelation;
  phone?: string | null;
}): Promise<Result<{ dependentId: string; created: boolean }>> {
  const fullName = args.fullName.trim();
  if (!fullName) return err("الاسم مطلوب");

  let dependentId: string;
  let created: boolean;

  if (args.phone?.trim()) {
    const phone = parsePhone(args.phone);
    if (!phone) return err(INVALID_PHONE);
    const guardian = await prisma.profile.findUnique({
      where: { id: args.guardianId },
      select: { phone: true },
    });
    if (guardian?.phone === phone) return err("هذا رقمك أنت — أدخل رقم واتساب الشخص الذي تحجز له");
    const res = await getOrCreatePatientByPhone({
      clinicId: args.clinicId,
      phone,
      name: fullName,
    });
    dependentId = res.profileId;
    created = res.created;
  } else {
    // No phone to dedupe on: reuse a relative this guardian already added under
    // the same name, so a repeated request doesn't create a second account.
    const existing = await prisma.patientConnection.findFirst({
      where: {
        clinicId: args.clinicId,
        guardianId: args.guardianId,
        dependent: { fullName: { equals: fullName, mode: "insensitive" } },
      },
      select: { dependentId: true },
    });
    if (existing) {
      dependentId = existing.dependentId;
      created = false;
    } else {
      dependentId = (await createPhonelessPatient({ clinicId: args.clinicId, name: fullName }))
        .profileId;
      created = true;
    }
  }

  if (dependentId === args.guardianId) return err("لا يمكنك إضافة نفسك");

  await prisma.patientConnection.upsert({
    where: {
      clinicId_guardianId_dependentId: {
        clinicId: args.clinicId,
        guardianId: args.guardianId,
        dependentId,
      },
    },
    update: { revokedAt: null, relation: args.relation },
    create: {
      clinicId: args.clinicId,
      guardianId: args.guardianId,
      dependentId,
      relation: args.relation,
      canViewRecords: created,
    },
  });
  return ok({ dependentId, created });
}

/**
 * Set (or change) the WhatsApp number of a relative the guardian books for, so
 * the relative can message the clinic and get reminders directly. Only allowed
 * while the relative's account is still the unclaimed one made on their behalf —
 * a relative who has their own login manages their own number.
 */
export async function setDependentPhone(args: {
  clinicId: string;
  guardianId: string;
  dependentId: string;
  phone: string;
}): Promise<Result<{ phone: string }>> {
  if (!(await canBookFor(args.clinicId, args.guardianId, args.dependentId)))
    return err("هذا الشخص ليس من الأشخاص الذين تحجز لهم");

  const phone = parsePhone(args.phone);
  if (!phone) return err(INVALID_PHONE);

  const { data } = await createAdminClient().auth.admin.getUserById(args.dependentId);
  if (!isSyntheticEmail(data?.user?.email))
    return err("لدى هذا الشخص حساب خاص به، ويمكنه تعديل رقمه بنفسه");

  const owner = await prisma.profile.findUnique({ where: { phone }, select: { id: true } });
  if (owner && owner.id !== args.dependentId) return err("هذا الرقم مسجّل لحساب آخر بالفعل");

  await prisma.profile.update({ where: { id: args.dependentId }, data: { phone } });
  return ok({ phone });
}
