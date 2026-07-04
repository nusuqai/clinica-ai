import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import type { AppointmentStatus } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientAppointment {
  id: string;
  status: AppointmentStatus;
  patientNotes: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  slot: { date: Date; startTime: Date; endTime: Date };
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
  patient: { fullName: string };
  doctor: { profile: { fullName: string }; specialty: string };
}

// ─── Patient Queries ──────────────────────────────────────────────────────────

export async function getPatientAppointments(
  patientId: string,
  options?: {
    status?: AppointmentStatus;
    upcoming?: boolean;
    limit?: number;
  },
): Promise<PatientAppointment[]> {
  return prisma.appointment.findMany({
    where: {
      patientId,
      ...(options?.upcoming
        ? {
            status: { in: ["PENDING", "CONFIRMED"] },
            slot: { startTime: { gt: new Date() } },
          }
        : options?.status
          ? { status: options.status }
          : {}),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      doctor: {
        select: {
          specialty: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { slot: { startTime: options?.upcoming ? "asc" : "desc" } },
    ...(options?.limit ? { take: options.limit } : {}),
  });
}

export async function getPatientStats(patientId: string) {
  const [total, upcoming, completed, cancelled] = await Promise.all([
    prisma.appointment.count({ where: { patientId } }),
    prisma.appointment.count({
      where: {
        patientId,
        status: { in: ["PENDING", "CONFIRMED"] },
        slot: { startTime: { gt: new Date() } },
      },
    }),
    prisma.appointment.count({ where: { patientId, status: "COMPLETED" } }),
    prisma.appointment.count({ where: { patientId, status: "CANCELLED" } }),
  ]);
  return { total, upcoming, completed, cancelled };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function listAppointments(filters?: {
  status?: AppointmentStatus;
  doctorId?: string;
  patientId?: string;
}): Promise<AdminAppointment[]> {
  return prisma.appointment.findMany({
    where: {
      ...(filters?.status && { status: filters.status }),
      ...(filters?.doctorId && { doctorId: filters.doctorId }),
      ...(filters?.patientId && { patientId: filters.patientId }),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      patient: { select: { fullName: true } },
      doctor: {
        select: {
          specialty: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { slot: { date: "desc" } },
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
            status: { in: ["PENDING", "CONFIRMED"] },
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
      include: { appointment: true },
    });
    if (!slot) return err("الموعد غير موجود");
    if (slot.isBlocked) return err("هذا الموعد غير متاح");
    if (slot.appointment) return err("هذا الموعد محجوز بالفعل");
    if (slot.startTime < new Date()) return err("لا يمكن حجز مواعيد في الماضي");

    const appointment = await prisma.appointment.create({
      data: {
        patientId,
        doctorId: slot.doctorId,
        slotId,
        status: "PENDING",
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
        ...(status === "CANCELLED" && {
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
