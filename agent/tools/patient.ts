import "server-only";
import { z } from "zod";
import { AppointmentStatus, ConnectionRelation } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as AppointmentService from "@/server/services/appointments";
import * as QueueService from "@/server/services/queue";
import * as ConnectionService from "@/server/services/connections";
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
    patientName: a.patient.fullName,
    doctorName: a.doctor.fullName,
    specialty: a.doctor.specialty?.name ?? null,
    branch: a.branch?.name ?? null,
    branchAddress: a.branch?.address ?? null,
    // Slot-based bookings carry a fixed time; order-based carry a queue number;
    // arrival-priority (أسبقية الحضور) reserve a place and get a number on arrival.
    bookingType: a.arrivalBased ? "arrival" : a.isOrderBased ? "order" : "slot",
    arrived: a.arrived, // arrival-priority: whether the patient has been checked in
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

const forPatientIdField = z
  .string()
  .nullable()
  .describe(
    "معرّف الشخص الآخر الذي يُحجز له (من list_my_connections أو add_connection). اتركه null — وهو الافتراضي — إذا كان الحجز للمستخدم نفسه.",
  );

export function patientTools(ctx: AgentContext): DynamicStructuredTool[] {
  const patientId = ctx.actorId!;

  /** The patient a booking is for: the user, or a relative they may book for. */
  async function resolveBookingPatient(forPatientId: string | null) {
    if (!forPatientId || forPatientId === patientId) return patientId;
    return (await ConnectionService.canBookFor(ctx.clinicId, patientId, forPatientId))
      ? forPatientId
      : null;
  }

  /** The user plus every relative they book for — whose appointments they manage. */
  async function managedPatientIds() {
    const dependents = await ConnectionService.listBookableDependents(ctx.clinicId, patientId);
    return [patientId, ...dependents.map((d) => d.id)];
  }

  const NOT_A_CONNECTION = {
    error: "هذا الشخص ليس من الأشخاص الذين تحجز لهم — أضفه أولاً بـ add_connection",
  };

  return [
    jsonTool(
      {
        name: "list_my_connections",
        description:
          "اعرض الأشخاص الذين يحجز لهم المستخدم (اسم، صلته به، رقم الهاتف إن وُجد، والمعرّف). استخدمها عندما يقول إن الحجز لشخص آخر لمعرفة إن كان مضافاً من قبل.",
        schema: z.object({}),
      },
      async () => ({
        connections: (
          await ConnectionService.listBookableDependents(ctx.clinicId, patientId)
        ).map((d) => ({
          id: d.id,
          fullName: d.fullName,
          relation: d.relation,
          phone: d.phone,
        })),
      }),
    ),
    jsonTool(
      {
        name: "add_connection",
        description:
          "أضف شخصاً آخر يحجز له المستخدم (ينشئ له حساباً في العيادة ويضيفه إلى الأشخاص الذين يحجز لهم المستخدم). استخدمها فقط إن لم يكن الشخص ضمن list_my_connections. relation هي صلة الشخص بالمستخدم: PARENT (والده/والدته)، CHILD (ابنه/ابنته)، SPOUSE (زوج/زوجة)، SIBLING (أخ/أخت)، RELATIVE (قريب)، OTHER (أي صلة أخرى كصديق أو زميل). رقم واتساب الشخص اختياري — إن أُعطي يستطيع مراسلة العيادة وتصله التذكيرات مباشرة.",
        schema: z.object({
          fullName: z.string().describe("الاسم الكامل للشخص"),
          relation: z.nativeEnum(ConnectionRelation),
          phone: z
            .string()
            .nullable()
            .describe("رقم واتساب الشخص بالصيغة الدولية (اختياري)"),
        }),
      },
      async ({ fullName, relation, phone }) => {
        const res = await ConnectionService.addDependent({
          clinicId: ctx.clinicId,
          guardianId: patientId,
          fullName,
          relation,
          phone,
        });
        if (!res.ok) return { error: res.error };
        return { connectionAdded: true, id: res.data.dependentId, fullName, relation, phone };
      },
    ),
    jsonTool(
      {
        name: "set_connection_phone",
        description:
          "أضف أو غيّر رقم واتساب أحد الأشخاص الذين يحجز لهم المستخدم (احصل على معرّفه من list_my_connections).",
        schema: z.object({
          connectionId: z.string().describe("معرّف الشخص"),
          phone: z.string().describe("رقم واتساب الشخص بالصيغة الدولية"),
        }),
      },
      async ({ connectionId, phone }) => {
        const res = await ConnectionService.setDependentPhone({
          clinicId: ctx.clinicId,
          guardianId: patientId,
          dependentId: connectionId,
          phone,
        });
        if (!res.ok) return { error: res.error };
        return { updated: true, phone: res.data.phone };
      },
    ),
    jsonTool(
      {
        name: "book_appointment",
        description:
          "احجز موعداً في فترة زمنية (slot) محددة للمستخدم نفسه (الافتراضي) أو لشخص آخر يحجز له (forPatientId). احصل على معرّف الفترة من get_doctor_availability أولاً.",
        schema: z.object({
          slotId: z.string(),
          forPatientId: forPatientIdField,
          notes: z.string().nullable().describe("ملاحظات المريض (اختياري)"),
        }),
      },
      async ({ slotId, forPatientId, notes }) => {
        const bookFor = await resolveBookingPatient(forPatientId);
        if (!bookFor) return NOT_A_CONNECTION;
        const res = await AppointmentService.createAppointment(
          bookFor,
          slotId,
          notes ?? undefined,
          { clinicId: ctx.clinicId }, // #38: slot's doctor must be in this clinic
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
          "احجز دوراً للمستخدم نفسه (الافتراضي) أو لشخص آخر يحجز له (forPatientId) لدى طبيب يعمل بنظام الدور أو بأسبقية الحضور في تاريخ محدّد (YYYY-MM-DD). لا يوجد وقت ثابت. استخدم get_doctor_availability أولاً وتأكّد أن اليوم من نوع طابور. إن كان mode=order يحصل المريض على رقم دور فوراً. وإن كان mode=arrival (أسبقية الحضور) فهو يحجز مكاناً فقط ولا يحصل على رقم الآن؛ يُعطى رقم دوره عند وصوله للعيادة حسب أسبقية الحضور — أخبره بذلك.",
        schema: z.object({
          doctorId: z.string(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
          forPatientId: forPatientIdField,
          notes: z.string().nullable().describe("ملاحظات المريض (اختياري)"),
        }),
      },
      async ({ doctorId, date, forPatientId, notes }) => {
        const bookFor = await resolveBookingPatient(forPatientId);
        if (!bookFor) return NOT_A_CONNECTION;
        const res = await QueueService.bookOrderAppointment(
          bookFor,
          doctorId,
          new Date(date),
          { notes: notes ?? undefined, clinicId: ctx.clinicId }, // #38: doctor must be in this clinic
        );
        if (!res.ok) return { error: res.error };
        return await appointmentCard(res.data.id);
      },
    ),
    jsonTool(
      {
        name: "cancel_appointment",
        description: "ألغِ موعداً قائماً للمستخدم أو لأحد الأشخاص الذين يحجز لهم.",
        schema: z.object({
          appointmentId: z.string(),
          reason: z.string().nullable(),
        }),
      },
      async ({ appointmentId, reason }) => {
        // #38: scope to this clinic — a patient enrolled in several clinics must
        // not cancel another clinic's appointment from this clinic's chat.
        // Owner check is separate so a relative's appointment is found too.
        const appt = await prisma.appointment.findFirst({
          where: { id: appointmentId, clinicId: ctx.clinicId },
          select: { status: true, patientId: true },
        });
        if (!appt || !(await managedPatientIds()).includes(appt.patientId))
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
          "أعد جدولة موعد المستخدم أو أحد الأشخاص الذين يحجز لهم: يلغي الموعد الحالي ويحجز فترة جديدة لنفس الشخص.",
        schema: z.object({ appointmentId: z.string(), newSlotId: z.string() }),
      },
      async ({ appointmentId, newSlotId }) => {
        // #38: scope to this clinic (both the old appointment and — via
        // createAppointment's clinicId guard — the new slot's doctor).
        // Owner check is separate so a relative's appointment is found too.
        const appt = await prisma.appointment.findFirst({
          where: { id: appointmentId, clinicId: ctx.clinicId },
          select: { status: true, patientId: true },
        });
        if (!appt || !(await managedPatientIds()).includes(appt.patientId))
          return { error: "الموعد غير موجود أو لا يخصك" };
        // Book the new slot first (so a failure leaves the old one intact),
        // excluding the appointment being rescheduled from the one-active-booking
        // guard, then cancel the old one.
        const created = await AppointmentService.createAppointment(
          appt.patientId,
          newSlotId,
          undefined,
          { excludeAppointmentId: appointmentId, clinicId: ctx.clinicId },
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
        description:
          "اعرض مواعيد المستخدم ومواعيد الأشخاص الذين يحجز لهم (القادمة أو كلها)، ولكل موعد اسم المريض (patientName). استخدمها أيضاً عندما يسأل المريض «ما هو دوري؟» أو «كم رقمي؟». لكل موعد: bookingType (slot موعد بوقت ثابت، order نظام الدور، arrival أسبقية الحضور)، وorderNumber، وarrived. في أسبقية الحضور (arrival): إن كان arrived=false فلا رقم بعد — أخبر المريض أنه سيحصل على رقم دوره عند وصوله للعيادة حسب أسبقية الحضور؛ وإن كان arrived=true فاذكر رقمه (orderNumber)، ومع تفعيل التتبّع اذكر الدور الجاري الآن (currentOrder) ومدة الانتظار التقديرية (estimatedWaitMin).",
        schema: z.object({ upcoming: z.boolean().nullable() }),
      },
      async ({ upcoming }) => {
        const dependents = await ConnectionService.listBookableDependents(
          ctx.clinicId,
          patientId,
        );
        const people = [
          { id: patientId, fullName: ctx.actorName, forSelf: true },
          ...dependents.map((d) => ({ id: d.id, fullName: d.fullName, forSelf: false })),
        ];
        const perPatient = await Promise.all(
          people.map(async (person) =>
            (
              await AppointmentService.getPatientAppointments(person.id, {
                clinicId: ctx.clinicId,
                upcoming: upcoming ?? false,
              })
            ).map((a) => ({ ...a, person })),
          ),
        );
        return {
          appointments: perPatient.flat().map((a) => ({
            id: a.id,
            status: a.status,
            patientName: a.person.fullName,
            forSelf: a.person.forSelf,
            doctorName: a.doctor.profile.fullName,
            specialty: a.doctor.specialty,
            branch: a.branch?.name ?? null,
            bookingType: a.arrivalBased ? "arrival" : a.isOrderBased ? "order" : "slot",
            arrived: a.arrived,
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
        // #38: intentionally NOT clinic-scoped — a Profile is one global identity
        // (name/phone) shared across every clinic the patient belongs to.
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
          "أكّد موعداً معلّقاً (قيد الانتظار) للمريض الحالي بعد رسالة تذكير الحجز — يحوّل حالته إلى مؤكّد. إن لم يُحدَّد معرّف الموعد، يُستنتج آخر موعد معلّق للمريض (يُفضَّل الذي أُرسل له تذكير).",
        schema: z.object({
          appointmentId: z
            .string()
            .nullable()
            .describe("معرّف الموعد (اختياري — يُستنتج الموعد المعلّق تلقائياً إن تُرك فارغاً)"),
        }),
      },
      async ({ appointmentId }) => {
        const patientId = { in: await managedPatientIds() };
        // With an id: it must be the patient's own PENDING appointment. Without
        // one (a bare "نعم"/button reply carries no id): resolve the patient's
        // pending appointment, preferring the one a reminder was sent for.
        const appt = appointmentId
          ? await prisma.appointment.findFirst({
              where: {
                id: appointmentId,
                patientId,
                clinicId: ctx.clinicId, // #38: scope to this clinic
                status: AppointmentStatus.PENDING,
              },
              select: { id: true },
            })
          : await prisma.appointment.findFirst({
              where: { patientId, clinicId: ctx.clinicId, status: AppointmentStatus.PENDING },
              orderBy: [{ reminderSentAt: "desc" }, { createdAt: "desc" }],
              select: { id: true },
            });
        if (!appt) return { error: "لا يوجد موعد بانتظار التأكيد" };
        const res = await AppointmentService.updateAppointmentStatus(
          appt.id,
          AppointmentStatus.CONFIRMED,
        );
        if (!res.ok) return { error: res.error };
        return await appointmentCard(appt.id);
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
        const patientIds = await managedPatientIds();
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
              select: { id: true, clinicId: true, patientId: true },
            })
          : await prisma.appointment.findFirst({
              where: {
                patientId,
                status: AppointmentStatus.COMPLETED,
                feedbackRequestedAt: { not: null },
                feedback: null,
              },
              orderBy: { feedbackRequestedAt: "desc" },
              select: { id: true, clinicId: true, patientId: true },
            });
        if (!appt) return { error: "لا يوجد موعد مكتمل بانتظار التقييم" };

        await prisma.appointmentFeedback.create({
          data: {
            appointmentId: appt.id,
            clinicId: appt.clinicId,
            patientId: appt.patientId,
            rating: rating ?? null,
            comment: comment?.trim() || null,
          },
        });
        return { appointmentId: appt.id, saved: true, rating, comment };
      },
    ),
  ];
}
