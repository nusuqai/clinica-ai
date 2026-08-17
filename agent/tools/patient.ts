import "server-only";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as AppointmentService from "@/server/services/appointments";
import type { AgentContext } from "@/agent/types";
import { jsonTool, dateStr, timeStr, money } from "./shared";

/**
 * Full confirmation card for an appointment, read straight from the DB so the
 * reply reflects the record actually saved — doctor, branch, date, time and
 * fee — instead of what the agent believed it was booking. Lets the user spot
 * a wrong slot/branch immediately.
 */
async function appointmentCard(appointmentId: string) {
  const a = await AppointmentService.getAppointmentDetails(appointmentId);
  if (!a) return { appointmentId };
  return {
    appointmentId: a.id,
    status: a.status,
    doctorName: a.doctor.fullName,
    specialty: a.doctor.specialty?.name ?? null,
    branch: a.branch?.name ?? null,
    branchAddress: a.branch?.address ?? null,
    date: dateStr(a.slot.date),
    startTime: timeStr(a.slot.startTime),
    endTime: timeStr(a.slot.endTime),
    examinationFee: money(a.doctor.examinationFee),
    notes: a.patientNotes ?? null,
  };
}

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
        // Echo the saved appointment in full so the user can verify every detail.
        return await appointmentCard(res.data.id);
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
        const uncancellable: AppointmentStatus[] = [
          AppointmentStatus.CANCELLED,
          AppointmentStatus.COMPLETED,
          AppointmentStatus.NO_SHOW,
        ];
        if (uncancellable.includes(appt.status))
          return { error: "لا يمكن إلغاء هذا الموعد" };
        const res = await AppointmentService.updateAppointmentStatus(
          appointmentId,
          AppointmentStatus.CANCELLED,
          reason ?? undefined,
        );
        if (!res.ok) return { error: res.error };
        return { appointmentId, status: AppointmentStatus.CANCELLED };
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
          AppointmentStatus.CANCELLED,
          "إعادة جدولة",
        );
        // Return the new appointment in full (from the saved record) so the
        // user can confirm the reschedule landed on the slot/branch they meant.
        return {
          oldAppointmentId: appointmentId,
          rescheduled: true,
          ...(await appointmentCard(created.data.id)),
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
            branch: a.branch?.name ?? null,
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
