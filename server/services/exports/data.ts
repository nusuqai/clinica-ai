import "server-only";
import { AppointmentStatus, Channel, Role, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchScope } from "@/lib/branch-scope";
import { zonedDayStartUtc } from "@/lib/appointment-timing";
import { APPOINTMENT_STATUS_LABELS, PROCEDURE_KIND_LABELS } from "@/lib/labels";
import { PATIENT_PACKAGE_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/packages";
import { SOURCE_LABEL, formatAnswer, type QuestionSnapshot } from "@/lib/health-profile";
import { addDays, type ExportFilters } from "@/lib/exports/filters";

/**
 * Collects everything that happened to the clinic's PATIENTS in a period
 * (docs/data-export.md) — new patients, bookings, cancellations, status changes,
 * visits, packages, feedback and (when allowed) medical records. Clinic setup
 * (doctors, services, prices…) is never exported on its own.
 *
 * Changes are read from the appointment's own timestamps (created / confirmed /
 * cancelled / completed / arrived / reminder / feedback request). There is no
 * edit history, so reschedules and who made a change are not reported.
 */

/** Who the export is for: their branch scope and whether medical data may go in. */
export interface ExportAccess {
  branchIds: BranchScope;
  medical: boolean;
}

/** Upper bound per sheet — keeps a runaway period from building a huge file. */
const ROW_CAP = 20_000;

export type Cell = string | number | null;

export interface ExportSheet {
  name: string;
  columns: { header: string; width?: number; kind?: "money" | "number" }[];
  rows: Cell[][];
  /** Shown above the table when the sheet was cut or has a caveat. */
  note?: string;
}

export interface ExportCounts {
  newPatients: number;
  newAppointments: number;
  cancellations: number;
  confirmed: number;
  completed: number;
  noShows: number;
  checkIns: number;
  visits: number;
  packagesSold: number;
  feedback: number;
}

export interface ExportData {
  clinicName: string;
  timeZone: string;
  filters: ExportFilters;
  /** Human labels of the active filters ("الفرع: المعادي"). */
  filterLabels: string[];
  branchLimited: boolean;
  medical: boolean;
  generatedAt: Date;
  counts: ExportCounts;
  revenue: { completedTotal: number; packagesPaid: number };
  sheets: ExportSheet[];
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/** A real instant on the clinic's clock: "2026-11-24 14:05". */
function at(date: Date | null | undefined, timeZone: string): string | null {
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}`;
}

/** A wall-clock-in-UTC slot value (lib/slot-time.ts): "2026-11-24". */
function wallDay(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** A wall-clock-in-UTC slot time: "14:30". */
function wallTime(date: Date | null | undefined): string | null {
  return date ? date.toISOString().slice(11, 16) : null;
}

const money = (v: Prisma.Decimal | number | null | undefined): number | null =>
  v == null ? null : Number(v);

const MODE_LABEL: Record<string, string> = {
  SLOT_BASED: "موعد محدد",
  ORDER_BASED: "بالدور",
  ARRIVAL_BASED: "أسبقية الحضور",
};

const CHANNEL_LABEL: Record<Channel, string> = {
  [Channel.WHATSAPP]: "واتساب",
  [Channel.WEB]: "الموقع",
};

// ─── Appointment query ──────────────────────────────────────────────────────

const appointmentSelect = {
  id: true,
  patientId: true,
  branchId: true,
  status: true,
  orderNumber: true,
  bookingDate: true,
  arrivedAt: true,
  patientNotes: true,
  doctorNotes: true,
  cancelledAt: true,
  cancellationReason: true,
  confirmedAt: true,
  completedAt: true,
  reminderSentAt: true,
  feedbackRequestedAt: true,
  totalDurationMin: true,
  estimatedTotal: true,
  finalTotal: true,
  createdAt: true,
  updatedAt: true,
  patient: { select: { fullName: true, phone: true } },
  doctor: { select: { fullName: true, specialty: { select: { name: true } } } },
  referredBy: { select: { fullName: true } },
  branch: { select: { name: true } },
  slot: { select: { date: true, startTime: true } },
  rule: { select: { mode: true, startTime: true } },
  feedback: { select: { rating: true, comment: true } },
  items: {
    orderBy: { sortOrder: "asc" },
    select: {
      serviceName: true,
      quantity: true,
      finalQuantity: true,
      offer: { select: { label: true } },
      patientPackage: { select: { name: true } },
    },
  },
} satisfies Prisma.AppointmentSelect;

type ApptRow = Prisma.AppointmentGetPayload<{ select: typeof appointmentSelect }>;

/** The appointment filters (everything but the period), honouring branch scope. */
function appointmentFilterWhere(
  clinicId: string,
  f: ExportFilters,
  scope: BranchScope
): Prisma.AppointmentWhereInput {
  const where: Prisma.AppointmentWhereInput = { clinicId };
  if (f.branchId) {
    where.branchId = scope === null || scope.includes(f.branchId) ? f.branchId : { in: [] };
  } else if (scope !== null) {
    where.branchId = { in: [...scope] };
  }
  if (f.doctorId) where.doctorId = f.doctorId;
  if (f.specialtyId) where.doctor = { specialtyId: f.specialtyId };
  if (f.serviceId) where.items = { some: { serviceId: f.serviceId } };
  if (f.patientId) where.patientId = f.patientId;
  if (f.status) where.status = f.status;
  return where;
}

/** Any filter that narrows patients to those with a matching appointment. */
function narrowsPatients(f: ExportFilters, scope: BranchScope): boolean {
  return scope !== null || !!(f.branchId || f.doctorId || f.specialtyId || f.serviceId || f.status);
}

function visitWhen(a: ApptRow): { day: string | null; time: string | null } {
  const day = wallDay(a.slot?.date ?? a.bookingDate);
  if (a.slot) return { day, time: wallTime(a.slot.startTime) };
  if (a.orderNumber != null) return { day, time: `دور ${a.orderNumber}` };
  return { day, time: a.rule?.mode === "ARRIVAL_BASED" ? "لم يصل بعد" : null };
}

function servicesText(a: ApptRow): string {
  return a.items
    .map((i) => {
      const qty = i.finalQuantity ?? i.quantity;
      return `${i.serviceName}${qty > 1 ? ` ×${qty}` : ""}`;
    })
    .join("، ");
}

function offersText(a: ApptRow): string | null {
  const v = [...new Set(a.items.map((i) => i.offer?.label).filter(Boolean))];
  return v.length ? v.join("، ") : null;
}

function packagesText(a: ApptRow): string | null {
  const v = [...new Set(a.items.map((i) => i.patientPackage?.name).filter(Boolean))];
  return v.length ? v.join("، ") : null;
}

// ─── Builder ────────────────────────────────────────────────────────────────

export async function collectExport(
  clinicId: string,
  filters: ExportFilters,
  access: ExportAccess
): Promise<ExportData> {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: clinicId },
    select: { name: true, timezone: true },
  });
  const tz = clinic.timezone || "Africa/Cairo";
  const scope = access.branchIds;
  const start = zonedDayStartUtc(filters.from, tz);
  const end = zonedDayStartUtc(addDays(filters.to, 1), tz);
  const inPeriod = { gte: start, lt: end };
  const fromDay = new Date(`${filters.from}T00:00:00Z`);
  const toDay = new Date(`${filters.to}T00:00:00Z`);
  const within = (d: Date | null | undefined) => !!d && d >= start && d < end;
  const dayWithin = (d: Date | null | undefined) => !!d && d >= fromDay && d <= toDay;

  const apptWhere = appointmentFilterWhere(clinicId, filters, scope);
  // Patient-side rows (new patients, health answers) are clinic-wide; once the
  // export is narrowed to branches/doctors/services they keep only patients
  // with a matching appointment.
  const patientNarrow: Prisma.ProfileWhereInput | undefined = narrowsPatients(filters, scope)
    ? { appointments: { some: { ...apptWhere, status: filters.status ?? undefined } } }
    : undefined;
  const patientIdFilter = filters.patientId ? { id: filters.patientId } : {};

  const [appointments, newMembers, packages, feedback, records, answers, labels] =
    await Promise.all([
      prisma.appointment.findMany({
        where: {
          ...apptWhere,
          OR: [
            { createdAt: inPeriod },
            { cancelledAt: inPeriod },
            { confirmedAt: inPeriod },
            { completedAt: inPeriod },
            { arrivedAt: inPeriod },
            { reminderSentAt: inPeriod },
            { feedbackRequestedAt: inPeriod },
            { status: AppointmentStatus.NO_SHOW, updatedAt: inPeriod },
            { slot: { date: { gte: fromDay, lte: toDay } } },
            { slotId: null, bookingDate: { gte: fromDay, lte: toDay } },
          ],
        },
        select: appointmentSelect,
        orderBy: { createdAt: "asc" },
        take: ROW_CAP,
      }),
      prisma.clinicMember.findMany({
        where: {
          clinicId,
          role: Role.PATIENT,
          createdAt: inPeriod,
          user: { ...patientIdFilter, ...(patientNarrow ?? {}) },
        },
        select: {
          createdAt: true,
          user: {
            select: {
              id: true,
              fullName: true,
              phone: true,
              conversations: {
                where: { clinicId },
                orderBy: { createdAt: "asc" },
                take: 1,
                select: { channel: true },
              },
              healthProfiles: { where: { clinicId }, select: { id: true } },
              appointments: {
                where: { clinicId },
                orderBy: { createdAt: "asc" },
                select: { createdAt: true },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: ROW_CAP,
      }),
      prisma.patientPackage.findMany({
        where: {
          clinicId,
          purchasedAt: inPeriod,
          ...(filters.patientId ? { patientId: filters.patientId } : {}),
          ...(filters.branchId
            ? {
                branchId:
                  scope === null || scope.includes(filters.branchId)
                    ? filters.branchId
                    : { in: [] },
              }
            : scope !== null
              ? { branchId: { in: [...scope] } }
              : {}),
        },
        select: {
          name: true,
          source: true,
          basePrice: true,
          pricePaid: true,
          purchasedAt: true,
          expiresAt: true,
          status: true,
          paymentStatus: true,
          paidAt: true,
          patient: { select: { fullName: true, phone: true } },
          branch: { select: { name: true } },
        },
        orderBy: { purchasedAt: "asc" },
        take: ROW_CAP,
      }),
      prisma.appointmentFeedback.findMany({
        where: { clinicId, createdAt: inPeriod, appointment: apptWhere },
        select: {
          rating: true,
          comment: true,
          createdAt: true,
          patient: { select: { fullName: true, phone: true } },
          appointment: {
            select: {
              doctor: { select: { fullName: true } },
              branch: { select: { name: true } },
              slot: { select: { date: true } },
              bookingDate: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: ROW_CAP,
      }),
      access.medical
        ? prisma.treatmentRecord.findMany({
            where: {
              clinicId,
              OR: [{ createdAt: inPeriod }, { updatedAt: inPeriod }],
              ...(filters.patientId ? { patientId: filters.patientId } : {}),
              ...(filters.doctorId ? { doctorId: filters.doctorId } : {}),
              ...(filters.specialtyId ? { doctor: { specialtyId: filters.specialtyId } } : {}),
              ...(filters.branchId
                ? {
                    branchId:
                      scope === null || scope.includes(filters.branchId)
                        ? filters.branchId
                        : { in: [] },
                  }
                : scope !== null
                  ? { branchId: { in: [...scope] } }
                  : {}),
            },
            select: {
              visitDate: true,
              chiefComplaint: true,
              diagnosis: true,
              clinicalNotes: true,
              followUpDate: true,
              createdAt: true,
              updatedAt: true,
              patient: { select: { fullName: true, phone: true } },
              doctor: { select: { fullName: true } },
              branch: { select: { name: true } },
              procedures: { select: { kind: true, name: true, note: true, cost: true } },
              prescriptions: {
                select: {
                  drugName: true,
                  dose: true,
                  frequency: true,
                  durationDays: true,
                  instructions: true,
                },
              },
            },
            orderBy: { visitDate: "asc" },
            take: ROW_CAP,
          })
        : Promise.resolve([]),
      access.medical
        ? prisma.patientHealthAnswer.findMany({
            where: {
              clinicId,
              updatedAt: inPeriod,
              profile: {
                patient: { ...patientIdFilter, ...(patientNarrow ?? {}) },
              },
            },
            select: {
              value: true,
              questionSnapshot: true,
              source: true,
              updatedAt: true,
              profile: { select: { patient: { select: { fullName: true, phone: true } } } },
              updatedBy: { select: { fullName: true } },
            },
            orderBy: { updatedAt: "asc" },
            take: ROW_CAP,
          })
        : Promise.resolve([]),
      filterLabels(clinicId, filters),
    ]);

  // ── Appointment-derived sheets ──
  const apptCols = [
    { header: "المريض", width: 22 },
    { header: "الهاتف", width: 15 },
    { header: "الفرع", width: 16 },
    { header: "الطبيب", width: 20 },
    { header: "التخصص", width: 16 },
    { header: "يوم الزيارة", width: 12 },
    { header: "الوقت / الدور", width: 12 },
    { header: "نظام الحجز", width: 13 },
    { header: "الخدمات", width: 30 },
    { header: "العرض", width: 16 },
    { header: "الباقة المستخدمة", width: 18 },
    { header: "السعر التقديري", width: 12, kind: "money" as const },
    { header: "الإجمالي النهائي", width: 12, kind: "money" as const },
    { header: "الحالة", width: 11 },
    { header: "تاريخ الحجز", width: 17 },
    { header: "تأكيد", width: 17 },
    { header: "تسجيل الوصول", width: 17 },
    { header: "اكتمال", width: 17 },
    { header: "إلغاء", width: 17 },
    { header: "سبب الإلغاء", width: 22 },
    { header: "ملاحظات المريض", width: 26 },
    ...(access.medical ? [{ header: "ملاحظات الطبيب", width: 26 }] : []),
    { header: "محوّل من", width: 18 },
    { header: "التقييم", width: 8, kind: "number" as const },
    { header: "تعليق التقييم", width: 24 },
    { header: "رقم الموعد", width: 12 },
  ];
  const apptRow = (a: ApptRow): Cell[] => {
    const w = visitWhen(a);
    return [
      a.patient.fullName,
      a.patient.phone,
      a.branch?.name ?? null,
      a.doctor.fullName,
      a.doctor.specialty?.name ?? null,
      w.day,
      w.time,
      a.rule ? (MODE_LABEL[a.rule.mode] ?? null) : a.slot ? MODE_LABEL.SLOT_BASED : null,
      servicesText(a) || null,
      offersText(a),
      packagesText(a),
      money(a.estimatedTotal),
      money(a.finalTotal),
      APPOINTMENT_STATUS_LABELS[a.status],
      at(a.createdAt, tz),
      at(a.confirmedAt, tz),
      at(a.arrivedAt, tz),
      at(a.completedAt, tz),
      at(a.cancelledAt, tz),
      a.cancellationReason,
      a.patientNotes,
      ...(access.medical ? [a.doctorNotes] : []),
      a.referredBy?.fullName ?? null,
      a.feedback?.rating ?? null,
      a.feedback?.comment ?? null,
      a.id.slice(0, 8),
    ];
  };

  const created = appointments.filter((a) => within(a.createdAt));
  const cancelled = appointments.filter((a) => within(a.cancelledAt));
  const visits = appointments
    .filter((a) => dayWithin(a.slot?.date ?? a.bookingDate))
    .sort((x, y) => visitSortKey(x).localeCompare(visitSortKey(y)));

  type Change = { at: Date; label: string; a: ApptRow; detail: string | null };
  const changes: Change[] = [];
  for (const a of appointments) {
    const push = (d: Date | null, label: string, detail: string | null = null) => {
      if (within(d)) changes.push({ at: d!, label, a, detail });
    };
    push(a.createdAt, "حجز جديد");
    push(a.confirmedAt, "تأكيد الموعد");
    push(a.arrivedAt, "تسجيل وصول المريض", a.orderNumber != null ? `دور ${a.orderNumber}` : null);
    push(a.completedAt, "اكتمال الزيارة");
    push(a.cancelledAt, "إلغاء", a.cancellationReason);
    push(a.reminderSentAt, "إرسال تذكير تلقائي");
    push(a.feedbackRequestedAt, "طلب تقييم تلقائي");
    if (a.status === AppointmentStatus.NO_SHOW) push(a.updatedAt, "عدم حضور");
  }
  changes.sort((x, y) => x.at.getTime() - y.at.getTime());

  const counts: ExportCounts = {
    newPatients: newMembers.length,
    newAppointments: created.length,
    cancellations: cancelled.length,
    confirmed: appointments.filter((a) => within(a.confirmedAt)).length,
    completed: appointments.filter((a) => within(a.completedAt)).length,
    noShows: appointments.filter(
      (a) => a.status === AppointmentStatus.NO_SHOW && within(a.updatedAt)
    ).length,
    checkIns: appointments.filter((a) => within(a.arrivedAt)).length,
    visits: visits.length,
    packagesSold: packages.length,
    feedback: feedback.length,
  };
  const revenue = {
    completedTotal: appointments
      .filter((a) => within(a.completedAt))
      .reduce((s, a) => s + (money(a.finalTotal ?? a.estimatedTotal) ?? 0), 0),
    packagesPaid: packages.reduce((s, p) => s + (money(p.pricePaid) ?? 0), 0),
  };

  const capNote = (n: number) =>
    n >= ROW_CAP
      ? `تم عرض أول ${ROW_CAP} صف فقط — ضيّق الفترة أو الفلاتر للحصول على الباقي.`
      : undefined;

  const sheets: ExportSheet[] = [
    {
      name: "المرضى الجدد",
      columns: [
        { header: "المريض", width: 22 },
        { header: "الهاتف", width: 15 },
        { header: "تاريخ الانضمام", width: 17 },
        { header: "أول تواصل عبر", width: 13 },
        { header: "ملف المريض", width: 12 },
        { header: "عدد المواعيد", width: 11, kind: "number" },
        { header: "أول حجز", width: 17 },
      ],
      rows: newMembers.map((m) => [
        m.user.fullName,
        m.user.phone,
        at(m.createdAt, tz),
        m.user.conversations[0] ? CHANNEL_LABEL[m.user.conversations[0].channel] : null,
        m.user.healthProfiles.length ? "مكتمل" : "غير مكتمل",
        m.user.appointments.length,
        at(m.user.appointments[0]?.createdAt, tz),
      ]),
      note: patientNarrow
        ? "يشمل فقط المرضى الذين لديهم موعد يطابق الفلاتر/الفروع المحددة."
        : capNote(newMembers.length),
    },
    { name: "حجوزات جديدة", columns: apptCols, rows: created.map(apptRow) },
    { name: "الإلغاءات", columns: apptCols, rows: cancelled.map(apptRow) },
    {
      name: "التغييرات",
      columns: [
        { header: "الوقت", width: 17 },
        { header: "الحدث", width: 18 },
        { header: "تفاصيل", width: 24 },
        { header: "المريض", width: 22 },
        { header: "الهاتف", width: 15 },
        { header: "الطبيب", width: 20 },
        { header: "الفرع", width: 16 },
        { header: "يوم الزيارة", width: 12 },
        { header: "الوقت / الدور", width: 12 },
        { header: "الحالة الحالية", width: 12 },
        { header: "رقم الموعد", width: 12 },
      ],
      rows: changes.map((c) => {
        const w = visitWhen(c.a);
        return [
          at(c.at, tz),
          c.label,
          c.detail,
          c.a.patient.fullName,
          c.a.patient.phone,
          c.a.doctor.fullName,
          c.a.branch?.name ?? null,
          w.day,
          w.time,
          APPOINTMENT_STATUS_LABELS[c.a.status],
          c.a.id.slice(0, 8),
        ];
      }),
      note: "التغييرات مأخوذة من أوقات الحجز والتأكيد والوصول والاكتمال والإلغاء؛ تعديل موعد إلى وقت آخر لا يظهر كحدث مستقل.",
    },
    {
      name: "مواعيد الفترة",
      columns: apptCols,
      rows: visits.map(apptRow),
      note: capNote(appointments.length),
    },
    {
      name: "الباقات المباعة",
      columns: [
        { header: "المريض", width: 22 },
        { header: "الهاتف", width: 15 },
        { header: "الباقة", width: 22 },
        { header: "الفرع", width: 16 },
        { header: "المصدر", width: 10 },
        { header: "السعر الأساسي", width: 12, kind: "money" },
        { header: "المدفوع", width: 12, kind: "money" },
        { header: "حالة الدفع", width: 12 },
        { header: "تاريخ الدفع", width: 17 },
        { header: "حالة الباقة", width: 12 },
        { header: "تاريخ الشراء", width: 17 },
        { header: "تنتهي في", width: 12 },
      ],
      rows: packages.map((p) => [
        p.patient.fullName,
        p.patient.phone,
        p.name,
        p.branch.name,
        p.source === "OFFER" ? "مكافأة عرض" : "شراء",
        money(p.basePrice),
        money(p.pricePaid),
        PAYMENT_STATUS_LABEL[p.paymentStatus],
        at(p.paidAt, tz),
        PATIENT_PACKAGE_STATUS_LABEL[p.status],
        at(p.purchasedAt, tz),
        at(p.expiresAt, tz)?.slice(0, 10) ?? null,
      ]),
    },
    {
      name: "التقييمات",
      columns: [
        { header: "الوقت", width: 17 },
        { header: "المريض", width: 22 },
        { header: "الهاتف", width: 15 },
        { header: "الطبيب", width: 20 },
        { header: "الفرع", width: 16 },
        { header: "يوم الزيارة", width: 12 },
        { header: "التقييم", width: 8, kind: "number" },
        { header: "التعليق", width: 36 },
      ],
      rows: feedback.map((f) => [
        at(f.createdAt, tz),
        f.patient.fullName,
        f.patient.phone,
        f.appointment.doctor.fullName,
        f.appointment.branch?.name ?? null,
        wallDay(f.appointment.slot?.date ?? f.appointment.bookingDate),
        f.rating,
        f.comment,
      ]),
    },
  ];

  if (access.medical) {
    sheets.push(
      {
        name: "السجلات الطبية",
        columns: [
          { header: "المريض", width: 22 },
          { header: "الهاتف", width: 15 },
          { header: "الطبيب", width: 20 },
          { header: "الفرع", width: 16 },
          { header: "يوم الزيارة", width: 12 },
          { header: "الشكوى", width: 26 },
          { header: "التشخيص", width: 26 },
          { header: "ملاحظات الطبيب", width: 30 },
          { header: "الإجراءات", width: 30 },
          { header: "تكلفة الإجراءات", width: 12, kind: "money" },
          { header: "الروشتة", width: 36 },
          { header: "موعد المتابعة", width: 12 },
          { header: "أُنشئ", width: 17 },
          { header: "آخر تعديل", width: 17 },
        ],
        rows: records.map((r) => [
          r.patient.fullName,
          r.patient.phone,
          r.doctor.fullName,
          r.branch?.name ?? null,
          wallDay(r.visitDate),
          r.chiefComplaint,
          r.diagnosis,
          r.clinicalNotes,
          r.procedures
            .map(
              (p) => `${PROCEDURE_KIND_LABELS[p.kind]}: ${p.name}${p.note ? ` (${p.note})` : ""}`
            )
            .join("، ") || null,
          r.procedures.some((p) => p.cost != null)
            ? r.procedures.reduce((s, p) => s + (money(p.cost) ?? 0), 0)
            : null,
          r.prescriptions
            .map((p) =>
              [
                p.drugName,
                p.dose,
                p.frequency,
                p.durationDays ? `${p.durationDays} يوم` : null,
                p.instructions,
              ]
                .filter(Boolean)
                .join(" - ")
            )
            .join(" | ") || null,
          wallDay(r.followUpDate),
          at(r.createdAt, tz),
          at(r.updatedAt, tz),
        ]),
      },
      {
        name: "ملفات المرضى",
        columns: [
          { header: "آخر تحديث", width: 17 },
          { header: "المريض", width: 22 },
          { header: "الهاتف", width: 15 },
          { header: "السؤال", width: 30 },
          { header: "الإجابة", width: 30 },
          { header: "أدخلها", width: 12 },
          { header: "بواسطة", width: 20 },
        ],
        rows: answers.map((h) => {
          const snap = h.questionSnapshot as unknown as QuestionSnapshot;
          return [
            at(h.updatedAt, tz),
            h.profile.patient.fullName,
            h.profile.patient.phone,
            snap?.label ?? null,
            formatAnswer(null, h.value as string | number | boolean | null, snap),
            SOURCE_LABEL[h.source],
            h.updatedBy?.fullName ?? null,
          ];
        }),
      }
    );
  }

  return {
    clinicName: clinic.name,
    timeZone: tz,
    filters,
    filterLabels: labels,
    branchLimited: scope !== null,
    medical: access.medical,
    generatedAt: new Date(),
    counts,
    revenue,
    // Breakdowns right after the summary sheet, then the detail sheets.
    sheets: summaryBreakdowns(visits).concat(sheets),
  };
}

function visitSortKey(a: ApptRow): string {
  const w = visitWhen(a);
  return `${w.day ?? ""} ${a.slot ? wallTime(a.slot.startTime) : (a.rule?.startTime ?? "")} ${String(a.orderNumber ?? 999).padStart(4, "0")}`;
}

/** Per-branch and per-doctor counts of the period's visits, by status. */
function summaryBreakdowns(visits: ApptRow[]): ExportSheet[] {
  const statuses = Object.values(AppointmentStatus);
  const group = (key: (a: ApptRow) => string) => {
    const map = new Map<string, Record<string, number>>();
    for (const a of visits) {
      const k = key(a);
      const row = map.get(k) ?? Object.fromEntries(statuses.map((s) => [s, 0]));
      row[a.status] += 1;
      map.set(k, row);
    }
    return [...map.entries()].map(([k, r]) => [
      k,
      ...statuses.map((s) => r[s]),
      statuses.reduce((s, st) => s + r[st], 0),
    ]);
  };
  const cols = (first: string) => [
    { header: first, width: 22 },
    ...statuses.map((s) => ({
      header: APPOINTMENT_STATUS_LABELS[s],
      width: 11,
      kind: "number" as const,
    })),
    { header: "الإجمالي", width: 10, kind: "number" as const },
  ];
  return [
    {
      name: "حسب الفرع",
      columns: cols("الفرع"),
      rows: group((a) => a.branch?.name ?? "بدون فرع"),
    },
    {
      name: "حسب الطبيب",
      columns: cols("الطبيب"),
      rows: group((a) => a.doctor.fullName),
    },
  ];
}

/** "الفرع: المعادي" … for the summary header and the WhatsApp caption. */
async function filterLabels(clinicId: string, f: ExportFilters): Promise<string[]> {
  const [branch, doctor, specialty, service, patient] = await Promise.all([
    f.branchId
      ? prisma.branch.findFirst({ where: { id: f.branchId, clinicId }, select: { name: true } })
      : null,
    f.doctorId
      ? prisma.doctor.findFirst({ where: { id: f.doctorId, clinicId }, select: { fullName: true } })
      : null,
    f.specialtyId
      ? prisma.specialty.findFirst({
          where: { id: f.specialtyId, clinicId },
          select: { name: true },
        })
      : null,
    f.serviceId
      ? prisma.service.findFirst({ where: { id: f.serviceId, clinicId }, select: { name: true } })
      : null,
    f.patientId
      ? prisma.profile.findUnique({ where: { id: f.patientId }, select: { fullName: true } })
      : null,
  ]);
  return [
    branch && `الفرع: ${branch.name}`,
    doctor && `الطبيب: ${doctor.fullName}`,
    specialty && `التخصص: ${specialty.name}`,
    service && `الخدمة: ${service.name}`,
    patient && `المريض: ${patient.fullName}`,
    f.status && `الحالة: ${APPOINTMENT_STATUS_LABELS[f.status]}`,
  ].filter((v): v is string => !!v);
}
