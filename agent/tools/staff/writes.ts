import "server-only";
import { z } from "zod";
import { AppointmentStatus, ConversationKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { conversationScopeWhere } from "@/lib/inbox-scope";
import * as AppointmentService from "@/server/services/appointments";
import * as BookingService from "@/server/services/booking";
import * as QueueService from "@/server/services/queue";
import * as Scope from "@/server/services/branchScope";
import * as UserService from "@/server/services/users";
import { bookOnBehalf } from "@/server/services/bookOnBehalf";
import { assignConversationAs, isInboxTeammate } from "@/server/services/inbox";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { normalizeHHMM } from "@/lib/availability/modes";
import type { WriteAction, StaffToolContext } from "./pending";
import {
  actorInboxScope,
  appointmentBrief,
  briefLine,
  can,
  contactName,
  dateField,
  statusLabel,
} from "./helpers";

const CLOSED: AppointmentStatus[] = [
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
];

const STAFF_STATUSES = [
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.NO_SHOW,
] as const;

/** An appointment the member may act on (clinic + branch scope), or an error. */
async function scopedAppointment(ctx: StaffToolContext, appointmentId: string) {
  if (!(await Scope.appointmentInScope(appointmentId, ctx.clinicId, ctx.staff.branchIds)))
    return null;
  return appointmentBrief(ctx.clinicId, appointmentId);
}

/** A customer conversation the member may see (inbox rule), or null. */
async function scopedConversation(ctx: StaffToolContext, conversationId: string) {
  const numbers = await actorInboxScope(ctx.clinicId, ctx.staff);
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      clinicId: ctx.clinicId,
      kind: ConversationKind.CUSTOMER,
      ...conversationScopeWhere(numbers),
    },
    select: {
      id: true,
      assignedToId: true,
      updatedAt: true,
      whatsappName: true,
      whatsappPhone: true,
      user: { select: { fullName: true } },
    },
  });
}

const statusSchema = z.object({
  appointmentId: z.string(),
  status: z
    .enum(STAFF_STATUSES)
    .describe("CONFIRMED تأكيد، CANCELLED إلغاء، COMPLETED تمّت الزيارة، NO_SHOW لم يحضر"),
  reason: z.string().nullable().describe("سبب الإلغاء (عند الإلغاء)"),
});

const updateStatus: WriteAction<typeof statusSchema> = {
  name: "update_appointment_status",
  description: "غيّر حالة موعد: تأكيد، إلغاء، تمّت الزيارة، أو لم يحضر.",
  schema: statusSchema,
  allowed: (a) => can(a, "appointments"),
  async prepare(ctx, { appointmentId, status, reason }) {
    const b = await scopedAppointment(ctx, appointmentId);
    if (!b) return { error: "الموعد غير موجود" };
    if (b.status === status) return { error: `الموعد بالفعل «${statusLabel(status)}»` };
    if (CLOSED.includes(b.status))
      return { error: `لا يمكن تغيير موعد حالته «${b.statusLabel}»` };
    const why = status === AppointmentStatus.CANCELLED && reason ? ` (السبب: ${reason})` : "";
    return { summary: `تغيير حالة موعد ${briefLine(b)} إلى «${statusLabel(status)}»${why}` };
  },
  async execute(ctx, { appointmentId, status, reason }) {
    const b = await scopedAppointment(ctx, appointmentId);
    if (!b) throw new Error("الموعد غير موجود");
    if (CLOSED.includes(b.status)) throw new Error(`لا يمكن تغيير موعد حالته «${b.statusLabel}»`);
    const res = await AppointmentService.updateAppointmentStatus(
      appointmentId,
      status,
      reason ?? undefined
    );
    if (!res.ok) throw new Error(res.error);
    return { appointmentId, status, label: statusLabel(status) };
  },
};

const rescheduleSchema = z.object({
  appointmentId: z.string(),
  newSlotId: z.string().describe("الفترة الجديدة من get_doctor_availability"),
});

