import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicContext } from "@/lib/auth";
import { canViewRecordsOf } from "@/server/services/connections";

// THE access rules for a single appointment's detail page, in one place so the
// doctor, admin and patient routes cannot drift apart. Kept out of any
// "use server" module on purpose: everything exported from one becomes a
// callable endpoint, and an authorization helper has no business being one.
//
// The clinic always comes from the request host, so a patient signed in at
// demo.clinica-ai.nusuqai.com is authorized against demo's appointments only.

export type AppointmentViewAccess =
  | { ok: true; clinicId: string; role: Role; viewerId: string; canEdit: boolean }
  | { ok: false; error: string };

/**
 * Authorizes a READ of one appointment's full page.
 *
 *   ADMIN   — any appointment in their clinic; may edit (file/attach).
 *   DOCTOR  — only their own appointments here; may edit.
 *   PATIENT — their own appointments, and those of relatives whose records they
 *             may read (PatientConnection.canViewRecords); read-only.
 */
export async function authorizeAppointmentView(
  appointmentId: string
): Promise<AppointmentViewAccess> {
  const ctx = await getClinicContext();
  if (!ctx) return { ok: false, error: "غير مصرح" };

  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId: ctx.clinic.id },
    select: { id: true, patientId: true, doctor: { select: { profileId: true } } },
  });
  if (!appt) return { ok: false, error: "الموعد غير موجود" };

  if (ctx.role === Role.ADMIN) {
    return {
      ok: true,
      clinicId: ctx.clinic.id,
      role: ctx.role,
      viewerId: ctx.user.id,
      canEdit: true,
    };
  }

  if (ctx.role === Role.PATIENT) {
    const allowed =
      appt.patientId === ctx.user.id ||
      (await canViewRecordsOf(ctx.clinic.id, ctx.user.id, appt.patientId));
    if (!allowed) return { ok: false, error: "غير مصرح" };
    return {
      ok: true,
      clinicId: ctx.clinic.id,
      role: ctx.role,
      viewerId: ctx.user.id,
      canEdit: false,
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
    };
  }

  return { ok: false, error: "غير مصرح" };
}

export type AppointmentStaffWrite =
  { ok: true; clinicId: string; userId: string; role: Role } | { ok: false; error: string };

/**
 * Authorizes a staff WRITE against an appointment (uploading or deleting a visit
 * attachment). ADMIN may write on any appointment in their clinic; a DOCTOR only
 * on their own. Patients never write attachments.
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

  if (ctx.role === Role.ADMIN) {
    return { ok: true, clinicId: ctx.clinic.id, userId: ctx.user.id, role: ctx.role };
  }

  if (ctx.role === Role.DOCTOR && appt.doctor.profileId === ctx.user.id) {
    return { ok: true, clinicId: ctx.clinic.id, userId: ctx.user.id, role: ctx.role };
  }

  return { ok: false, error: "غير مصرح" };
}
