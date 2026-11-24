import "server-only";
import { notifyPatientCancelled } from "@/server/services/staff/notifications";
import { z } from "zod";
import { AppointmentStatus } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import * as AppointmentService from "@/server/services/appointments";
import * as BookingService from "@/server/services/booking";
import * as HealthProfileService from "@/server/services/health-profile";
import {
  HEALTH_PROFILE_REQUIRED_ERROR,
  QUESTION_TYPE_LABEL,
  flattenQuestions,
  formatAnswer,
  isQuestionVisible,
  missingRequired,
  type HealthQuestionView,
} from "@/lib/health-profile";
import type { AgentContext } from "@/agent/types";
import { pageRequest } from "@/lib/pagination";
import { formatFee } from "@/lib/currency";
import * as Packages from "@/server/services/packages";
import { listCategories } from "@/server/services/catalog";
import { creditLineText, PATIENT_PACKAGE_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/packages";
import { DAY_ONLY_PATIENT_NOTE_AR } from "@/lib/availability/modes";
import {
  jsonTool,
  dateStr,
  timeStr,
  LIST_HINT,
  pageField,
  pageInfo,
  showAllField,
  shouldAskForFilter,
  askForFilter,
} from "./shared";

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
    // Slot-based bookings carry a fixed time; order-based carry a queue number;
    // arrival-priority (أسبقية الحضور) reserve a place and get a number on arrival.
    bookingType: a.dayOnly ? "day" : a.arrivalBased ? "arrival" : a.isOrderBased ? "order" : "slot",
    arrived: a.arrived, // arrival-priority: whether the patient has been checked in
    // Day-only (حجز يوم فقط): the time the team set, or null = the team will call.
    ...(a.dayOnly && {
      scheduledTime: a.scheduledTime,
      ...(a.scheduledTime == null && { note: DAY_ONLY_PATIENT_NOTE_AR }),
    }),
    date: a.slot ? dateStr(a.slot.date) : a.bookingDate ? dateStr(a.bookingDate) : null,
    startTime: a.slot ? timeStr(a.slot.startTime) : null,
    endTime: a.slot ? timeStr(a.slot.endTime) : null,
    orderNumber: a.orderNumber,
    currentOrder: a.currentOrder,
    estimatedWaitMin: a.estimatedWaitMin,
    expectedTime: a.expectedTime, // order-based: expected examination time "HH:MM"
    // What the visit is for, with the price as booked (offer / package applied).
    services: a.items.map((i) => ({
      name: i.serviceName,
      quantity: i.service.unitLabel ? `${i.quantity} ${i.service.unitLabel}` : undefined,
      price: i.patientPackage
        ? `من باقة ${i.patientPackage.name}`
        : i.total != null
          ? formatFee(Number(i.total))
          : "يُحدَّد في الزيارة",
      offer: i.offer?.label ?? undefined,
    })),
    estimatedTotal: a.estimatedTotal != null ? formatFee(Number(a.estimatedTotal)) : null,
    durationMin: a.totalDurationMin,
    notes: a.patientNotes ?? null,
  };
}

/** The services the visit is for — required on every booking. */
const itemsField = z
  .array(
    z.object({
      serviceId: z.string().describe("معرّف الخدمة من search_services"),
      quantity: z
        .number()
        .int()
        .nullable()
        .describe("للخدمات بالوحدة فقط (نبضات، وحدات…): الكمية التقديرية؛ وإلا null"),
      patientPackageId: z
        .string()
        .nullable()
        .describe("ادفع هذه الخدمة من باقة المريض (من list_my_packages) إن اختار ذلك؛ وإلا null"),
    })
  )
  .min(1)
  .describe("الخدمات المطلوبة في هذا الموعد (خدمة واحدة على الأقل)");

// ─── Health profile (ملف المريض) ──────────────────────────────────────────────
// The agent ASKS only patient-visible questions. Staff-only answers are handed
// over as private context (privateStaffNotes) and must never be revealed.

/** A question as the agent needs it to ask it in chat. */
interface AgentQuestion {
  questionId: string;
  question: string;
  help: string | null;
  type: string;
  required: boolean;
  options?: string[];
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  followUps?: (AgentQuestion & { askOnlyIfAnswer: string })[];
}