const reschedule: WriteAction<typeof rescheduleSchema> = {
  name: "reschedule_clinic_appointment",
  description:
    "انقل موعداً بنظام الفترات إلى فترة جديدة بنفس الخدمات (احصل على newSlotId من get_doctor_availability لنفس الطبيب).",
  schema: rescheduleSchema,
  allowed: (a) => can(a, "appointments"),
  async prepare(ctx, { appointmentId, newSlotId }) {
    const b = await scopedAppointment(ctx, appointmentId);
    if (!b) return { error: "الموعد غير موجود" };
    if (CLOSED.includes(b.status)) return { error: "لا يمكن إعادة جدولة هذا الموعد" };
    if (!(await Scope.slotInScope(newSlotId, ctx.clinicId, ctx.staff.branchIds)))
      return { error: "الفترة الجديدة غير موجودة" };
    const slot = await prisma.slot.findUnique({
      where: { id: newSlotId },
      select: { date: true, startTime: true, doctor: { select: { fullName: true } } },
    });
    if (!slot) return { error: "الفترة الجديدة غير موجودة" };
    const when = `${formatSlotDate(slot.date, { weekday: "long", day: "numeric", month: "long" })} ${formatSlotTime(slot.startTime)}`;
    return { summary: `نقل موعد ${briefLine(b)} إلى ${when} مع ${slot.doctor.fullName}` };
  },
  async execute(ctx, { appointmentId, newSlotId }) {
    const b = await scopedAppointment(ctx, appointmentId);
    if (!b) throw new Error("الموعد غير موجود");
    if (!(await Scope.slotInScope(newSlotId, ctx.clinicId, ctx.staff.branchIds)))
      throw new Error("الفترة الجديدة غير موجودة");
    const res = await BookingService.rescheduleToSlot(appointmentId, newSlotId, {
      patientId: b.patientId,
      clinicId: ctx.clinicId,
    });
    if (!res.ok) throw new Error(res.error);
    const nb = await appointmentBrief(ctx.clinicId, res.data.id);
    return { oldAppointmentId: appointmentId, newAppointment: nb };
  },
};

const checkInSchema = z.object({ appointmentId: z.string() });

/** Check-in for arrival-based (أسبقية الحضور) bookings — hands out the number. */
export function checkInAction(scopeOf: "staff" | "doctor"): WriteAction<typeof checkInSchema> {
  async function load(ctx: StaffToolContext, appointmentId: string) {
    if (scopeOf === "doctor") {
      const own = await prisma.appointment.findFirst({
        where: { id: appointmentId, clinicId: ctx.clinicId, doctorId: ctx.staff.doctorId ?? "" },
        select: { id: true },
      });
      return own ? appointmentBrief(ctx.clinicId, appointmentId) : null;
    }
    return scopedAppointment(ctx, appointmentId);
  }
  return {
    name: "check_in_patient",
    description:
      "سجّل وصول مريض للعيادة في حجز «أسبقية الحضور» ليحصل على رقم دوره حسب ترتيب الوصول.",
    schema: checkInSchema,
    allowed: (a) =>
      scopeOf === "doctor" ? a.doctorId != null : can(a, "appointments", "doctors"),
    async prepare(ctx, { appointmentId }) {
      const b = await load(ctx, appointmentId);
      if (!b) return { error: "الحجز غير موجود" };
      if (!b.arrivalBased) return { error: "هذا الحجز ليس بنظام أسبقية الحضور" };
      if (b.arrived) return { error: "تم تسجيل وصول هذا المريض بالفعل" };
      return { summary: `تسجيل وصول ${briefLine(b)}` };
    },
    async execute(ctx, { appointmentId }) {
      const b = await load(ctx, appointmentId);
      if (!b) throw new Error("الحجز غير موجود");
      const res = await QueueService.markArrived(appointmentId);
      if (!res.ok) throw new Error(res.error);
      return { appointmentId, orderNumber: res.data.orderNumber };
    },
  };
}

const setTimeSchema = z.object({
  appointmentId: z.string(),
  time: z
    .string()
    .nullable()
    .describe("الوقت بصيغة HH:MM (24 ساعة) مثل 14:30 — أو null لمسح الوقت"),
  date: dateField
    .nullable()
    .describe(
      "اختياري — لنقل الموعد ليوم آخر (YYYY-MM-DD): يجب أن يكون من أيام «حجز اليوم» الخاصة بالطبيب"
    ),
});

