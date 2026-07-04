import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as DoctorService from "@/server/services/doctors";
import * as AppointmentService from "@/server/services/appointments";
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
    status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW",
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
    statusTool("confirm_appointment", "أكّد موعداً معلّقاً.", "CONFIRMED"),
    statusTool("decline_appointment", "ارفض/ألغِ موعداً.", "CANCELLED"),
    statusTool("complete_appointment", "علّم الموعد كمكتمل.", "COMPLETED"),
    statusTool("mark_no_show", "علّم أن المريض لم يحضر.", "NO_SHOW"),
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
        description: "أنشئ قاعدة توفر أسبوعية للطبيب الحالي وولّد الفترات لها.",
        schema: z.object({
          dayOfWeek: z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]),
          startTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          endTime: z
            .string()
            .regex(/^\d{2}:\d{2}$/, "يجب أن يكون الوقت بصيغة HH:MM"),
          slotDurationMin: z.number().nullable(),
        }),
      },
      async ({ dayOfWeek, startTime, endTime, slotDurationMin }) => {
        const res = await DoctorService.createRule({
          doctorId,
          dayOfWeek,
          startTime,
          endTime,
          slotDurationMin: slotDurationMin ?? undefined,
        });
        if (!res.ok) return { error: res.error };
        return { ruleId: res.data.id, dayOfWeek, startTime, endTime };
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
  ];
}
