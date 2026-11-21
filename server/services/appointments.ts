import "server-only";
import { branchIdFilter, type BranchScope } from "@/lib/branch-scope";
import { prisma } from "@/lib/prisma";
import { ok, err, type Result } from "./_result";
import { AppointmentStatus, AvailabilityMode } from "@prisma/client";
import { advanceQueueOnComplete, estimateWaitMinutes } from "./queue";
import { expectedOrderTime, expectedTimeAfter, minutesAhead } from "@/lib/availability/queue-time";
import { bookSlotAppointment, releaseAppointmentHold, type BookingItemRequest } from "./booking";
import { settleSessionLines } from "./packages";
import { isQueueMode } from "@/lib/availability/modes";
import { visitEnd } from "@/lib/slot-time";
import { paginate, type PageRequest, type Paginated } from "@/lib/pagination";
import { personSearch } from "./_search";
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
  /** The visit's services (names), booked order. */
  items?: { serviceName: string; quantity: number; patientPackageId: string | null }[];
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
  queueId: string | null;
  orderNumber: number | null;
  bookingDate: Date | null;
  estimatedDurationMin: number | null;
  arrivedAt: Date | null;
  rule: { mode: AvailabilityMode; startTime: string } | null;
  queue: { currentOrder: number; trackCurrentOrder: boolean } | null;
};

/**
 * A slot visit can span several slots: report its real end (first slot's start
 * + the services' minutes) as `slot.endTime`, so every list, card and page
 * shows the visit's true time range.
 */
function withVisitEnd<
  T extends { slot: { startTime: Date; endTime: Date } | null; totalDurationMin: number | null },
>(row: T): T {
  if (!row.slot || !row.totalDurationMin) return row;
  return { ...row, slot: { ...row.slot, endTime: visitEnd(row.slot, row.totalDurationMin) } };
}

/** Per queue: each live booking's order number and its minutes of services. */
type QueueOffsets = Map<string, { orderNumber: number; minutes: number }[]>;

/**
 * Loads, for the queues these rows belong to, every live booking's minutes —
 * so expected times / waits add up the real service durations ahead instead of
 * assuming every patient takes the same time.
 */
async function loadQueueOffsets(
  rows: readonly { queueId: string | null }[]
): Promise<QueueOffsets> {
  const ids = [...new Set(rows.flatMap((r) => (r.queueId ? [r.queueId] : [])))];
  const map: QueueOffsets = new Map();
  if (ids.length === 0) return map;
  const appts = await prisma.appointment.findMany({
    where: {
      queueId: { in: ids },
      status: { not: AppointmentStatus.CANCELLED },
      orderNumber: { not: null },
    },
    select: {
      queueId: true,
      orderNumber: true,
      totalDurationMin: true,
      estimatedDurationMin: true,
    },
  });
  for (const a of appts) {
    const list = map.get(a.queueId!) ?? [];
    list.push({
      orderNumber: a.orderNumber!,
      minutes: a.totalDurationMin ?? a.estimatedDurationMin ?? 0,
    });
    map.set(a.queueId!, list);
  }
  return map;
}