/** Day-only (حجز يوم فقط): set the exact time the team agreed with the patient. */
export function setTimeAction(scopeOf: "staff" | "doctor"): WriteAction<typeof setTimeSchema> {
  async function load(ctx: StaffToolContext, appointmentId: string) {
    if (scopeOf === "doctor") {
      const own = await prisma.appointment.findFirst({
        where: { id: appointmentId, clinicId: ctx.clinicId, doctorId: ctx.staff.doctorId ?? "" },
        select: { id: true },
      });
      return own ? appointmentBrief(ctx.clinicId, appointmentId) : null;
    }
    return scopedAppointment(ctx, appointmentId);
  }
  return {
    name: "set_appointment_time",
    description:
      "حدّد الوقت الدقيق لحجز من نوع «حجز يوم فقط» بعد الاتفاق مع المريض (أو امسحه بـ null)، ويمكن أيضاً نقله ليوم آخر بتمرير date (لأيام «حجز اليوم» الخاصة بالطبيب فقط؛ يُسمح بتجاوز الحد اليومي مع تنبيه). أي وقت مقبول ولا يتم التحقق من التداخل — مسؤولية العيادة. لا تُرسل رسالة للمريض تلقائياً.",
    schema: setTimeSchema,
    allowed: (a) => (scopeOf === "doctor" ? a.doctorId != null : can(a, "appointments")),
    async prepare(ctx, { appointmentId, time, date }) {
      if (date && scopeOf === "doctor")
        return { error: "نقل الموعد ليوم آخر متاح لفريق العيادة فقط — يمكنك تعديل الوقت" };
      const b = await load(ctx, appointmentId);
      if (!b) return { error: "الحجز غير موجود" };
      if (!b.dayOnly) return { error: "هذا الحجز ليس من نوع حجز اليوم فقط" };
      if (CLOSED.includes(b.status)) return { error: "لا يمكن تعديل وقت حجز منتهٍ أو ملغى" };
      if (time != null && !normalizeHHMM(time))
        return { error: "صيغة الوقت غير صحيحة (مثال: 14:30)" };
      const at = time ? ` الساعة ${normalizeHHMM(time)}` : "";
      return {
        summary: date
          ? `نقل ${briefLine(b)} إلى يوم ${date}${at}`
          : time
            ? `تحديد وقت ${normalizeHHMM(time)} لـ ${briefLine(b)}`
            : `مسح وقت ${briefLine(b)}`,
      };
    },
    async execute(ctx, { appointmentId, time, date }) {
      const b = await load(ctx, appointmentId);
      if (!b) throw new Error("الحجز غير موجود");
      if (date) {
        const moved = await BookingService.moveDayOnlyAppointment({
          appointmentId,
          date,
          time,
          clinicId: ctx.clinicId,
          branchScope: ctx.staff.branchIds,
        });
        if (!moved.ok) throw new Error(moved.error);
        return { appointmentId, ...moved.data };
      }
      const res = await AppointmentService.setScheduledTime(appointmentId, time, ctx.clinicId);
      if (!res.ok) throw new Error(res.error);
      return { appointmentId, scheduledTime: res.data.scheduledTime, warning: res.data.warning };
    },
  };
}

const bookSchema = z.object({
  patientId: z.string().nullable().describe("مريض موجود (من search_patients)"),
  newPatientName: z.string().nullable().describe("لمريض جديد: الاسم الكامل"),
  newPatientPhone: z.string().nullable().describe("لمريض جديد: رقم الهاتف"),
  doctorId: z.string(),
  slotId: z.string().nullable().describe("يوم بنظام الفترات: الفترة من get_doctor_availability"),
  date: dateField
    .nullable()
    .describe("يوم بنظام الدور/أسبقية الحضور/حجز اليوم: التاريخ (بدون slotId)"),
  time: z
    .string()
    .nullable()
    .describe("حجز يوم فقط: الوقت المتفق عليه مع المريض HH:MM إن وُجد (اختياري)"),
  serviceIds: z.array(z.string()).nullable().describe("الخدمات (افتراضياً كشف الطبيب)"),
  notes: z.string().nullable(),
});
type BookArgs = z.infer<typeof bookSchema>;

function bookingPatient(
  args: BookArgs
): { id: string } | { fullName: string; phone: string } | null {
  if (args.patientId) return { id: args.patientId };
  if (args.newPatientName && args.newPatientPhone)
    return { fullName: args.newPatientName, phone: args.newPatientPhone };
  return null;
}

