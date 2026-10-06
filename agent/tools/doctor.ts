import "server-only";
import { z } from "zod";
import { AppointmentStatus, DayOfWeek } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as DoctorService from "@/server/services/doctors";
import { getDoctorByProfileId } from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
import { listDoctorBranchIds } from "@/server/services/branches";
import { expectedOrderTime } from "@/lib/availability/queue-time";
import type { AgentContext } from "@/agent/types";
import { pageRequest } from "@/lib/pagination";
import { jsonTool, dateStr, timeStr, LIST_HINT, pageField, pageInfo } from "./shared";

async function assertOwnedAppointment(doctorId: string, appointmentId: string) {
  const appt = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { doctorId: true },
  });
  return appt?.doctorId === doctorId;
}

async function setSlotBlocked(
  doctorId: string,
  slotId: string,
  blocked: boolean,
) {
  const slot = await prisma.slot.findUnique({
    where: { id: slotId },
    include: { appointment: { select: { id: true } } },
  });
  if (!slot || slot.doctorId !== doctorId)
    return { error: "الفترة غير موجودة أو لا تخصك" };
  if (slot.appointment) return { error: "لا يمكن تعطيل فترة محجوزة" };
  await prisma.slot.update({
    where: { id: slotId },
    data: { isBlocked: blocked },
  });
  return { slotId, isBlocked: blocked };
}