function agentQuestion(q: HealthQuestionView, all: HealthQuestionView[]): AgentQuestion {
  const followUps = all.filter((f) => f.parentId === q.id);
  return {
    questionId: q.id,
    question: q.label,
    help: q.helpText,
    type: QUESTION_TYPE_LABEL[q.type],
    required: q.required,
    ...(q.type === "SELECT" && { options: q.options.map((o) => o.label) }),
    ...(q.type === "NUMBER" && { unit: q.unit, min: q.minValue, max: q.maxValue }),
    ...(followUps.length > 0 && {
      followUps: followUps.map((f) => ({
        askOnlyIfAnswer: f.showWhen ? "نعم" : "لا",
        ...agentQuestion(f, all),
      })),
    }),
  };
}

/** Booking refused: the required questions to collect first (top-level ones; follow-ups nested). */
async function healthProfileRequiredResult(clinicId: string, patientId: string) {
  const missing = await HealthProfileService.missingForBooking(clinicId, patientId);
  if (missing.length === 0) return null;
  const view = await HealthProfileService.getPatientHealthProfile(clinicId, patientId, {
    audience: "PATIENT",
  });
  const all = flattenQuestions(view.sections);
  const missingIds = new Set(missing.map((q) => q.id));
  // A missing follow-up whose parent is answered is asked on its own.
  const roots = missing.filter((q) => !q.parentId || !missingIds.has(q.parentId));
  return {
    error: HEALTH_PROFILE_REQUIRED_ERROR,
    needsHealthProfile: true,
    questions: roots.map((q) => agentQuestion(q, all)),
  };
}