const book: WriteAction<typeof bookSchema> = {
  name: "book_appointment_for_patient",
  description:
    "احجز موعداً لمريض نيابةً عنه (اتصال هاتفي أو حضور مباشر) — مريض موجود بـ patientId أو مريض جديد بالاسم والهاتف. الحجوزات من الفريق تكون مؤكدة مباشرة. استخدم get_doctor_availability أولاً.",
  schema: bookSchema,
  allowed: (a) => can(a, "appointments"),
  async prepare(ctx, args) {
    const patient = bookingPatient(args);
    if (!patient) return { error: "حدّد مريضاً موجوداً أو اسم ورقم المريض الجديد" };
    if (!args.slotId && !args.date) return { error: "حدّد الفترة (slotId) أو التاريخ" };
    if (!(await Scope.doctorInScope(args.doctorId, ctx.clinicId, ctx.staff.branchIds)))
      return { error: "الطبيب غير موجود" };
    if ("id" in patient && !(await UserService.isClinicPatient(patient.id, ctx.clinicId)))
      return { error: "المريض غير موجود في هذه العيادة" };
    const [doctor, patientName, slot] = await Promise.all([
      prisma.doctor.findUnique({ where: { id: args.doctorId }, select: { fullName: true } }),
      "id" in patient
        ? prisma.profile
            .findUnique({ where: { id: patient.id }, select: { fullName: true } })
            .then((p) => p?.fullName ?? "")
        : Promise.resolve(`${patient.fullName} (مريض جديد ${patient.phone})`),
      args.slotId
        ? prisma.slot.findUnique({
            where: { id: args.slotId },
            select: { date: true, startTime: true },
          })
        : Promise.resolve(null),
    ]);
    if (args.slotId && !slot) return { error: "الفترة غير موجودة" };
    const when = slot
      ? `${formatSlotDate(slot.date, { weekday: "long", day: "numeric", month: "long" })} ${formatSlotTime(slot.startTime)}`
      : `يوم ${args.date}${args.time ? ` الساعة ${args.time}` : ""}`;
    return { summary: `حجز موعد لـ ${patientName} مع ${doctor?.fullName ?? ""} — ${when}` };
  },
  async execute(ctx, args) {
    const patient = bookingPatient(args);
    if (!patient) throw new Error("بيانات المريض ناقصة");
    const res = await bookOnBehalf({
      clinicId: ctx.clinicId,
      scope: ctx.staff.branchIds,
      actorUserId: ctx.actorId,
      patient,
      doctorId: args.doctorId,
      slotId: args.slotId ?? undefined,
      date: args.slotId ? undefined : (args.date ?? undefined),
      notes: args.notes ?? undefined,
      items: args.serviceIds?.map((serviceId) => ({ serviceId })),
      scheduledTime: args.time,
    });
    if (!res.ok) throw new Error(res.error);
    return {
      appointment: await appointmentBrief(ctx.clinicId, res.appointmentId),
      mode: res.mode ?? "slot",
      orderNumber: res.orderNumber ?? null,
    };
  },
};

const resolveSchema = z.object({ escalationId: z.string() });

const resolveEscalation: WriteAction<typeof resolveSchema> = {
  name: "resolve_escalation",
  description: "علّم تصعيداً على أنه تمت معالجته (لا يغيّر حالة المساعد في المحادثة).",
  schema: resolveSchema,
  allowed: (a) => can(a, "messages"),
  async prepare(ctx, { escalationId }) {
    const numbers = await actorInboxScope(ctx.clinicId, ctx.staff);
    const e = await prisma.escalation.findFirst({
      where: {
        id: escalationId,
        clinicId: ctx.clinicId,
        resolvedAt: null,
        conversation: { kind: ConversationKind.CUSTOMER, ...conversationScopeWhere(numbers) },
      },
      select: {
        conversation: {
          select: { whatsappName: true, whatsappPhone: true, user: { select: { fullName: true } } },
        },
      },
    });
    if (!e) return { error: "التصعيد غير موجود أو تمت معالجته" };
    return { summary: `إغلاق تصعيد محادثة ${contactName(e.conversation)}` };
  },
  async execute(ctx, { escalationId }) {
    const numbers = await actorInboxScope(ctx.clinicId, ctx.staff);
    const res = await prisma.escalation.updateMany({
      where: {
        id: escalationId,
        clinicId: ctx.clinicId,
        resolvedAt: null,
        conversation: { kind: ConversationKind.CUSTOMER, ...conversationScopeWhere(numbers) },
      },
      data: { resolvedAt: new Date(), resolvedById: ctx.actorId },
    });
    if (res.count === 0) throw new Error("التصعيد غير موجود أو تمت معالجته");
    return { escalationId, resolved: true };
  },
};