export async function doctorTools(ctx: AgentContext): Promise<DynamicStructuredTool[]> {
  // #38 + latent-bug fix: `ctx.actorId` is the global Profile id, but every doctor
  // query/ownership check keys on `Doctor.id` (a distinct uuid). Resolve the
  // clinic-scoped Doctor for this profile; a Doctor belongs to exactly one clinic,
  // so every tool below is inherently isolated to `ctx.clinicId`. No matching
  // doctor record → no doctor tools (only the base info/handoff tools remain).
  const doctor = await getDoctorByProfileId(ctx.actorId!, ctx.clinicId);
  if (!doctor) return [];
  const doctorId = doctor.id;

  const statusTool = (
    name: string,
    description: string,
    status: AppointmentStatus,
  ) =>
    jsonTool(
      {
        name,
        description,
        schema: z.object({
          appointmentId: z.string(),
          reason: z.string().nullable(),
        }),
      },
      async ({ appointmentId, reason }) => {
        if (!(await assertOwnedAppointment(doctorId, appointmentId)))
          return { error: "الموعد غير موجود أو لا يخصك" };
        const res = await AppointmentService.updateAppointmentStatus(
          appointmentId,
          status,
          reason ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        return { appointmentId, status };
      },
    );

  return [
    jsonTool(
      {
        name: "list_my_appointments",
        description: `اعرض مواعيد الطبيب الحالي (٣٠ في الصفحة؛ القادمة الأقرب أولاً، والباقي الأحدث أولاً). صفِّ بالقادمة فقط (upcoming) و/أو الحالة و/أو اليوم (YYYY-MM-DD) و/أو اسم المريض أو هاتفه (patientQuery) — يمكن الجمع بينها. ${LIST_HINT}`,
        schema: z.object({
          upcoming: z.boolean().nullable(),
          status: z.nativeEnum(AppointmentStatus).nullable(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
            .nullable(),
          patientQuery: z.string().nullable().describe("اسم المريض أو رقم هاتفه (اختياري)"),
          page: pageField,
        }),
      },
      async ({ upcoming, status, date, patientQuery, page }) => {
        const appts = await AppointmentService.getDoctorAppointmentsPage(
          doctorId,
          {
            upcoming: upcoming ?? false,
            status: status ?? undefined,
            date: date ?? undefined,
            patientQuery: patientQuery ?? undefined,
          },
          pageRequest(page ?? 1, 30),
        );
        return {
          ...pageInfo(appts),
          appointments: appts.items.map((a) => ({
            id: a.id,
            status: a.status,
            patientName: a.patient.fullName,
            bookingType: a.arrivalBased ? "arrival" : a.isOrderBased ? "order" : "slot",
            arrived: a.arrived,
            date: a.slot
              ? dateStr(a.slot.date)
              : a.bookingDate
                ? dateStr(a.bookingDate)
                : null,
            time: a.slot ? timeStr(a.slot.startTime) : null,
            orderNumber: a.orderNumber,
            patientNotes: a.patientNotes,
          })),
        };
      },
    ),
    statusTool("confirm_appointment", "أكّد موعداً معلّقاً.", AppointmentStatus.CONFIRMED),
    statusTool("decline_appointment", "ارفض/ألغِ موعداً.", AppointmentStatus.CANCELLED),
    statusTool("complete_appointment", "علّم الموعد كمكتمل.", AppointmentStatus.COMPLETED),
    statusTool("mark_no_show", "علّم أن المريض لم يحضر.", AppointmentStatus.NO_SHOW),
    jsonTool(
      {
        name: "add_doctor_notes",
        description: "أضف ملاحظات الطبيب على موعد.",
        schema: z.object({ appointmentId: z.string(), notes: z.string() }),
      },
      async ({ appointmentId, notes }) => {
        if (!(await assertOwnedAppointment(doctorId, appointmentId)))
          return { error: "الموعد غير موجود أو لا يخصك" };
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { doctorNotes: notes },
        });
        return { appointmentId, notesSaved: true };
      },
    ),
    jsonTool(
      {
        name: "list_my_patients",
        description: `اعرض مرضى الطبيب الحالي (الأحدث زيارةً أولاً، ٣٠ في الصفحة). ابحث بالاسم أو الهاتف عبر query. ${LIST_HINT}`,
        schema: z.object({
          query: z.string().nullable().describe("بحث بالاسم أو رقم الهاتف (اختياري)"),
          page: pageField,
        }),
      },
      async ({ query, page }) => {
        const patients = await DoctorService.getDoctorPatients(
          doctorId,
          pageRequest(page ?? 1, 30),
          query ?? undefined,
        );
        return {
          ...pageInfo(patients),
          patients: patients.items.map((p) => ({
            name: p.fullName,
            phone: p.phone,
            totalAppointments: p.totalAppointments,
            lastStatus: p.lastStatus,
            lastDate: p.lastAppointmentDate ? dateStr(p.lastAppointmentDate) : null,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "get_my_stats",
        description:
          "اعرض إحصائيات الطبيب (مواعيد اليوم، المعلّقة، المكتملة...).",
        schema: z.object({}),
      },
      async () => DoctorService.getDoctorStats(doctorId),
    ),
    jsonTool(
      {
        name: "get_my_schedule",
        description:
          "اعرض فترات الطبيب (slots) في تاريخ محدّد بصيغة YYYY-MM-DD.",
        schema: z.object({
          date: z
            .string()
            .regex(
              /^\d{4}-\d{2}-\d{2}$/,
              "يجب أن يكون التاريخ بصيغة YYYY-MM-DD",
            ),
        }),
      },
      async ({ date }) => {
        const from = new Date(date);
        from.setUTCHours(0, 0, 0, 0);
        const to = new Date(date);
        to.setUTCHours(23, 59, 59, 999);
        const slots = await DoctorService.listDoctorSlots(doctorId, {
          from,
          to,
        });
        return {
          date,
          slots: slots.map((s) => ({
            id: s.id,
            time: timeStr(s.startTime),
            isBlocked: s.isBlocked,
            booked: !!s.appointment,
            patientName: s.appointment?.patient.fullName ?? null,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "block_slot",
        description: "عطّل فترة زمنية غير محجوزة حتى لا تُحجز.",
        schema: z.object({ slotId: z.string() }),
      },
      async ({ slotId }) => setSlotBlocked(doctorId, slotId, true),
    ),
    jsonTool(
      {
        name: "unblock_slot",
        description: "أعد تفعيل فترة زمنية معطّلة.",
        schema: z.object({ slotId: z.string() }),
      },
      async ({ slotId }) => setSlotBlocked(doctorId, slotId, false),
    ),
    jsonTool(
      {
        name: "create_availability_rule",
        description:
          "أنشئ قاعدة توفر أسبوعية للطبيب الحالي في فرع محدّد وولّد الفترات لها. يجب أن تقع الساعات ضمن ساعات عمل الفرع في ذلك اليوم.",
        schema: z.object({
          branchId: z
            .string()
            .nullable()
            .describe("معرّف الفرع (اختياري إن كان للطبيب فرع واحد فقط)"),
          dayOfWeek: z.nativeEnum(DayOfWeek),
          startTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          endTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          slotDurationMin: z.number().nullable(),
          mode: z
            .enum(["SLOT_BASED", "ORDER_BASED", "ARRIVAL_BASED"])
            .nullable()
            .describe(
              "نظام الجدولة: SLOT_BASED فترات بأوقات ثابتة (الافتراضي)، ORDER_BASED نظام الدور (طابور بأرقام تُعطى عند الحجز)، أو ARRIVAL_BASED أسبقية الحضور (يحجز المريض مكاناً ويُعطى رقم دوره عند وصوله للعيادة حسب أسبقية الحضور).",
            ),
          estimatedDurationMin: z
            .number()
            .nullable()
            .describe("لنظام الدور أو أسبقية الحضور فقط: متوسط دقائق الكشف لكل مريض (لحساب وقت الانتظار)."),
          dailyCap: z
            .number()
            .nullable()
            .describe("لنظام الدور أو أسبقية الحضور فقط: الحد الأقصى لعدد الحجوزات في اليوم."),
          referralOnly: z
            .boolean()
            .nullable()
            .describe(
              "إن كانت true فهذه القاعدة للتحويلات فقط: لا يحجزها المرضى مباشرةً، بل تُحجز عبر تحويل من طبيب.",
            ),
          note: z
            .string()
            .nullable()
            .describe("ملاحظة نصية على القاعدة (اختياري)"),
        }),
      },
      async ({ branchId, dayOfWeek, startTime, endTime, slotDurationMin, mode, estimatedDurationMin, dailyCap, referralOnly, note }) => {
        let resolvedBranchId = branchId ?? "";
        if (!resolvedBranchId) {
          const branchIds = await listDoctorBranchIds(doctorId);
          if (branchIds.length === 1) resolvedBranchId = branchIds[0];
          else return { error: "حدّد الفرع (branchId) لهذه القاعدة." };
        }
        const res = await DoctorService.createRule({
          doctorId,
          branchId: resolvedBranchId,
          dayOfWeek,
          startTime,
          endTime,
          slotDurationMin: slotDurationMin ?? undefined,
          clinicId: ctx.clinicId,
          mode: mode ?? undefined,
          estimatedDurationMin: estimatedDurationMin ?? null,
          dailyCap: dailyCap ?? null,
          referralOnly: referralOnly ?? false,
          note: note ?? null,
        });
        if (!res.ok) return { error: res.error };
        return {
          ruleId: res.data.id,
          branchId: resolvedBranchId,
          dayOfWeek,
          startTime,
          endTime,
          mode: mode ?? "SLOT_BASED",
          referralOnly: referralOnly ?? false,
        };
      },
    ),
    jsonTool(
      {
        name: "generate_slots",
        description:
          "ولّد فترات زمنية إضافية لقاعدة توفر يملكها الطبيب الحالي.",
        schema: z.object({
          ruleId: z.string(),
          daysAhead: z.number().nullable(),
        }),
      },
      async ({ ruleId, daysAhead }) => {
        const rule = await prisma.availabilityRule.findUnique({
          where: { id: ruleId },
          select: { doctorId: true },
        });
        if (rule?.doctorId !== doctorId)
          return { error: "القاعدة غير موجودة أو لا تخصك" };
        const res = await DoctorService.generateSlotsForRule(
          ruleId,
          daysAhead ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        return { ruleId, generated: res.data.count };
      },
    ),
    jsonTool(
      {
        name: "list_referral_slots",
        description:
          "اعرض الفترات المتاحة لدى طبيب آخر في تاريخ محدّد (YYYY-MM-DD) بغرض تحويل مريض إليه، بما فيها فترات «التحويلات فقط» (كل فترة موضّح فيها إن كانت مخصّصة للتحويلات). استخدمها قبل refer_patient للحصول على معرّف الفترة (slotId).",
        schema: z.object({
          targetDoctorId: z.string(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
        }),
      },
      async ({ targetDoctorId, date }) => {
        const target = await DoctorService.getDoctor(targetDoctorId, ctx.clinicId);
        if (!target) return { error: "الطبيب المُحوَّل إليه غير موجود" };
        const slots = await DoctorService.getReferralSlotsForBooking(
          targetDoctorId,
          new Date(date),
        );
        return {
          targetDoctorId,
          targetDoctorName: target.profile.fullName,
          date,
          slots: slots.map((s) => ({
            id: s.id,
            time: timeStr(s.startTime),
            branchId: s.branchId,
            branch: s.branch?.name ?? null,
            referralOnly: s.referralOnly,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "refer_patient",
        description:
          "حوِّل مريض المريض الحالي إلى طبيب آخر بحجز فترة لديه (يشمل فترات «التحويلات فقط»). حدّد المريض عبر معرّف موعده الحالي مع الطبيب الحالي (sourceAppointmentId)، ومعرّف الفترة لدى الطبيب الآخر (slotId من list_referral_slots).",
        schema: z.object({
          sourceAppointmentId: z
            .string()
            .describe("معرّف موعد المريض الحالي مع الطبيب الحالي"),
          slotId: z.string().describe("معرّف الفترة لدى الطبيب المُحوَّل إليه"),
          notes: z
            .string()
            .nullable()
            .describe("سبب التحويل / ملاحظات للطبيب المُحوَّل إليه (اختياري)"),
        }),
      },
      async ({ sourceAppointmentId, slotId, notes }) => {
        const source = await prisma.appointment.findUnique({
          where: { id: sourceAppointmentId },
          select: { doctorId: true, patientId: true },
        });
        if (!source || source.doctorId !== doctorId)
          return { error: "الموعد المصدر غير موجود أو لا يخصك" };
        const res = await AppointmentService.referAppointment(
          doctorId,
          source.patientId,
          slotId,
          notes ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        return { referredAppointmentId: res.data.id, referred: true };
      },
    ),
    jsonTool(
      {
        name: "get_day_queue",
        description:
          "اعرض طابور الدور (نظام الدور) للطبيب الحالي في تاريخ محدّد (YYYY-MM-DD): قائمة المرضى بأرقام أدوارهم، والدور الذي يُخدم الآن، وحالة التتبّع.",
        schema: z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
        }),
      },
      async ({ date }) => {
        const queue = await QueueService.getDayQueue(doctorId, new Date(date));
        if (!queue) return { date, hasQueue: false, patients: [] };
        const arrival = queue.rule?.mode === "ARRIVAL_BASED";
        return {
          date,
          hasQueue: true,
          queueId: queue.id,
          branch: queue.branch?.name ?? null,
          // "arrival" = أسبقية الحضور: reserved patients (arrived=false, no order
          // number) get their number when you check them in with mark_arrived.
          mode: arrival ? "arrival" : "order",
          currentOrder: queue.currentOrder,
          serveNextOrder: queue.serveNextOrder, // next order to serve
          nextOrder: queue.nextOrder, // booking counter (reservations handed out)
          nextArrival: queue.nextArrival, // arrival mode: next arrival number to hand out
          dailyCap: queue.dailyCap,
          trackCurrentOrder: queue.trackCurrentOrder,
          patients: queue.appointments.map((a) => ({
            appointmentId: a.id,
            orderNumber: a.orderNumber,
            patientName: a.patient.fullName,
            status: a.status,
            skipped: a.skippedAt != null,
            arrived: a.arrivedAt != null,
            expectedTime:
              queue.rule?.startTime && a.orderNumber != null
                ? expectedOrderTime(
                    queue.rule.startTime,
                    a.orderNumber,
                    queue.estimatedDurationMin,
                  )
                : null,
            notes: a.patientNotes,
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "advance_queue",
        description:
          "انتقل إلى المريض التالي في طابور نظام الدور ليوم محدّد: يُعلَّم المريض الذي يُخدَم الآن كمكتمل (إن وُجد) وينتقل الدور إلى التالي. ومن حالة عدم البدء يبدأ الطابور بالدور الأول. لتخطّي مريض غير حاضر بدلاً من إكماله استخدم skip_order.",
        schema: z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
        }),
      },
      async ({ date }) => {
        const queue = await QueueService.getDayQueue(doctorId, new Date(date));
        if (!queue) return { error: "لا يوجد طابور لهذا اليوم" };
        const res = await QueueService.completeCurrentAndAdvance(queue.id, doctorId);
        if (!res.ok) return { error: res.error };
        return {
          date,
          currentOrder: res.data.currentOrder,
          completedAppointmentId: res.data.completedAppointmentId,
        };
      },
    ),
    jsonTool(
      {
        name: "set_queue_tracking",
        description:
          "فعّل أو أوقف تتبّع «الدور الحالي» في طابور يوم محدّد. عند الإيقاف يرى المرضى رقم دورهم فقط دون الدور الجاري.",
        schema: z.object({
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
          track: z.boolean(),
        }),
      },
      async ({ date, track }) => {
        const queue = await QueueService.getDayQueue(doctorId, new Date(date));
        if (!queue) return { error: "لا يوجد طابور لهذا اليوم" };
        const res = await QueueService.toggleQueueTracking(queue.id, track, doctorId);
        if (!res.ok) return { error: res.error };
        return { date, trackCurrentOrder: track };
      },
    ),
    jsonTool(
      {
        name: "skip_order",
        description:
          "تخطَّ دور مريض مؤقتاً في نظام الدور لأنه غير حاضر عند مناداته. لا يُلغى الحجز ولا يُعلَّم كعدم حضور — يبقى قائماً ويُعاد لاحقاً بـ recall_order إن حضر. احصل على appointmentId من get_day_queue.",
        schema: z.object({ appointmentId: z.string() }),
      },
      async ({ appointmentId }) => {
        const res = await QueueService.skipOrder(appointmentId, doctorId);
        if (!res.ok) return { error: res.error };
        return { appointmentId, skipped: true };
      },
    ),
    jsonTool(
      {
        name: "recall_order",
        description:
          "أعِد مريضاً سبق تخطّيه إلى الطابور ليُخدَم التالي (بعد الدور الجاري مباشرةً) عندما يحضر. احصل على appointmentId من get_day_queue.",
        schema: z.object({ appointmentId: z.string() }),
      },
      async ({ appointmentId }) => {
        const res = await QueueService.recallOrder(appointmentId, doctorId);
        if (!res.ok) return { error: res.error };
        return { appointmentId, recalled: true, orderNumber: res.data.orderNumber };
      },
    ),
    jsonTool(
      {
        name: "mark_arrived",
        description:
          "لطوابير «أسبقية الحضور» فقط: سجّل وصول مريض حاجز عند حضوره للعيادة، فيُعطى رقم دوره التالي حسب أسبقية الحضور. استخدمها للحجوزات التي لا رقم لها بعد (orderNumber فارغ، arrived=false) من get_day_queue. لا تأثير على حجوزات نظام الدور العادي (لها رقم منذ الحجز).",
        schema: z.object({ appointmentId: z.string() }),
      },
      async ({ appointmentId }) => {
        const res = await QueueService.markArrived(appointmentId, doctorId);
        if (!res.ok) return { error: res.error };
        return { appointmentId, arrived: true, orderNumber: res.data.orderNumber };
      },
    ),
  ];
}
