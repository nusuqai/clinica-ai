import "server-only";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus, AvailabilityMode } from "@prisma/client";
import { advanceQueueOnComplete, estimateWaitMinutes } from "./queue";
import { expectedOrderTime } from "@/lib/availability/queue-time";
import { isQueueMode } from "@/lib/availability/modes";
import { paginate, type PageRequest, type Paginated } from "@/lib/pagination";
import type { Prisma } from "@prisma/client";

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
  isOrderBased: boolean; // true for any queue booking (order or arrival)
  arrivalBased: boolean; // arrival-priority (أسبقية الحضور): number assigned at check-in
  arrived: boolean; // arrival-priority: whether the patient has been checked in yet
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
    OR: [{ slot: { startTime: { gt: now } } }, { bookingDate: { gte: today } }],
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
  arrivedAt: Date | null;
  rule: { mode: AvailabilityMode; startTime: string } | null;
  queue: { currentOrder: number; trackCurrentOrder: boolean } | null;
};

// Derives the display-facing queue fields (isOrderBased, live current order,
// estimated wait, expected examination time) from the persisted appointment +
// queue snapshot.
function queueView(row: WithQueueInfo) {
  // A queue booking is one whose rule is a queue mode, or (defensively) any row
  // that carries an order number. Arrival-priority reservations have no order
  // number until check-in, so lean on the rule mode to classify them.
  const isOrderBased = isQueueMode(row.rule?.mode) || row.orderNumber != null;
  const arrivalBased = row.rule?.mode === AvailabilityMode.ARRIVAL_BASED;
  const arrived = row.arrivedAt != null;
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
    arrivalBased,
    arrived,
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
  arrivalBased: boolean;
  arrived: boolean;
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
  row: T
) => ({
  ...row,
  doctor: {
    specialty: row.doctor.specialty?.name ?? "",
    profile: { fullName: row.doctor.fullName },
  },
});

// ─── Patient Queries ──────────────────────────────────────────────────────────

