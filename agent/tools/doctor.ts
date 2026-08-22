import "server-only";
import { z } from "zod";
import { AppointmentStatus, DayOfWeek } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
import { listDoctorBranchIds } from "@/server/services/branches";
import type { AgentContext } from "@/agent/types";
import { jsonTool, dateStr, timeStr } from "./shared";

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

export function doctorTools(ctx: AgentContext): DynamicStructuredTool[] {
  const doctorId = ctx.actorId!;

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
        description: "اعرض مواعيد الطبيب الحالي (القادمة أو كلها).",
        schema: z.object({ upcoming: z.boolean().nullable() }),
      },
      async ({ upcoming }) => {
        const appts = await AppointmentService.getDoctorAppointments(doctorId, {
          upcoming: upcoming ?? false,
        });
        return {
          appointments: appts.map((a) => ({
            id: a.id,
            status: a.status,
            patientName: a.patient.fullName,
            date: dateStr(a.slot.date),
            time: timeStr(a.slot.startTime),
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
        description: "اعرض قائمة مرضى الطبيب الحالي.",
        schema: z.object({}),
      },
      async () => {
        const patients = await DoctorService.getDoctorPatients(doctorId);
        return {
          patients: patients.map((p) => ({
            name: p.fullName,
            phone: p.phone,
            totalAppointments: p.totalAppointments,
            lastStatus: p.lastStatus,
            lastDate: dateStr(p.lastAppointmentDate),
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
      async ({ branchId, dayOfWeek, startTime, endTime, slotDurationMin, referralOnly, note }) => {
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
  ];
}