// Derives the display-facing queue fields (isOrderBased, live current order,
// estimated wait, expected examination time) from the persisted appointment +
// queue snapshot (and, when given, the real minutes booked ahead).
function queueView(row: WithQueueInfo, offsets?: QueueOffsets) {
  // A queue booking is one whose rule is a queue mode, or (defensively) any row
  // that carries an order number. Arrival-priority reservations have no order
  // number until check-in, so lean on the rule mode to classify them.
  const isOrderBased = isQueueMode(row.rule?.mode) || row.orderNumber != null;
  const arrivalBased = row.rule?.mode === AvailabilityMode.ARRIVAL_BASED;
  const arrived = row.arrivedAt != null;
  const tracking = row.queue?.trackCurrentOrder ?? false;
  const currentOrder = isOrderBased && tracking ? (row.queue?.currentOrder ?? 0) : null;
  const ahead = row.queueId ? offsets?.get(row.queueId) : undefined;
  const estimatedWaitMin =
    isOrderBased && tracking && row.orderNumber != null
      ? ahead
        ? minutesAhead(ahead, row.orderNumber, Math.max(1, currentOrder ?? 0))
        : estimateWaitMinutes(row.orderNumber, currentOrder ?? 0, row.estimatedDurationMin)
      : null;
  const expectedTime =
    isOrderBased && row.orderNumber != null && row.rule?.startTime
      ? ahead
        ? expectedTimeAfter(row.rule.startTime, minutesAhead(ahead, row.orderNumber))
        : expectedOrderTime(row.rule.startTime, row.orderNumber, row.estimatedDurationMin)
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
// Upcoming lists read the other way: the soonest visit first.
const upcomingOrder: Prisma.AppointmentOrderByWithRelationInput[] = [
  { slot: { startTime: "asc" } },
  { bookingDate: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

/** One page of a patient's appointments in a clinic (any status when `status` is undefined). */
export async function getPatientAppointmentsPage(
  patientId: string,
  clinicId: string,
  status: AppointmentStatus | undefined,
  filters: Pick<AppointmentFilters, "doctorId" | "date" | "upcoming">,
  req: PageRequest
): Promise<Paginated<PatientAppointment>> {
  const where = appointmentWhere(clinicId, { ...filters, patientId, status });
  return paginate(
    req,
    async (args) => {
      const rows = await prisma.appointment.findMany({
        where,
        include: {
          slot: { select: { date: true, startTime: true, endTime: true } },
          branch: { select: { name: true } },
          doctor: doctorNameSelect,
          items: {
            orderBy: { sortOrder: "asc" },
            select: { serviceName: true, quantity: true, patientPackageId: true },
          },
          ...queueInfoInclude,
        },
        orderBy: filters.upcoming ? upcomingOrder : pastOrder,
        ...args,
      });
      const offsets = await loadQueueOffsets(rows);
      return rows.map((row) => ({
        ...reshapeDoctor(withVisitEnd(row)),
        ...queueView(row, offsets),
      }));
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
      items: {
        orderBy: { sortOrder: "asc" },
        select: { serviceName: true, quantity: true, patientPackageId: true },
      },
      ...queueInfoInclude,
    },
    orderBy: [
      { slot: { startTime: options?.upcoming ? "asc" : "desc" } },
      { bookingDate: options?.upcoming ? "asc" : "desc" },
    ],
    ...(options?.limit ? { take: options.limit } : {}),
  });
  const offsets = await loadQueueOffsets(rows);
  return rows.map((row) => ({ ...reshapeDoctor(withVisitEnd(row)), ...queueView(row, offsets) }));
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
  branchId?: string;
  /** Patient name, or phone digits (see personSearch). */
  patientQuery?: string;
  /** "YYYY-MM-DD": the visit day — slot date, or booking date for queue bookings. */
  date?: string;
  /** Only open (pending/confirmed) appointments that haven't happened yet. */
  upcoming?: boolean;
  /** Branch scope of the acting staff member (null/undefined = every branch).
   *  Set server-side from the caller's context — never taken from the client. */
  branchScope?: BranchScope;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Filters arrive from the URL and from client actions: ignore malformed values
// rather than let Prisma throw on a non-UUID or an unknown status.
function filterWhere(f: Omit<AppointmentFilters, "doctorId">): Prisma.AppointmentWhereInput {
  const day = f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date) ? new Date(f.date) : null;
  const status = f.status && f.status in AppointmentStatus ? f.status : undefined;
  const patient = personSearch(f.patientQuery);
  // Both the day and "upcoming" are OR conditions, so they're ANDed rather than
  // spread — spreading would let one overwrite the other's OR.
  const and: Prisma.AppointmentWhereInput[] = [
    // The visit day: the slot's date, or the booking date for queue bookings.
    ...(day ? [{ OR: [{ slot: { date: day } }, { bookingDate: day }] }] : []),
    ...(f.upcoming ? [upcomingAppointmentWhere()] : []),
  ];
  return {
    ...(status && { status }),
    ...(f.patientId && UUID_RE.test(f.patientId) && { patientId: f.patientId }),
    ...(f.branchId && UUID_RE.test(f.branchId) && { branchId: f.branchId }),
    ...(patient && { patient }),
    ...(and.length > 0 && { AND: and }),
  };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

function appointmentWhere(
  clinicId: string,
  f: AppointmentFilters = {}
): Prisma.AppointmentWhereInput {
  // ANDed with (not spread over) the user's own branch filter, so picking a
  // branch in the UI can only narrow the scope, never escape it.
  const base = filterWhere(f);
  const scope = branchIdFilter(f.branchScope);
  return {
    clinicId,
    ...(f.doctorId && UUID_RE.test(f.doctorId) && { doctorId: f.doctorId }),
    ...base,
    ...(scope.branchId && { AND: [...asArray(base.AND), scope] }),
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
        orderBy: filters.upcoming
          ? upcomingOrder
          : [
              { slot: { date: "desc" } },
              { bookingDate: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
        ...args,
      });
      return rows.map((row) => {
        const q = queueView(row);
        row = withVisitEnd(row);
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
          title: true,
          specialty: { select: { name: true } },
        },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          service: { select: { unitLabel: true } },
          offer: { select: { label: true } },
          patientPackage: { select: { name: true } },
        },
      },
      ...queueInfoInclude,
    },
  });
  if (!row) return null;
  return { ...withVisitEnd(row), ...queueView(row, await loadQueueOffsets([row])) };
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
  /** The services of the visit (booked → as done after completion). */
  items: AppointmentItemView[];
  estimatedTotal: number | null;
  finalTotal: number | null;
  totalDurationMin: number | null;
}