// `clinicId` scopes a patient's appointments to one clinic. A Profile can be a
// patient at several clinics, so every patient-facing page passes the host's
// clinic — otherwise demo's dashboard would list another clinic's bookings too.
// Patient-history ordering for a paged list: newest visit first, stable on ties.
const pastOrder: Prisma.AppointmentOrderByWithRelationInput[] = [
  { slot: { startTime: "desc" } },
  { bookingDate: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
];

/** One page of a patient's appointments in a clinic with the given status. */
export async function getPatientAppointmentsPage(
  patientId: string,
  clinicId: string,
  status: AppointmentStatus,
  req: PageRequest
): Promise<Paginated<PatientAppointment>> {
  const where = { patientId, clinicId, status };
  return paginate(
    req,
    async (args) => {
      const rows = await prisma.appointment.findMany({
        where,
        include: {
          slot: { select: { date: true, startTime: true, endTime: true } },
          branch: { select: { name: true } },
          doctor: doctorNameSelect,
          ...queueInfoInclude,
        },
        orderBy: pastOrder,
        ...args,
      });
      return rows.map((row) => ({ ...reshapeDoctor(row), ...queueView(row) }));
    },
    () => prisma.appointment.count({ where })
  );
}

export async function getPatientAppointments(
  patientId: string,
  options?: {
    clinicId?: string;
    status?: AppointmentStatus;
    upcoming?: boolean;
    limit?: number;
  }
): Promise<PatientAppointment[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      patientId,
      ...(options?.clinicId ? { clinicId: options.clinicId } : {}),
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

export async function getPatientStats(patientId: string, clinicId?: string) {
  const scope = { patientId, ...(clinicId ? { clinicId } : {}) };
  const [total, upcoming, completed, cancelled] = await Promise.all([
    prisma.appointment.count({ where: scope }),
    prisma.appointment.count({
      where: { ...scope, ...upcomingAppointmentWhere() },
    }),
    prisma.appointment.count({ where: { ...scope, status: AppointmentStatus.COMPLETED } }),
    prisma.appointment.count({ where: { ...scope, status: AppointmentStatus.CANCELLED } }),
  ]);
  return { total, upcoming, completed, cancelled };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export interface AppointmentFilters {
  status?: AppointmentStatus;
  doctorId?: string;
  patientId?: string;
  /** Patient name contains (case-insensitive). */
  patientQuery?: string;
  /** "YYYY-MM-DD": the visit day — slot date, or booking date for queue bookings. */
  date?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Filters arrive from the URL and from client actions: ignore malformed values
// rather than let Prisma throw on a non-UUID or an unknown status.
function appointmentWhere(
  clinicId: string,
  f: AppointmentFilters = {}
): Prisma.AppointmentWhereInput {
  const day = f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? new Date(f.date) : null;
  const status = f.status && f.status in AppointmentStatus ? f.status : undefined;
  return {
    clinicId,
    ...(status && { status }),
    ...(f.doctorId && UUID_RE.test(f.doctorId) && { doctorId: f.doctorId }),
    ...(f.patientId && UUID_RE.test(f.patientId) && { patientId: f.patientId }),
    ...(f.patientQuery?.trim() && {
      patient: { fullName: { contains: f.patientQuery.trim(), mode: "insensitive" as const } },
    }),
    ...(day && { OR: [{ slot: { date: day } }, { bookingDate: day }] }),
  };
}

/** One page of a clinic's appointments, newest visit first. */
export async function listAppointments(
  clinicId: string,
  filters: AppointmentFilters,
  req: PageRequest
): Promise<Paginated<AdminAppointment>> {
  const where = appointmentWhere(clinicId, filters);
  return paginate(
    req,
    async (args) => {
      const rows = await prisma.appointment.findMany({
        where,
        include: {
          slot: { select: { date: true, startTime: true, endTime: true } },
          branch: { select: { name: true } },
          patient: { select: { fullName: true, phone: true } },
          doctor: doctorNameSelect,
          ...queueInfoInclude,
        },
        orderBy: [
          { slot: { date: "desc" } },
          { bookingDate: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
        ...args,
      });
      return rows.map((row) => {
        const q = queueView(row);
        return {
          ...reshapeDoctor(row),
          orderNumber: q.orderNumber,
          bookingDate: q.bookingDate,
          isOrderBased: q.isOrderBased,
          arrivalBased: q.arrivalBased,
          arrived: q.arrived,
        };
      });
    },
    () => prisma.appointment.count({ where })
  );
}

/** How many of a clinic's appointments match — for stats that only need a number. */
export async function countAppointments(
  clinicId: string,
  filters?: AppointmentFilters
): Promise<number> {
  return prisma.appointment.count({ where: appointmentWhere(clinicId, filters) });
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

// The full-page view of one appointment: scheduling state, the people involved,
// status timestamps, and the patient's feedback. The clinical record and the
// visit attachments are fetched separately (their own services) so the page can
// reuse those typed views. Clinic-scoped — a row from another clinic is null.
export interface AppointmentDetailView {
  id: string;
  clinicId: string;
  status: AppointmentStatus;
  createdAt: Date;
  patient: { id: string; fullName: string; phone: string | null };
  doctor: {
    fullName: string;
    specialty: string;
    title: string | null;
    examinationFee: number | null;
    consultationFee: number | null;
  };
  branch: { name: string; address: string | null } | null;
  slot: { date: Date; startTime: Date; endTime: Date } | null;
  patientNotes: string | null;
  doctorNotes: string | null;
  cancellationReason: string | null;
  cancelledAt: Date | null;
  confirmedAt: Date | null;
  completedAt: Date | null;
  reminderSentAt: Date | null;
  // Queue / arrival view fields.
  orderNumber: number | null;
  bookingDate: Date | null;
  isOrderBased: boolean;
  arrivalBased: boolean;
  arrived: boolean;
  currentOrder: number | null;
  estimatedWaitMin: number | null;
  expectedTime: string | null;
  feedback: { rating: number | null; comment: string | null; createdAt: Date } | null;
}

export async function getAppointmentForDetail(
  appointmentId: string,
  clinicId: string
): Promise<AppointmentDetailView | null> {
  const row = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    include: {
      slot: { select: { date: true, startTime: true, endTime: true } },
      branch: { select: { name: true, address: true } },
      patient: { select: { id: true, fullName: true, phone: true } },
      doctor: {
        select: {
          fullName: true,
          title: true,
          specialty: { select: { name: true } },
          examinationFee: true,
          consultationFee: true,
        },
      },
      feedback: { select: { rating: true, comment: true, createdAt: true } },
      ...queueInfoInclude,
    },
  });
  if (!row) return null;
  const q = queueView(row);
  return {
    id: row.id,
    clinicId: row.clinicId,
    status: row.status,
    createdAt: row.createdAt,
    patient: row.patient,
    doctor: {
      fullName: row.doctor.fullName,
      specialty: row.doctor.specialty?.name ?? "",
      title: row.doctor.title,
      examinationFee: row.doctor.examinationFee != null ? Number(row.doctor.examinationFee) : null,
      consultationFee:
        row.doctor.consultationFee != null ? Number(row.doctor.consultationFee) : null,
    },
    branch: row.branch,
    slot: row.slot,
    patientNotes: row.patientNotes,
    doctorNotes: row.doctorNotes,
    cancellationReason: row.cancellationReason,
    cancelledAt: row.cancelledAt,
    confirmedAt: row.confirmedAt,
    completedAt: row.completedAt,
    reminderSentAt: row.reminderSentAt,
    orderNumber: q.orderNumber,
    bookingDate: q.bookingDate,
    isOrderBased: q.isOrderBased,
    arrivalBased: q.arrivalBased,
    arrived: q.arrived,
    currentOrder: q.currentOrder,
    estimatedWaitMin: q.estimatedWaitMin,
    expectedTime: q.expectedTime,
    feedback: row.feedback,
  };
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
  arrivalBased: boolean;
  arrived: boolean;
  currentOrder: number | null;
  estimatedWaitMin: number | null;
  estimatedDurationMin: number | null;
}

export async function getDoctorAppointments(
  doctorId: string,
  options?: { status?: AppointmentStatus; upcoming?: boolean; limit?: number }
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

/** One page of a doctor's appointments (optionally one status), newest first. */
export async function getDoctorAppointmentsPage(
  doctorId: string,
  status: AppointmentStatus | undefined,
  req: PageRequest
): Promise<Paginated<DoctorAppointmentView>> {
  const where = { doctorId, ...(status ? { status } : {}) };
  return paginate(
    req,
    async (args) => {
      const rows = await prisma.appointment.findMany({
        where,
        include: {
          slot: { select: { date: true, startTime: true, endTime: true } },
          patient: { select: { fullName: true, phone: true } },
          ...queueInfoInclude,
        },
        orderBy: pastOrder,
        ...args,
      });
      return rows.map((row) => ({ ...row, ...queueView(row) }));
    },
    () => prisma.appointment.count({ where })
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createAppointment(
  patientId: string,
  slotId: string,
  patientNotes?: string,
  opts?: { excludeAppointmentId?: string; clinicId?: string }
): Promise<Result<{ id: string }>> {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: slotId },
      include: { appointment: true, doctor: { select: { clinicId: true } } },
    });
    if (!slot) return err("الموعد غير موجود");
    // Multi-tenant guard (#38): when a clinic is given, the slot's doctor must
    // belong to it, so a patient chatting in Clinic A can't book a slot in
    // Clinic B by passing its id. Same "not found" message — don't reveal it exists.
    if (opts?.clinicId && slot.doctor.clinicId !== opts.clinicId) return err("الموعد غير موجود");
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
        ...(opts?.excludeAppointmentId ? { id: { not: opts.excludeAppointmentId } } : {}),
      },
      select: { id: true },
    });
    if (active)
      return err(
        "لديك حجز قائم مع هذا الطبيب لم يكتمل بعد. يرجى إتمامه أو إلغاؤه قبل حجز موعد جديد."
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
  notes?: string
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
    if (slot.doctorId === referringDoctorId) return err("لا يمكن تحويل المريض إلى نفس الطبيب");

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
  cancellationReason?: string
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