const aiSchema = z.object({
  conversationId: z.string(),
  enabled: z.boolean().describe("true تشغيل المساعد الذكي في المحادثة، false إيقافه"),
});

const setConversationAi: WriteAction<typeof aiSchema> = {
  name: "set_conversation_ai",
  description:
    "شغّل أو أوقف رد المساعد الذكي التلقائي في محادثة عميل (الجلسة الحالية). تشغيله يغلق التصعيدات المفتوحة في الجلسة.",
  schema: aiSchema,
  allowed: (a) => can(a, "messages"),
  async prepare(ctx, { conversationId, enabled }) {
    const conv = await scopedConversation(ctx, conversationId);
    if (!conv) return { error: "المحادثة غير موجودة" };
    const session = await prisma.chatSession.findFirst({
      where: { conversationId },
      orderBy: { startedAt: "desc" },
      select: { aiEnabled: true },
    });
    if (!session) return { error: "لا توجد جلسة في هذه المحادثة" };
    if (session.aiEnabled === enabled)
      return { error: `المساعد ${enabled ? "يعمل" : "متوقف"} بالفعل في هذه المحادثة` };
    return {
      summary: `${enabled ? "تشغيل" : "إيقاف"} المساعد الذكي في محادثة ${contactName(conv)}`,
    };
  },
  async execute(ctx, { conversationId, enabled }) {
    const conv = await scopedConversation(ctx, conversationId);
    if (!conv) throw new Error("المحادثة غير موجودة");
    const session = await prisma.chatSession.findFirst({
      where: { conversationId },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (!session) throw new Error("لا توجد جلسة في هذه المحادثة");
    const now = new Date();
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { aiEnabled: enabled, aiToggledById: ctx.actorId, aiToggledAt: now },
    });
    // Same rule as the inbox: handing control back to the AI resolves the
    // session's open escalations.
    if (enabled) {
      await prisma.escalation.updateMany({
        where: { sessionId: session.id, clinicId: ctx.clinicId, resolvedAt: null },
        data: { resolvedAt: now, resolvedById: ctx.actorId },
      });
    }
    return { conversationId, aiEnabled: enabled };
  },
};

const assignSchema = z.object({
  conversationId: z.string(),
  assigneeUserId: z
    .string()
    .nullable()
    .describe("عضو الفريق (userId من list_inbox_team)، أو null لإلغاء الإسناد"),
});

const assign: WriteAction<typeof assignSchema> = {
  name: "assign_conversation",
  description: "أسند محادثة عميل إلى عضو في الفريق، أو ألغِ إسنادها.",
  schema: assignSchema,
  allowed: (a) => can(a, "messages"),
  async prepare(ctx, { conversationId, assigneeUserId }) {
    const conv = await scopedConversation(ctx, conversationId);
    if (!conv) return { error: "المحادثة غير موجودة" };
    if (!assigneeUserId) return { summary: `إلغاء إسناد محادثة ${contactName(conv)}` };
    if (!(await isInboxTeammate(ctx.clinicId, assigneeUserId)))
      return { error: "هذا العضو لا يملك صلاحية الرسائل" };
    const who = await prisma.profile.findUnique({
      where: { id: assigneeUserId },
      select: { fullName: true },
    });
    return { summary: `إسناد محادثة ${contactName(conv)} إلى ${who?.fullName ?? ""}` };
  },
  async execute(ctx, { conversationId, assigneeUserId }) {
    const conv = await scopedConversation(ctx, conversationId);
    if (!conv) throw new Error("المحادثة غير موجودة");
    if (assigneeUserId && !(await isInboxTeammate(ctx.clinicId, assigneeUserId)))
      throw new Error("هذا العضو لا يملك صلاحية الرسائل");
    await assignConversationAs({
      clinicId: ctx.clinicId,
      actorId: ctx.actorId,
      conversation: conv,
      assigneeId: assigneeUserId,
    });
    return { conversationId, assignedTo: assigneeUserId };
  },
};

/** Every write action an ADMIN / STAFF member can be offered. */
export const STAFF_WRITE_ACTIONS: WriteAction[] = [
  updateStatus,
  reschedule,
  checkInAction("staff"),
  setTimeAction("staff"),
  book,
  resolveEscalation,
  setConversationAi,
  assign,
] as WriteAction[];
