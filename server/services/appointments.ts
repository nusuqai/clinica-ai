import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus, AvailabilityMode } from "@prisma/client";
import { advanceQueueOnComplete, estimateWaitMinutes } from "./queue";
import { expectedOrderTime } from "@/lib/availability/queue-time";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientAppointment {
  id: string;
  status: AppointmentStatus;
  patientNotes: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  slot: { date: Date; startTime: Date; endTime: Date } | null;
  branch: { name: string } | null;
  doctor: { profile: { fullName: string }; specialty: string };
  // Order-based (queue) fields — null for slot-based bookings.
  orderNumber: number | null;
  bookingDate: Date | null;
  estimatedDurationMin: number | null;
  isOrderBased: boolean;
  currentOrder: number | null; // null when tracking is off (or slot-based)
  estimatedWaitMin: number | null;
  expectedTime: string | null; // "HH:MM" — order-based expected examination time
}

// Shared "upcoming" filter that covers both slot-based (future slot) and
// order-based (booking date today or later) appointments.
function upcomingAppointmentWhere() {
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return {
    status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
    OR: [
      { slot: { startTime: { gt: now } } },
      { bookingDate: { gte: today } },
    ],
  };
}

// Fields fetched to render an appointment's queue info (order-based bookings).
const queueInfoInclude = {
  rule: { select: { mode: true, startTime: true } },
  queue: { select: { currentOrder: true, trackCurrentOrder: true } },
} as const;

type WithQueueInfo = {
  orderNumber: number | null;
  bookingDate: Date | null;
  estimatedDurationMin: number | null;
  rule: { mode: AvailabilityMode; startTime: string } | null;
  queue: { currentOrder: number; trackCurrentOrder: boolean } | null;
};

// Derives the display-facing queue fields (isOrderBased, live current order,
// estimated wait, expected examination time) from the persisted appointment +
// queue snapshot.
function queueView(row: WithQueueInfo) {
  const isOrderBased =
    row.rule?.mode === AvailabilityMode.ORDER_BASED || row.orderNumber != null;
  const tracking = row.queue?.trackCurrentOrder ?? false;
  const currentOrder = isOrderBased && tracking ? (row.queue?.currentOrder ?? 0) : null;
  const estimatedWaitMin =
    isOrderBased && tracking && row.orderNumber != null
      ? estimateWaitMinutes(row.orderNumber, currentOrder ?? 0, row.estimatedDurationMin)
      : null;
  const expectedTime =
    isOrderBased && row.orderNumber != null && row.rule?.startTime
      ? expectedOrderTime(row.rule.startTime, row.orderNumber, row.estimatedDurationMin)
      : null;
  return {
    orderNumber: row.orderNumber,
    bookingDate: row.bookingDate,
    estimatedDurationMin: row.estimatedDurationMin,
    isOrderBased,
    currentOrder,
    estimatedWaitMin,
    expectedTime,
  };
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
  slot: { date: Date; startTime: Date; endTime: Date } | null;
  branch: { name: string } | null;
  patient: { fullName: string; phone: string | null };
  doctor: { profile: { fullName: string }; specialty: string };
  orderNumber: number | null;
  bookingDate: Date | null;
  isOrderBased: boolean;
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
        ? upcomingAppointmentWhere()
        : options?.status
          ? { status: options.status }
          : {}),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      branch: { select: { name: true } },
      doctor: doctorNameSelect,
      ...queueInfoInclude,
    },
    orderBy: [
      { slot: { startTime: options?.upcoming ? "asc" : "desc" } },
      { bookingDate: options?.upcoming ? "asc" : "desc" },
    ],
    ...(options?.limit ? { take: options.limit } : {}),
  });
  return rows.map((row) => ({ ...reshapeDoctor(row), ...queueView(row) }));
}

export async function getPatientStats(patientId: string) {
  const [total, upcoming, completed, cancelled] = await Promise.all([
    prisma.appointment.count({ where: { patientId } }),
    prisma.appointment.count({
      where: { patientId, ...upcomingAppointmentWhere() },
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
      ...queueInfoInclude,
    },
    orderBy: [{ slot: { date: "desc" } }, { bookingDate: "desc" }],
  });
  return rows.map((row) => {
    const q = queueView(row);
    return {
      ...reshapeDoctor(row),
      orderNumber: q.orderNumber,
      bookingDate: q.bookingDate,
      isOrderBased: q.isOrderBased,
    };
  });
}

/**
 * Full, authoritative detail for a single appointment — the branch, doctor,
 * fees, slot times and notes as actually persisted. Booking/reschedule tools
 * echo this back so the confirmation reflects the saved record (not the
 * agent's memory of what it asked for), letting the user catch any mistake.
 */
export async function getAppointmentDetails(appointmentId: string) {
  const row = await prisma.appointment.findUnique({
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
      ...queueInfoInclude,
    },
  });
  if (!row) return null;
  return { ...row, ...queueView(row) };
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
  slot: { date: Date; startTime: Date; endTime: Date } | null;
  patient: { fullName: string; phone: string | null };
  orderNumber: number | null;
  bookingDate: Date | null;
  isOrderBased: boolean;
  currentOrder: number | null;
  estimatedWaitMin: number | null;
  estimatedDurationMin: number | null;
}