export function patientTools(ctx: AgentContext): DynamicStructuredTool[] {
  const patientId = ctx.actorId!;
  const needsHealthProfile = () => healthProfileRequiredResult(ctx.clinicId, patientId);

  return [
    jsonTool(
      {
        name: "book_appointment",
        description:
          "احجز موعداً للمريض الحالي يبدأ في فترة زمنية (slot) محددة، للخدمات المختارة. احصل على معرّف الفترة من get_doctor_availability (مع serviceIds نفسها) أولاً — الخدمات الطويلة تحجز أكثر من فترة متتالية تلقائياً.",
        schema: z.object({
          slotId: z.string(),
          items: itemsField,
          notes: z.string().nullable().describe("ملاحظات المريض (اختياري)"),
        }),
      },
      async ({ slotId, items, notes }) => {
        const blocked = await needsHealthProfile();
        if (blocked) return blocked;
        const res = await AppointmentService.createAppointment(
          patientId,
          slotId,
          notes ?? undefined,
          { clinicId: ctx.clinicId, items }, // #38: slot's doctor must be in this clinic
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
          "احجز للمريض الحالي يوماً لدى طبيب يعمل بنظام الدور أو بأسبقية الحضور أو بحجز اليوم فقط في تاريخ محدّد (YYYY-MM-DD). لا يوجد وقت ثابت. استخدم get_doctor_availability أولاً وتأكّد أن mode ليس slot. إن كان mode=order يحصل المريض على رقم دور فوراً. وإن كان mode=arrival (أسبقية الحضور) فهو يحجز مكاناً فقط ولا يحصل على رقم الآن؛ يُعطى رقم دوره عند وصوله للعيادة حسب أسبقية الحضور — أخبره بذلك. وإن كان mode=day (حجز يوم فقط) فهو يحجز اليوم فقط: أخبره أن فريق خدمة العملاء سيتواصل معه لتحديد الوقت المناسب له، وأن الفريق سيثبّت الوقت الدقيق للموعد — ولا تَعِده بأي وقت.",
        schema: z.object({
          doctorId: z.string(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD"),
          items: itemsField,
          notes: z.string().nullable().describe("ملاحظات المريض (اختياري)"),
        }),
      },
      async ({ doctorId, date, items, notes }) => {
        const blocked = await needsHealthProfile();
        if (blocked) return blocked;
        const res = await BookingService.bookQueueAppointment({
          patientId,
          doctorId,
          date: new Date(date),
          items,
          notes: notes ?? undefined,
          clinicId: ctx.clinicId, // #38: doctor must be in this clinic
        });
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
        // #38: scope to this clinic — a patient enrolled in several clinics must
        // not cancel another clinic's appointment from this clinic's chat.
        const appt = await prisma.appointment.findFirst({
          where: { id: appointmentId, patientId, clinicId: ctx.clinicId },
          select: { status: true },
        });
        if (!appt) return { error: "الموعد غير موجود أو لا يخصك" };
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
        await notifyPatientCancelled(appointmentId);
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
        // #38: scope to this clinic (both the old appointment and — via
        // createAppointment's clinicId guard — the new slot's doctor).
        const appt = await prisma.appointment.findFirst({
          where: { id: appointmentId, patientId, clinicId: ctx.clinicId },
          select: { status: true },
        });
        if (!appt) return { error: "الموعد غير موجود أو لا يخصك" };
        // Book the new slot first with the same services (so a failure leaves
        // the old one intact), then cancel the old one and free what it held.
        const created = await BookingService.rescheduleToSlot(appointmentId, newSlotId, {
          patientId,
          clinicId: ctx.clinicId,
        });
        if (!created.ok) return { error: created.error };
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
        name: "list_my_packages",
        description:
          "باقات المريض الحالي في هذه العيادة: الرصيد المتبقي من كل نوع (نبضات/وحدات أو جلسات) وما يُستخدم فيه، والفرع، وآخر يوم صلاحية، وحالة الدفع، وآخر الاستخدامات. استخدمها عند سؤاله «كام نبضة فاضلة؟» أو «باقتي بتخلص امتى؟»، وقبل الحجز لتعرض عليه استخدام باقته إن كانت تغطي الخدمة في نفس الفرع.",
        schema: z.object({}),
      },
      async () => {
        const [packages, categories, services] = await Promise.all([
          Packages.listPatientPackages(ctx.clinicId, patientId),
          listCategories(ctx.clinicId),
          prisma.service.findMany({ where: { clinicId: ctx.clinicId }, select: { id: true, name: true } }),
        ]);
        const names = {
          category: (id: string) => categories.find((c) => c.id === id)?.name,
          service: (id: string) => services.find((s) => s.id === id)?.name,
        };
        const active = packages.filter((p) => p.status === "ACTIVE");
        return {
          active: active.map((p) => ({
            patientPackageId: p.id,
            name: p.name,
            branchId: p.branchId,
            branch: p.branchName,
            usableUntil: p.expiresOn,
            payment: PAYMENT_STATUS_LABEL[p.paymentStatus],
            balances: p.balances.map((b) => ({
              covers: creditLineText({ ...b, quantity: b.total }, names),
              remaining: Math.max(0, b.total - b.used),
              availableToBook: b.available,
              reservedForUpcoming: b.reserved,
              unit: b.creditType === "SESSIONS" ? "جلسة" : "وحدة",
              categoryId: b.categoryId,
              serviceIds: b.serviceIds,
            })),
            recentUse: p.ledger
              .filter((l) => l.type === "CONSUME")
              .slice(0, 5)
              .map((l) => ({ date: dateStr(l.createdAt), service: l.serviceName, used: -l.quantity })),
          })),
          others: packages
            .filter((p) => p.status !== "ACTIVE")
            .slice(0, 5)
            .map((p) => ({ name: p.name, status: PATIENT_PACKAGE_STATUS_LABEL[p.status], until: p.expiresOn })),
        };
      },
    ),
    jsonTool(
      {
        name: "request_package",
        description:
          "اطلب شراء باقة للمريض الحالي (من list_packages) في فرع محدد — تُنشأ له فوراً بحالة «غير مدفوعة» ويمكنه استخدامها في الحجز مباشرة، ويؤكد الموظفون الدفع في العيادة. لا تستدعها إلا بعد أن تعرض عليه السعر والصلاحية والشروط ويوافق صراحةً. تُعيد patientPackageId لاستخدامه في الحجز.",
        schema: z.object({
          packageId: z.string(),
          branchId: z.string().describe("الفرع الذي سيستخدم فيه الباقة — تُستخدم في هذا الفرع فقط"),
        }),
      },
      async ({ packageId, branchId }) => {
        const res = await Packages.purchasePackage({
          clinicId: ctx.clinicId,
          patientId,
          packageId,
          branchId,
          soldById: null,
          paid: false,
          note: "طلبها المريض عبر المساعد الذكي",
        });
        if (!res.ok) return { error: res.error };
        const q = res.data.quote;
        return {
          patientPackageId: res.data.id,
          name: q.name,
          price: formatFee(q.price),
          offer: q.offerLabel,
          usableUntil: q.expiresOn,
          payment: "غير مدفوعة — يُدفع المبلغ في العيادة",
        };
      },
    ),
    jsonTool(
      {
        name: "list_my_appointments",
        description:
          `اعرض مواعيد المريض الحالي (القادمة أو كلها). استخدمها أيضاً (مع upcoming=true) عندما يسأل المريض «ما هو دوري؟» أو «كم رقمي؟» أو «موعدي القادم». لكل موعد: bookingType (slot موعد بوقت ثابت، order نظام الدور، arrival أسبقية الحضور، day حجز يوم فقط — scheduledTime هو الوقت الذي حدده فريق العيادة، وإن كان فارغاً فالفريق سيتواصل معه لتحديده)، وorderNumber، وarrived. في أسبقية الحضور (arrival): إن كان arrived=false فلا رقم بعد — أخبر المريض أنه سيحصل على رقم دوره عند وصوله للعيادة حسب أسبقية الحضور؛ وإن كان arrived=true فاذكر رقمه (orderNumber)، ومع تفعيل التتبّع اذكر الدور الجاري الآن (currentOrder) ومدة الانتظار التقديرية (estimatedWaitMin). القادمة تُعرض الأقرب أولاً، والسابقة الأحدث أولاً (٢٠ في الصفحة)؛ يمكن التصفية بالطبيب (doctorId) أو الحالة أو اليوم (YYYY-MM-DD). ${LIST_HINT}`,
        schema: z.object({
          upcoming: z.boolean().nullable().describe("true للمواعيد القادمة فقط"),
          doctorId: z.string().nullable().describe("معرّف الطبيب (اختياري)"),
          status: z.nativeEnum(AppointmentStatus).nullable(),
          date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD")
            .nullable(),
          showAll: showAllField,
          page: pageField,
        }),
      },
      async (input) => {
        const { upcoming, doctorId, status, date, page } = input;
        const fetchPage = (
          s: AppointmentStatus | undefined,
          f: { upcoming?: boolean; doctorId?: string; date?: string },
          size: number,
        ) =>
          AppointmentService.getPatientAppointmentsPage(
            patientId,
            ctx.clinicId,
            s,
            f,
            pageRequest(page ?? 1, size),
          );
        const appts = await fetchPage(
          status ?? undefined,
          {
            upcoming: upcoming ?? false,
            doctorId: doctorId ?? undefined,
            date: date ?? undefined,
          },
          20,
        );
        const filtered = !!(upcoming || doctorId || status || date);
        if (shouldAskForFilter(filtered, input, appts.total)) {
          // Size-1 pages: only their totals are read.
          const [next, done, cancelled] = await Promise.all([
            fetchPage(undefined, { upcoming: true }, 1),
            fetchPage(AppointmentStatus.COMPLETED, {}, 1),
            fetchPage(AppointmentStatus.CANCELLED, {}, 1),
          ]);
          return askForFilter(appts.total, "أي مواعيد تريد أن تراها؟", [
            { label: "القادمة", args: { upcoming: true }, count: next.total },
            { label: "الزيارات السابقة", args: { status: AppointmentStatus.COMPLETED }, count: done.total },
            { label: "الملغاة", args: { status: AppointmentStatus.CANCELLED }, count: cancelled.total },
          ]);
        }
        return {
          ...pageInfo(appts),
          appointments: appts.items.map((a) => ({
            id: a.id,
            status: a.status,
            doctorName: a.doctor.profile.fullName,
            specialty: a.doctor.specialty,
            branch: a.branch?.name ?? null,
            bookingType: a.dayOnly
              ? "day"
              : a.arrivalBased
                ? "arrival"
                : a.isOrderBased
                  ? "order"
                  : "slot",
            arrived: a.arrived,
            ...(a.dayOnly && { scheduledTime: a.scheduledTime }),
            date: a.slot
              ? dateStr(a.slot.date)
              : a.bookingDate
                ? dateStr(a.bookingDate)
                : null,
            time: a.slot ? timeStr(a.slot.startTime) : null,
            services: a.items?.map((i) => i.serviceName) ?? [],
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
        name: "get_health_profile",
        description:
          "اعرض «ملف المريض» الصحي للمريض الحالي لدى هذه العيادة: الأسئلة وإجاباته الحالية والأسئلة المطلوبة التي لم يُجب عليها بعد. استخدمها لمعرفة حالته الصحية (مثل الحساسية أو الأمراض المزمنة) أو عندما يطلب المريض مراجعة ملفه أو تعديله.",
        schema: z.object({}),
      },
      async () => {
        const [view, staff] = await Promise.all([
          HealthProfileService.getPatientHealthProfile(ctx.clinicId, patientId, {
            audience: "PATIENT",
          }),
          HealthProfileService.getPatientHealthProfile(ctx.clinicId, patientId, {
            audience: "STAFF",
          }),
        ]);
        const all = flattenQuestions(view.sections);
        const staffQuestions = flattenQuestions(staff.sections);
        return {
          sections: view.sections
            .filter((s) => s.questions.length > 0)
            .map((s) => ({
              title: s.title,
              questions: flattenQuestions([s])
                .filter((q) => isQuestionVisible(q, view.answers))
                .map((q) => ({
                  questionId: q.id,
                  question: q.label,
                  type: QUESTION_TYPE_LABEL[q.type],
                  required: q.required,
                  ...(q.type === "SELECT" && { options: q.options.map((o) => o.label) }),
                  answer: formatAnswer(q, view.answers[q.id]),
                })),
            })),
          missingRequired: missingRequired(view.sections, view.answers).map((q) =>
            agentQuestion(q, all)
          ),
          // PRIVATE: written by the clinic team. Use only as background — never
          // quote, mention or hint at these to the patient.
          privateStaffNotes: staffQuestions
            .filter((q) => staff.answers[q.id] !== undefined)
            .map((q) => ({ note: q.label, value: formatAnswer(q, staff.answers[q.id]) })),
        };
      },
    ),
    jsonTool(
      {
        name: "save_health_answers",
        description:
          "احفظ إجابة أو أكثر من إجابات المريض الحالي على أسئلة «ملف المريض» (من needsHealthProfile في أداة الحجز أو من get_health_profile). يمكن الحفظ تدريجياً. بعد حفظ الأسئلة المطلوبة أعد محاولة الحجز نفسه مباشرةً.",
        schema: z.object({
          answers: z
            .array(
              z.object({
                questionId: z.string().describe("questionId كما ورد في الأداة"),
                answer: z
                  .string()
                  .nullable()
                  .describe(
                    "إجابة المريض: نص كما قاله؛ للرقم أرقام فقط؛ لسؤال نعم/لا «نعم» أو «لا»؛ لقائمة الاختيار نص أحد الخيارات حرفياً؛ null لمسح الإجابة"
                  ),
              })
            )
            .min(1),
        }),
      },
      async ({ answers }) => {
        const res = await HealthProfileService.saveAnswers({
          clinicId: ctx.clinicId,
          patientId,
          answers: Object.fromEntries(answers.map((a) => [a.questionId, a.answer])),
          source: "AGENT",
          actorId: patientId,
        });
        if (!res.ok) return { error: res.error };
        const stillMissing = await HealthProfileService.missingRequiredAnswers(
          ctx.clinicId,
          patientId
        );
        return {
          saved: true,
          stillMissingRequired: stillMissing.map((q) => ({ questionId: q.id, question: q.label })),
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
                clinicId: ctx.clinicId, // #38: scope to this clinic
                status: AppointmentStatus.COMPLETED,
                feedback: null,
              },
              select: { id: true, clinicId: true },
            })
          : await prisma.appointment.findFirst({
              where: {
                patientId,
                clinicId: ctx.clinicId,
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
