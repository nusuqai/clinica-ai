import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as AppointmentService from "@/server/services/appointments";
import type { AgentContext } from "@/agent/types";
import { jsonTool, dateStr, timeStr } from "./shared";

export function patientTools(ctx: AgentContext): DynamicStructuredTool[] {
  const patientId = ctx.actorId!;

  return [
    jsonTool(
      {
        name: "book_appointment",
        description:
          "احجز موعداً للمريض الحالي في فترة زمنية (slot) محددة. احصل على معرّف الفترة من get_doctor_availability أولاً.",
        schema: z.object({
          slotId: z.string(),
          notes: z.string().nullable().describe("ملاحظات المريض (اختياري)"),
        }),
      },
      async ({ slotId, notes }) => {
        const res = await AppointmentService.createAppointment(
          patientId,
          slotId,
          notes ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        const appt = await prisma.appointment.findUnique({
          where: { id: res.data.id },
          include: {
            slot: { select: { date: true, startTime: true, endTime: true } },
            doctor: {
              select: {
                specialty: true,
                profile: { select: { fullName: true } },
              },
            },
          },
        });
        return {
          appointmentId: res.data.id,
          status: "PENDING",
          doctorName: appt?.doctor.profile.fullName,
          specialty: appt?.doctor.specialty,
          date: appt ? dateStr(appt.slot.date) : undefined,
          time: appt ? timeStr(appt.slot.startTime) : undefined,
        };
      },
    ),
    jsonTool(
      {
        name: "cancel_appointment",
        description: "ألغِ موعداً قائماً للمريض الحالي.",
        schema: z.object({
          appointmentId: z.string(),
          reason: z.string().nullable(),
        }),
      },
      async ({ appointmentId, reason }) => {
        const appt = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { patientId: true, status: true },
        });
        if (!appt || appt.patientId !== patientId)
          return { error: "الموعد غير موجود أو لا يخصك" };
        if (["CANCELLED", "COMPLETED", "NO_SHOW"].includes(appt.status))
          return { error: "لا يمكن إلغاء هذا الموعد" };
        const res = await AppointmentService.updateAppointmentStatus(
          appointmentId,
          "CANCELLED",
          reason ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        return { appointmentId, status: "CANCELLED" };
      },
    ),
    jsonTool(
      {
        name: "reschedule_appointment",
        description:
          "أعد جدولة موعد المريض: يلغي الموعد الحالي ويحجز فترة جديدة.",
        schema: z.object({ appointmentId: z.string(), newSlotId: z.string() }),
      },
      async ({ appointmentId, newSlotId }) => {
        const appt = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { patientId: true, status: true },
        });
        if (!appt || appt.patientId !== patientId)
          return { error: "الموعد غير موجود أو لا يخصك" };
        const created = await AppointmentService.createAppointment(
          patientId,
          newSlotId,
        );
        if (!created.ok) return { error: created.error };
        await AppointmentService.updateAppointmentStatus(
          appointmentId,
          "CANCELLED",
          "إعادة جدولة",
        );
        return {
          oldAppointmentId: appointmentId,
          newAppointmentId: created.data.id,
          status: "PENDING",
        };
      },
    ),
    jsonTool(
      {
        name: "list_my_appointments",
        description: "اعرض مواعيد المريض الحالي (القادمة أو كلها).",
        schema: z.object({ upcoming: z.boolean().nullable() }),
      },
      async ({ upcoming }) => {
        const appts = await AppointmentService.getPatientAppointments(
          patientId,
          {
            upcoming: upcoming ?? false,
          },
        );
        return {
          appointments: appts.map((a) => ({
            id: a.id,
            status: a.status,
            doctorName: a.doctor.profile.fullName,
            specialty: a.doctor.specialty,
            date: dateStr(a.slot.date),
            time: timeStr(a.slot.startTime),
          })),
        };
      },
    ),
    jsonTool(
      {
        name: "update_my_profile",
        description: "حدّث اسم أو رقم هاتف المريض الحالي.",
        schema: z.object({
          fullName: z.string().nullable(),
          phone: z.string().nullable(),
        }),
      },
      async ({ fullName, phone }) => {
        await prisma.profile.update({
          where: { id: patientId },
          data: {
            ...(fullName !== null && { fullName: fullName.trim() }),
            ...(phone !== null && { phone: phone.trim() || null }),
          },
        });
        return { updated: true, fullName, phone };
      },
    ),
  ];
}
