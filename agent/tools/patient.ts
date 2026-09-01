import "server-only";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
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
    // Slot-based bookings carry a fixed time; order-based carry a queue number.
    bookingType: a.isOrderBased ? "order" : "slot",
    date: a.slot ? dateStr(a.slot.date) : a.bookingDate ? dateStr(a.bookingDate) : null,
    startTime: a.slot ? timeStr(a.slot.startTime) : null,
    endTime: a.slot ? timeStr(a.slot.endTime) : null,
    orderNumber: a.orderNumber,
    currentOrder: a.currentOrder,
    estimatedWaitMin: a.estimatedWaitMin,
    expectedTime: a.expectedTime, // order-based: expected examination time "HH:MM"
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
        name: "book_order_appointment",
        description:
          "احجز دوراً (نظام الطابور) للمريض الحالي لدى طبيب يعمل بنظام الدور في تاريخ محدّد (YYYY-MM-DD). لا يوجد وقت ثابت؛ يحصل المريض على رقم دور. استخدم get_doctor_availability أولاً للتأكد أن اليوم بنظام الدور (mode=order) وأن هناك أماكن متاحة.",
        schema: z.object({
          doctorId: z.string(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
          notes: z.string().nullable().describe("ملاحظات المريض (اختياري)"),
        }),
      },
      async ({ doctorId, date, notes }) => {
        const res = await QueueService.bookOrderAppointment(
          patientId,
          doctorId,
          new Date(date),
          { notes: notes ?? undefined },
        );
        if (!res.ok) return { error: res.error };
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
        // Book the new slot first (so a failure leaves the old one intact),
        // excluding the appointment being rescheduled from the one-active-booking
        // guard, then cancel the old one.
        const created = await AppointmentService.createAppointment(
          patientId,
          newSlotId,
          undefined,
          { excludeAppointmentId: appointmentId },
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
            bookingType: a.isOrderBased ? "order" : "slot",
            date: a.slot
              ? dateStr(a.slot.date)
              : a.bookingDate
                ? dateStr(a.bookingDate)
                : null,
            time: a.slot ? timeStr(a.slot.startTime) : null,
            orderNumber: a.orderNumber,
            currentOrder: a.currentOrder,
            estimatedWaitMin: a.estimatedWaitMin,
            expectedTime: a.expectedTime,
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
    jsonTool(
      {
        name: "confirm_appointment",
        description:
          "أكّد موعداً معلّقاً (قيد الانتظار) للمريض الحالي بعد رسالة تذكير الحجز — يحوّل حالته إلى مؤكّد.",
        schema: z.object({ appointmentId: z.string() }),
      },
      async ({ appointmentId }) => {
        const appt = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { patientId: true, status: true },
        });
        if (!appt || appt.patientId !== patientId)
          return { error: "الموعد غير موجود أو لا يخصك" };
        if (appt.status !== AppointmentStatus.PENDING)
          return { error: "لا يمكن تأكيد هذا الموعد (ليس في حالة انتظار)" };
        const res = await AppointmentService.updateAppointmentStatus(
          appointmentId,
          AppointmentStatus.CONFIRMED,
        );
        if (!res.ok) return { error: res.error };
        return await appointmentCard(appointmentId);
      },
    ),
    jsonTool(
      {
        name: "submit_appointment_feedback",
        description:
          "سجّل تقييم المريض بعد زيارته. استخدمها عندما يرد المريض على رسالة طلب التقييم. إن لم يُحدَّد معرّف الموعد، يُسجَّل التقييم على آخر موعد مكتمل بانتظار التقييم. rating رقم من 1 إلى 5 (اختياري) و/أو تعليق نصّي.",
        schema: z.object({
          appointmentId: z
            .string()
            .nullable()
            .describe("معرّف الموعد (اختياري — يُستنتج آخر موعد بانتظار التقييم إن تُرك فارغاً)"),
          rating: z.number().int().min(1).max(5).nullable(),
          comment: z.string().nullable(),
        }),
      },
      async ({ appointmentId, rating, comment }) => {
        if (rating === null && (comment === null || comment.trim() === ""))
          return { error: "لا يوجد تقييم لتسجيله (أضف تقييماً رقمياً أو تعليقاً)" };

        // Resolve which completed appointment this feedback is for: the given id
        // (must belong to the patient and be awaiting feedback), or the most
        // recent completed one that was asked for feedback and has none yet.
        const appt = appointmentId
          ? await prisma.appointment.findFirst({
              where: {
                id: appointmentId,
                patientId,
                status: AppointmentStatus.COMPLETED,
                feedback: null,
              },
              select: { id: true, clinicId: true },
            })
          : await prisma.appointment.findFirst({
              where: {
                patientId,
                status: AppointmentStatus.COMPLETED,
                feedbackRequestedAt: { not: null },
                feedback: null,
              },
              orderBy: { feedbackRequestedAt: "desc" },
              select: { id: true, clinicId: true },
            });
        if (!appt) return { error: "لا يوجد موعد مكتمل بانتظار التقييم" };

        await prisma.appointmentFeedback.create({
          data: {
            appointmentId: appt.id,
            clinicId: appt.clinicId,
            patientId,
            rating: rating ?? null,
            comment: comment?.trim() || null,
          },
        });
        return { appointmentId: appt.id, saved: true, rating, comment };
      },
    ),
  ];
}
