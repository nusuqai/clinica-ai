import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, canAny, getClinicContext } from "@/lib/auth";
import { isDashboardRole } from "@/lib/permissions";
import { inBranchScope } from "@/lib/branch-scope";

// THE access rules for a single appointment's detail page, in one place so the
// doctor, admin and patient routes cannot drift apart. Kept out of any
// "use server" module on purpose: everything exported from one becomes a
// callable endpoint, and an authorization helper has no business being one.
//
// The clinic always comes from the request host, so a patient signed in at
// demo.clinica-ai.nusuqai.com is authorized against demo's appointments only.

export type AppointmentViewAccess =
  | {
      ok: true;
      clinicId: string;
      role: Role;
      viewerId: string;
      /** May write the clinical side: the record and the visit attachments. */
      canEdit: boolean;
      /** May see the clinical side at all. False only for staff who manage
          appointments but not medical records. */
      canViewRecords: boolean;
    }
  | { ok: false; error: string };

/**
 * Authorizes a READ of one appointment's full page.
 *
 *   ADMIN   — any appointment in their clinic; may edit (file/attach).
 *   STAFF   — given "medical_records": any appointment, with the clinical side
 *             (record + attachments). Given only "appointments": appointments
 *             in their own branches, booking details only.
 *   DOCTOR  — only their own appointments here; may edit.
 *   PATIENT — only their own appointments; read-only (canEdit = false).
 */
export async function authorizeAppointmentView(
  appointmentId: string
): Promise<AppointmentViewAccess> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "غير مصرح" };

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinic.id },
    select: {
      id: true,
      patientId: true,
      branchId: true,
      doctor: { select: { profileId: true } },
    },
  });
  if (!appt) return { ok: false, error: "الموعد غير موجود" };

  if (isDashboardRole(ctx.role)) {
    // "medical_records" is clinic-wide (a patient's full history, any branch),
    // so it opens any visit. "appointments" alone is held to the member's
    // branches — same "not found" as a missing row, so nothing is revealed.
    const records = can(ctx, "medical_records");
    const viaAppointments = can(ctx, "appointments") && inBranchScope(ctx.branchIds, appt.branchId);
    if (!records && !viaAppointments) {
      return {
        ok: false,
        error: canAny(ctx, ["appointments", "medical_records"]) ? "الموعد غير موجود" : "غير مصرح",
      };
    }
    return {
      ok: true,
      clinicId: ctx.clinic.id,
      role: ctx.role,
      viewerId: ctx.user.id,
      canEdit: records,
      canViewRecords: records,
    };
  }

  if (ctx.role === Role.PATIENT) {
    if (appt.patientId !== ctx.user.id) return { ok: false, error: "غير مصرح" };
    return {
      ok: true,
      clinicId: ctx.clinic.id,
      role: ctx.role,
      viewerId: ctx.user.id,
      canEdit: false,
      canViewRecords: true,
    };
  }

  if (ctx.role === Role.DOCTOR) {
    if (appt.doctor.profileId !== ctx.user.id) return { ok: false, error: "غير مصرح" };
    return {
      ok: true,
      clinicId: ctx.clinic.id,
      role: ctx.role,
      viewerId: ctx.user.id,
      canEdit: true,
      canViewRecords: true,
    };
  }

  return { ok: false, error: "غير مصرح" };
}

export type AppointmentStaffWrite =
  { ok: true; clinicId: string; userId: string; role: Role } | { ok: false; error: string };

/**
 * Authorizes a staff WRITE against an appointment (uploading or deleting a visit
 * attachment). ADMIN — and STAFF holding "medical_records" — may write on any
 * appointment in their clinic; a DOCTOR only on their own. Patients never write
 * attachments.
 */
export async function authorizeAppointmentStaffWrite(
  appointmentId: string
): Promise<AppointmentStaffWrite> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "غير مصرح" };

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinic.id },
    select: { id: true, doctor: { select: { profileId: true } } },
  });
  if (!appt) return { ok: false, error: "الموعد غير موجود" };

  if (can(ctx, "medical_records")) {
    return { ok: true, clinicId: ctx.clinic.id, userId: ctx.user.id, role: ctx.role };
  }

  if (ctx.role === Role.DOCTOR && appt.doctor.profileId === ctx.user.id) {
    return { ok: true, clinicId: ctx.clinic.id, userId: ctx.user.id, role: ctx.role };
  }

  return { ok: false, error: "غير مصرح" };
}