export interface AppointmentItemView {
  id: string;
  serviceName: string;
  quantity: number;
  unitLabel: string | null;
  basePrice: number | null;
  discount: number | null;
  total: number | null;
  offerLabel: string | null;
  packageName: string | null;
  durationMin: number;
  finalQuantity: number | null;
  finalTotal: number | null;
  uncoveredQuantity: number | null;
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
        },
      },
      feedback: { select: { rating: true, comment: true, createdAt: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          service: { select: { unitLabel: true } },
          offer: { select: { label: true } },
          patientPackage: { select: { name: true } },
        },
      },
      ...queueInfoInclude,
    },
  });
  if (!row) return null;
  const q = queueView(row, await loadQueueOffsets([row]));
  const n = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
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
    },
    branch: row.branch,
    slot: withVisitEnd(row).slot,
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
    items: row.items.map((i) => ({
      id: i.id,
      serviceName: i.serviceName,
      quantity: i.quantity,
      unitLabel: i.service.unitLabel,
      basePrice: n(i.basePrice),
      discount: n(i.discount),
      total: n(i.total),
      offerLabel: i.offer?.label ?? null,
      packageName: i.patientPackage?.name ?? null,
      durationMin: i.durationMin,
      finalQuantity: i.finalQuantity,
      finalTotal: n(i.finalTotal),
      uncoveredQuantity: i.uncoveredQuantity,
    })),
    estimatedTotal: n(row.estimatedTotal),
    finalTotal: n(row.finalTotal),
    totalDurationMin: row.totalDurationMin,
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
  options?: { status?: AppointmentStatus; date?: string; upcoming?: boolean; limit?: number }
): Promise<DoctorAppointmentView[]> {
  const rows = await prisma.appointment.findMany({
    where: {
      doctorId,
      ...(options?.upcoming
        ? upcomingAppointmentWhere()
        : filterWhere({ status: options?.status, date: options?.date })),
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
  const offsets = await loadQueueOffsets(rows);
  return rows.map((row) => ({ ...withVisitEnd(row), ...queueView(row, offsets) }));
}

/** One page of a doctor's appointments, filtered like the admin board, newest first. */
export async function getDoctorAppointmentsPage(
  doctorId: string,
  filters: Omit<AppointmentFilters, "doctorId">,
  req: PageRequest
): Promise<Paginated<DoctorAppointmentView>> {
  const where = { doctorId, ...filterWhere(filters) };
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
        orderBy: filters.upcoming ? upcomingOrder : pastOrder,
        ...args,
      });
      const offsets = await loadQueueOffsets(rows);
      return rows.map((row) => ({ ...withVisitEnd(row), ...queueView(row, offsets) }));
    },
    () => prisma.appointment.count({ where })
  );
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Book a slot visit. Thin wrapper over the booking engine (server/services/
 * booking.ts): validates the services, holds as many consecutive slots as the
 * services take, and snapshots prices. Without `items` the practitioner's
 * default service (their كشف) is booked.
 */
export async function createAppointment(
  patientId: string,
  slotId: string,
  patientNotes?: string,
  opts?: {
    excludeAppointmentId?: string;
    clinicId?: string;
    items?: BookingItemRequest[] | null;
    branchScope?: BranchScope;
    status?: AppointmentStatus;
  }
): Promise<Result<{ id: string }>> {
  const res = await bookSlotAppointment({
    patientId,
    slotId,
    notes: patientNotes,
    items: opts?.items,
    clinicId: opts?.clinicId,
    branchScope: opts?.branchScope,
    excludeAppointmentId: opts?.excludeAppointmentId,
    status: opts?.status,
  });
  return res.ok ? ok({ id: res.data.id }) : res;
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
  items?: BookingItemRequest[] | null
): Promise<Result<{ id: string }>> {
  const res = await bookSlotAppointment({
    patientId,
    slotId,
    notes,
    items,
    referredByDoctorId: referringDoctorId,
  });
  return res.ok ? ok({ id: res.data.id }) : res;
}

export async function updateAppointmentStatus(
  appointmentId: string,
  status: AppointmentStatus,
  cancellationReason?: string
): Promise<Result<void>> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
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
      // A cancelled visit gives its slots / queue minutes / package sessions back;
      // a finished one (or a no-show) uses its reserved package sessions.
      if (status === AppointmentStatus.CANCELLED) await releaseAppointmentHold(appointmentId, tx);
      if (status === AppointmentStatus.COMPLETED || status === AppointmentStatus.NO_SHOW)
        await settleSessionLines(tx, appointmentId, status);
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
