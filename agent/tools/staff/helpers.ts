import "server-only";
import { z } from "zod";
import type { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import type { InboxNumberScope } from "@/lib/inbox-scope";
import type { StaffActor } from "@/agent/types";

export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD");

export const statusLabel = (s: AppointmentStatus) => APPOINTMENT_STATUS_LABELS[s];

export const can = (actor: StaffActor, ...permissions: string[]) =>
  permissions.some((p) => actor.permissions.includes(p));

/** The WhatsApp numbers a branch-limited member may see (inbox rule), or null. */
export async function actorInboxScope(
  clinicId: string,
  actor: StaffActor
): Promise<InboxNumberScope> {
  if (actor.branchIds === null) return null;
  if (actor.branchIds.length === 0) return [];
  const rows = await prisma.whatsappConfig.findMany({
    where: { clinicId, branchId: { in: actor.branchIds } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** A compact, human view of one appointment, for lists and summaries. */
export interface AppointmentBrief {
  id: string;
  patientId: string;
  patient: string;
  patientPhone: string | null;
  doctorId: string;
  doctor: string;
  branchId: string | null;
  branch: string | null;
  status: AppointmentStatus;
  statusLabel: string;
  date: string | null;
  time: string | null;
  orderNumber: number | null;
  arrivalBased: boolean;
  arrived: boolean;
  /** Day-only (حجز يوم فقط): the team sets the time; null time = still to set. */
  dayOnly: boolean;
  scheduledTime: string | null;
  notes: string | null;
}

const briefSelect = {
  id: true,
  patientId: true,
  doctorId: true,
  branchId: true,
  status: true,
  orderNumber: true,
  bookingDate: true,
  patientNotes: true,
  arrivedAt: true,
  scheduledTime: true,
  patient: { select: { fullName: true, phone: true } },
  doctor: { select: { fullName: true } },
  branch: { select: { name: true } },
  slot: { select: { date: true, startTime: true } },
  rule: { select: { mode: true } },
} as const;

type BriefRow = {
  id: string;
  patientId: string;
  doctorId: string;
  branchId: string | null;
  status: AppointmentStatus;
  orderNumber: number | null;
  bookingDate: Date | null;
  patientNotes: string | null;
  arrivedAt: Date | null;
  scheduledTime: string | null;
  patient: { fullName: string; phone: string | null };
  doctor: { fullName: string };
  branch: { name: string } | null;
  slot: { date: Date; startTime: Date } | null;
  rule: { mode: string } | null;
};

function toBrief(a: BriefRow): AppointmentBrief {
  const day = a.slot?.date ?? a.bookingDate;
  return {
    id: a.id,
    patientId: a.patientId,
    patient: a.patient.fullName,
    patientPhone: a.patient.phone,
    doctorId: a.doctorId,
    doctor: a.doctor.fullName,
    branchId: a.branchId,
    branch: a.branch?.name ?? null,
    status: a.status,
    statusLabel: statusLabel(a.status),
    date: day ? formatSlotDate(day, { weekday: "long", day: "numeric", month: "long" }) : null,
    time: a.slot ? formatSlotTime(a.slot.startTime) : (a.scheduledTime ?? null),
    orderNumber: a.orderNumber,
    arrivalBased: a.rule?.mode === "ARRIVAL_BASED",
    arrived: !!a.arrivedAt,
    dayOnly: a.rule?.mode === "DAY_ONLY",
    scheduledTime: a.rule?.mode === "DAY_ONLY" ? a.scheduledTime : null,
    notes: a.patientNotes,
  };
}

export async function appointmentBrief(
  clinicId: string,
  appointmentId: string
): Promise<AppointmentBrief | null> {
  const a = await prisma.appointment.findFirst({
    where: { id: appointmentId, clinicId },
    select: briefSelect,
  });
  return a ? toBrief(a as BriefRow) : null;
}

export async function appointmentBriefs(
  ids: string[],
  clinicId: string
): Promise<AppointmentBrief[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.appointment.findMany({
    where: { id: { in: ids }, clinicId },
    select: briefSelect,
  });
  const byId = new Map(rows.map((r) => [r.id, toBrief(r as BriefRow)]));
  return ids.map((id) => byId.get(id)).filter((b): b is AppointmentBrief => !!b);
}

/** "أحمد محمد مع د. سارة — الخميس 12 ديسمبر 05:00 م (فرع المعادي)". */
export function briefLine(b: AppointmentBrief): string {
  const when = [b.date, b.time ?? (b.orderNumber != null ? `دور ${b.orderNumber}` : null)]
    .filter(Boolean)
    .join(" ");
  return `${b.patient} مع ${b.doctor}${when ? ` — ${when}` : ""}${b.branch ? ` (${b.branch})` : ""}`;
}

/** Contact name of a conversation. */
export function contactName(c: {
  whatsappName: string | null;
  whatsappPhone: string | null;
  user: { fullName: string } | null;
}): string {
  return c.user?.fullName || c.whatsappName || c.whatsappPhone || "زائر الموقع";
}