export async function getDoctorAppointments(
  doctorId: string,
  options?: { status?: AppointmentStatus; upcoming?: boolean; limit?: number },
): Promise<DoctorAppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      doctorId,
      ...(options?.upcoming
        ? upcomingAppointmentWhere()
        : options?.status
          ? { status: options.status }
          : {}),
    },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      patient: { select: { fullName: true, phone: true } },
      ...queueInfoInclude,
    },
    orderBy: [
      { slot: { startTime: options?.upcoming ? "asc" : "desc" } },
      { bookingDate: options?.upcoming ? "asc" : "desc" },
    ],
    ...(options?.limit ? { take: options.limit } : {}),
  });
  return rows.map((row) => ({ ...row, ...queueView(row) }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAppointment(
  patientId: string,
  slotId: string,
  patientNotes?: string,
  opts?: { excludeAppointmentId?: string },
): Promise<Result<{ id: string }>> {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: { appointment: true, doctor: { select: { clinicId: true } } },
    });
    if (!slot) return err("الموعد غير موجود");
    if (slot.isBlocked) return err("هذا الموعد غير متاح");
    if (slot.referralOnly)
      return err("هذا الموعد مخصّص للتحويلات من الأطباء ولا يمكن حجزه مباشرةً");
    if (slot.appointment) return err("هذا الموعد محجوز بالفعل");
    if (slot.startTime < new Date()) return err("لا يمكن حجز مواعيد في الماضي");

    // Block a second open booking with the same doctor: the patient must finish
    // (or cancel) an existing PENDING/CONFIRMED appointment first. Reschedule
    // passes excludeAppointmentId so the booking it's replacing doesn't self-block.
    const active = await prisma.appointment.findFirst({
      where: {
        patientId,
        doctorId: slot.doctorId,
        status: {
          in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
        },
        ...(opts?.excludeAppointmentId
          ? { id: { not: opts.excludeAppointmentId } }
          : {}),
      },
      select: { id: true },
    });
    if (active)
      return err(
        "لديك حجز قائم مع هذا الطبيب لم يكتمل بعد. يرجى إتمامه أو إلغاؤه قبل حجز موعد جديد.",
      );

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

/**
 * Book a patient into a slot as a referral made by a doctor. Unlike
 * createAppointment, this is allowed to target referral-only slots (that is
 * their purpose). The referring doctor is recorded on the appointment.
 */
export async function referAppointment(
  referringDoctorId: string,
  patientId: string,
  slotId: string,
  notes?: string,
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
    if (slot.doctorId === referringDoctorId)
      return err("لا يمكن تحويل المريض إلى نفس الطبيب");

    const appointment = await prisma.appointment.create({
      data: {
        clinicId: slot.doctor.clinicId,
        branchId: slot.branchId, // snapshot the slot's branch onto the appointment
        patientId,
        doctorId: slot.doctorId,
        referredByDoctorId: referringDoctorId,
        slotId,
        status: AppointmentStatus.PENDING,
        patientNotes: notes ?? null,
      },
    });
    return ok({ id: appointment.id });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return err("هذا الموعد محجوز بالفعل");
    }
    return err(e instanceof Error ? e.message : "فشل تحويل الموعد");
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
        ...(status === AppointmentStatus.CONFIRMED && { confirmedAt: new Date() }),
        // completedAt anchors the post-visit feedback delay (the automation
        // sweep sends "delayMinutes after completion").
        ...(status === AppointmentStatus.COMPLETED && { completedAt: new Date() }),
        ...(status === AppointmentStatus.CANCELLED && {
          cancelledAt: new Date(),
          cancellationReason: cancellationReason ?? null,
        }),
      },
    });
    // Completing an order-based appointment advances the queue's "now serving".
    if (status === AppointmentStatus.COMPLETED) {
      await advanceQueueOnComplete(appointmentId);
    }
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث حالة الموعد");
  }
}
