import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientAppointment {
  id: string;
  status: AppointmentStatus;
  patientNotes: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  slot: { date: Date; startTime: Date; endTime: Date };
  branch: { name: string } | null;
  doctor: { profile: { fullName: string }; specialty: string };
}

export interface AdminAppointment {
  id: string;
  doctorId: string;
  patientId: string;
  status: AppointmentStatus;
  patientNotes: string | null;
  doctorNotes: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  slot: { date: Date; startTime: Date; endTime: Date };
  branch: { name: string } | null;
  patient: { fullName: string; phone: string | null };
  doctor: { profile: { fullName: string }; specialty: string };
}

// The doctor carries its own name and links to a Specialty; keep the
// `doctor.profile.fullName` + `doctor.specialty` (name string) view shape the UI
// expects by selecting the doctor's fields and reshaping.
const doctorNameSelect = {
  select: { specialty: { select: { name: true } }, fullName: true },
} as const;
const reshapeDoctor = <
  T extends { doctor: { specialty: { name: string } | null; fullName: string } },
>(
  row: T,
) => ({
  ...row,
  doctor: {
    specialty: row.doctor.specialty?.name ?? "",
    profile: { fullName: row.doctor.fullName },
  },
});

// ─── Patient Queries ──────────────────────────────────────────────────────────

export async function getPatientAppointments(
  patientId: string,
  options?: {
    status?: AppointmentStatus;
    upcoming?: boolean;
    limit?: number;
  },
): Promise<PatientAppointment[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      patientId,
      ...(options?.upcoming
        ? {
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
            slot: { startTime: { gt: new Date() } },
          }
        : options?.status
          ? { status: options.status }
          : {}),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      branch: { select: { name: true } },
      doctor: doctorNameSelect,
    },
    orderBy: { slot: { startTime: options?.upcoming ? "asc" : "desc" } },
    ...(options?.limit ? { take: options.limit } : {}),
  });
  return rows.map(reshapeDoctor);
}

export async function getPatientStats(patientId: string) {
  const [total, upcoming, completed, cancelled] = await Promise.all([
    prisma.appointment.count({ where: { patientId } }),
    prisma.appointment.count({
      where: {
        patientId,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        slot: { startTime: { gt: new Date() } },
      },
    }),
    prisma.appointment.count({ where: { patientId, status: AppointmentStatus.COMPLETED } }),
    prisma.appointment.count({ where: { patientId, status: AppointmentStatus.CANCELLED } }),
  ]);
  return { total, upcoming, completed, cancelled };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listAppointments(
  clinicId: string,
  filters?: {
    status?: AppointmentStatus;
    doctorId?: string;
    patientId?: string;
  },
): Promise<AdminAppointment[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      clinicId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.doctorId && { doctorId: filters.doctorId }),
      ...(filters?.patientId && { patientId: filters.patientId }),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      branch: { select: { name: true } },
      patient: { select: { fullName: true, phone: true } },
      doctor: doctorNameSelect,
    },
    orderBy: { slot: { date: "desc" } },
  });
  return rows.map(reshapeDoctor);
}

/**
 * Full, authoritative detail for a single appointment — the branch, doctor,
 * fees, slot times and notes as actually persisted. Booking/reschedule tools
 * echo this back so the confirmation reflects the saved record (not the
 * agent's memory of what it asked for), letting the user catch any mistake.
 */
export async function getAppointmentDetails(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      branch: { select: { name: true, address: true } },
      doctor: {
        select: {
          fullName: true,
          specialty: { select: { name: true } },
          examinationFee: true,
          consultationFee: true,
        },
      },
    },
  });
}

// ─── Doctor Queries ───────────────────────────────────────────────────────────

export interface DoctorAppointmentView {
  id: string;
  status: AppointmentStatus;
  patientNotes: string | null;
  doctorNotes: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  slot: { date: Date; startTime: Date; endTime: Date };
  patient: { fullName: string; phone: string | null };
}

export async function getDoctorAppointments(
  doctorId: string,
  options?: { status?: AppointmentStatus; upcoming?: boolean; limit?: number },
): Promise<DoctorAppointmentView[]> {
  return prisma.appointment.findMany({
    where: {
      doctorId,
      ...(options?.upcoming
        ? {
            status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
            slot: { startTime: { gt: new Date() } },
          }
        : options?.status
          ? { status: options.status }
          : {}),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      patient: { select: { fullName: true, phone: true } },
    },
    orderBy: { slot: { startTime: options?.upcoming ? "asc" : "desc" } },
    ...(options?.limit ? { take: options.limit } : {}),
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAppointment(
  patientId: string,
  slotId: string,
  patientNotes?: string,
): Promise<Result<{ id: string }>> {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: { appointment: true, doctor: { select: { clinicId: true } } },
    });
    if (!slot) return err("الموعد غير موجود");
    if (slot.isBlocked) return err("هذا الموعد غير متاح");
    if (slot.appointment) return err("هذا الموعد محجوز بالفعل");
    if (slot.startTime < new Date()) return err("لا يمكن حجز مواعيد في الماضي");

    const appointment = await prisma.appointment.create({
      data: {
        clinicId: slot.doctor.clinicId,
        branchId: slot.branchId, // snapshot the slot's branch onto the appointment
        patientId,
        doctorId: slot.doctorId,
        slotId,
        status: AppointmentStatus.PENDING,
        patientNotes: patientNotes ?? null,
      },
    });
    return ok({ id: appointment.id });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return err("هذا الموعد محجوز بالفعل");
    }
    return err(e instanceof Error ? e.message : "فشل حجز الموعد");
  }
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  cancellationReason?: string,
): Promise<Result<void>> {
  try {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        status,
        ...(status === AppointmentStatus.CANCELLED && {
          cancelledAt: new Date(),
          cancellationReason: cancellationReason ?? null,
        }),
      },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة الموعد");
  }
}
