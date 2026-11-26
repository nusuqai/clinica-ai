import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { OperationStatus, ServiceKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatFee } from "@/lib/currency";
import {
  OPERATION_STATUS_LABEL,
  OPERATION_TRANSITIONS,
  OPEN_OPERATION_STATUSES,
  formatHHMMAr,
} from "@/lib/operations";
import { formatSlotDate } from "@/lib/slot-time";
import { normalizeHHMM } from "@/lib/availability/modes";
import * as Operations from "@/server/services/operations";
import * as UserService from "@/server/services/users";
import { jsonTool, pageField } from "../shared";
import type { StaffToolContext, WriteAction } from "./pending";
import { can, dateField } from "./helpers";

/**
 * Team-assistant tools for Operations (العمليات). Reads are plain tools; every
 * change is a WriteAction (proposed, shown, then confirmed by the member — see
 * pending.ts). Sending a message to the patient is a write too: it is outward
 * facing and can't be undone.
 */

const PAGE_SIZE = 15;
const allowed = (a: StaffToolContext["staff"]) => can(a, "operations");

function day(d: string | null): string | null {
  if (!d) return null;
  return formatSlotDate(new Date(`${d}T00:00:00Z`), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function brief(o: Operations.OperationListItem) {
  return {
    operationId: o.id,
    operation: o.name,
    status: OPERATION_STATUS_LABEL[o.status],
    statusCode: o.status,
    patient: o.patient.fullName,
    patientId: o.patient.id,
    phone: o.patient.phone,
    surgeon: o.doctor?.fullName ?? null,
    date: day(o.scheduledDate),
    time: formatHHMMAr(o.startTime) || null,
    location: o.location || null,
    checklist: o.checklistTotal ? `${o.checklistDone}/${o.checklistTotal}` : null,
    price: o.price != null ? formatFee(o.price) : null,
    paid: o.paid ? formatFee(o.paid) : null,
    remaining: o.remaining != null ? formatFee(o.remaining) : null,
    coordinator: o.coordinator?.fullName ?? null,
  };
}

function detail(o: Operations.OperationDetail) {
  return {
    ...brief(o),
    type: o.serviceName,
    durationMin: o.durationMin,
    anesthesia: o.anesthesia,
    consentSigned: o.consentSigned,
    blockSurgeonSchedule: o.blockSchedule,
    requestNote: o.requestNote,
    internalNotes: o.notes,
    preOpInstructions: o.preOpInstructions,
    postOpInstructions: o.postOpInstructions,
    cancelReason: o.cancelReason,
    checklistItems: o.checklist.map((c) => ({ itemId: c.id, item: c.label, done: c.done })),
    payments: o.payments.map((p) => ({
      amount: formatFee(p.amount),
      method: p.method,
      date: p.paidAt.toISOString().slice(0, 10),
    })),
    attachments: o.attachments.map((a) => a.fileName),
    history: o.events.slice(0, 10).map((e) => ({
      at: e.createdAt.toISOString().slice(0, 16).replace("T", " "),
      by: e.actorName,
      what: e.text,
    })),
    nextActions: OPERATION_TRANSITIONS[o.status].map((s) => OPERATION_STATUS_LABEL[s]),
  };
}

/** Read tools for ADMIN / STAFF holding the operations permission. */
export function operationReadTools(ctx: StaffToolContext): DynamicStructuredTool[] {
  if (!allowed(ctx.staff)) return [];
  const { clinicId } = ctx;
  const scope = ctx.staff.branchIds;
  return [
    jsonTool(
      {
        name: "list_operations",
        description:
          "قائمة العمليات (طلبات جديدة، قيد التجهيز، محددة، تمت، مغلقة، ملغاة) مع المريض والجرّاح والموعد والمكان والتجهيزات والمدفوع والمتبقي. بدون status تُعرض الحالات المفتوحة فقط. للأسئلة مثل «عمليات الأسبوع الجاي» مرّر from/to، و«الطلبات الجديدة» status=REQUESTED.",
        schema: z.object({
          status: z
            .nativeEnum(OperationStatus)
            .nullable()
            .describe(
              "REQUESTED طلب جديد، PREPARING قيد التجهيز، SCHEDULED محددة، DONE تمت، CLOSED مغلقة، CANCELLED ملغاة"
            ),
          from: dateField.nullable().describe("من يوم (للعمليات المحددة)"),
          to: dateField.nullable().describe("إلى يوم"),
          doctorId: z.string().nullable(),
          patientQuery: z.string().nullable().describe("اسم/هاتف المريض أو اسم العملية"),
          page: pageField,
        }),
      },
      async (input) => {
        const page = input.page ?? 1;
        const res = await Operations.listOperations(
          clinicId,
          scope,
          {
            statuses: input.status ? [input.status] : OPEN_OPERATION_STATUSES,
            from: input.from,
            to: input.to,
            doctorId: input.doctorId,
            query: input.patientQuery,
          },
          { take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }
        );
        const hasMore = page * PAGE_SIZE < res.total;
        return {
          total: res.total,
          page,
          hasMore,
          ...(hasMore && { nextPage: page + 1 }),
          operations: res.items.map(brief),
        };
      }
    ),
    jsonTool(
      {
        name: "get_operation",
        description:
          "كل تفاصيل عملية واحدة: الموعد والمكان والجرّاح، التخدير، الإقرار، قائمة التجهيزات (مع itemId لكل بند)، الدفعات، التعليمات، الملاحظات الداخلية، وآخر ما حدث في الحالة.",
        schema: z.object({ operationId: z.string() }),
      },
      async ({ operationId }) => {
        const o = await Operations.getOperation(clinicId, scope, operationId);
        return o ? detail(o) : { error: "العملية غير موجودة" };
      }
    ),
    jsonTool(
      {
        name: "list_operation_types",
        description:
          "أنواع العمليات في كتالوج العيادة (خدمات من نوع «عملية») مع السعر والمدة — استخدم serviceId منها عند إنشاء عملية؛ يُنسخ منها تلقائياً قائمة التجهيزات والتعليمات.",
        schema: z.object({ query: z.string().nullable() }),
      },
      async ({ query }) => {
        const q = query?.trim();
        const rows = await prisma.service.findMany({
          where: {
            clinicId,
            kind: ServiceKind.OPERATION,
            isActive: true,
            ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
          },
          select: {
            id: true,
            name: true,
            price: true,
            pricingType: true,
            durationMin: true,
            operationChecklist: true,
          },
          orderBy: { name: "asc" },
          take: 30,
        });
        return {
          types: rows.map((s) => ({
            serviceId: s.id,
            name: s.name,
            price: s.price != null ? formatFee(Number(s.price)) : null,
            durationMin: s.durationMin,
            checklistItems: s.operationChecklist.length,
          })),
          ...(rows.length === 0 && {
            note: "لا توجد أنواع عمليات في الكتالوج — يمكن إنشاء العملية باسم حر (operationName).",
          }),
        };
      }
    ),
  ];
}

/** A doctor's own operations (as the surgeon) — read only. */
export function doctorOperationTools(ctx: StaffToolContext): DynamicStructuredTool[] {
  const doctorId = ctx.staff.doctorId;
  if (!doctorId) return [];
  return [
    jsonTool(
      {
        name: "list_my_operations",
        description:
          "العمليات التي أنا الجرّاح فيها: القادمة والمحددة وقيد التجهيز (أو حسب الحالة/الأيام)، مع المريض والموعد والمكان والتجهيزات.",
        schema: z.object({
          status: z.nativeEnum(OperationStatus).nullable(),
          from: dateField.nullable(),
          to: dateField.nullable(),
        }),
      },
      async (input) => {
        const res = await Operations.listOperations(ctx.clinicId, null, {
          doctorId,
          statuses: input.status ? [input.status] : OPEN_OPERATION_STATUSES,
          from: input.from,
          to: input.to,
        });
        return {
          total: res.total,
          operations: res.items.slice(0, 30).map((o) => {
            const b = brief(o);
            // Money is the front desk's business, not shown to the surgeon here.
            return { ...b, price: undefined, paid: undefined, remaining: undefined };
          }),
        };
      }
    ),
  ];
}

// ─── Writes ───────────────────────────────────────────────────────────────────

async function scopedOp(ctx: StaffToolContext, operationId: string) {
  return Operations.getOperation(ctx.clinicId, ctx.staff.branchIds, operationId);
}

function line(o: Pick<Operations.OperationListItem, "name" | "patient">) {
  return `«${o.name}» للمريض ${o.patient.fullName}`;
}

async function names(ids: { doctorId?: string | null; branchId?: string | null; serviceId?: string | null; userId?: string | null }) {
  const [doctor, branch, service, user] = await Promise.all([
    ids.doctorId
      ? prisma.doctor.findUnique({ where: { id: ids.doctorId }, select: { fullName: true } })
      : null,
    ids.branchId
      ? prisma.branch.findUnique({ where: { id: ids.branchId }, select: { name: true } })
      : null,
    ids.serviceId
      ? prisma.service.findUnique({ where: { id: ids.serviceId }, select: { name: true } })
      : null,
    ids.userId
      ? prisma.profile.findUnique({ where: { id: ids.userId }, select: { fullName: true } })
      : null,
  ]);
  return {
    doctor: doctor?.fullName,
    branch: branch?.name,
    service: service?.name,
    user: user?.fullName,
  };
}

const createSchema = z.object({
  patientId: z.string().describe("من search_patients"),
  serviceId: z.string().nullable().describe("نوع العملية من list_operation_types (اختياري)"),
  operationName: z.string().nullable().describe("اسم العملية إن لم تكن من الكتالوج"),
  doctorId: z.string().nullable().describe("الجرّاح من list_doctors"),
  branchId: z.string().nullable().describe("فرع العيادة الذي ستُجرى فيه (أو اتركه واكتب hospitalName)"),
  hospitalName: z.string().nullable().describe("مستشفى خارجي إن لم تكن في فرع العيادة"),
  price: z.number().nullable().describe("التكلفة المتفق عليها (اختياري)"),
  notes: z.string().nullable().describe("ملاحظات داخلية"),
  coordinatorUserId: z
    .string()
    .nullable()
    .describe("عضو الفريق المسؤول عن متابعة الحالة؛ فارغ = المستخدم نفسه"),
});

const createOp: WriteAction<typeof createSchema> = {
  name: "create_operation",
  description:
    "أنشئ حالة عملية جديدة لمريض (بحالة «قيد التجهيز»). حدّد الموعد بعدها بـ schedule_operation.",
  schema: createSchema,
  allowed,
  async prepare(ctx, a) {
    if (!(await UserService.isClinicPatient(a.patientId, ctx.clinicId)))
      return { error: "المريض غير موجود في هذه العيادة" };
    if (!a.serviceId && !a.operationName?.trim()) return { error: "حدّد نوع العملية أو اسمها" };
    const [patient, n] = await Promise.all([
      prisma.profile.findUnique({ where: { id: a.patientId }, select: { fullName: true } }),
      names({ ...a, userId: a.coordinatorUserId }),
    ]);
    const parts = [
      `إنشاء عملية «${a.operationName?.trim() || n.service || ""}» للمريض ${patient?.fullName ?? ""}`,
      n.doctor ? `الجرّاح: ${n.doctor}` : "",
      n.branch ? `المكان: ${n.branch}` : a.hospitalName ? `المكان: ${a.hospitalName}` : "",
      a.price != null ? `التكلفة: ${formatFee(a.price)}` : "",
      n.user ? `المسؤول: ${n.user}` : "",
    ];
    return { summary: parts.filter(Boolean).join(" — ") };
  },
  async execute(ctx, a) {
    const res = await Operations.createOperation(ctx.clinicId, ctx.staff.branchIds, ctx.actorId, {
      patientId: a.patientId,
      serviceId: a.serviceId,
      name: a.operationName,
      doctorId: a.doctorId,
      branchId: a.branchId,
      hospitalName: a.hospitalName,
      price: a.price,
      notes: a.notes,
      coordinatorId: a.coordinatorUserId ?? ctx.actorId,
    });
    if (!res.ok) throw new Error(res.error);
    const o = await scopedOp(ctx, res.data.id);
    return o ? detail(o) : { operationId: res.data.id };
  },
};

const updateSchema = z.object({
  operationId: z.string(),
  operationName: z.string().nullable(),
  serviceId: z.string().nullable(),
  doctorId: z.string().nullable().describe("الجرّاح"),
  branchId: z.string().nullable(),
  hospitalName: z.string().nullable(),
  durationMin: z.number().int().nullable(),
  anesthesia: z.string().nullable().describe("نوع التخدير"),
  price: z.number().nullable(),
  notes: z.string().nullable().describe("ملاحظات داخلية (تستبدل الحالية)"),
  preOpInstructions: z.string().nullable(),
  postOpInstructions: z.string().nullable(),
  consentSigned: z.boolean().nullable().describe("تم توقيع الإقرار"),
  blockSurgeonSchedule: z.boolean().nullable().describe("حجز جدول الجرّاح وقت العملية"),
  coordinatorUserId: z.string().nullable(),
});
type UpdateArgs = z.infer<typeof updateSchema>;

/** Only the fields given (non-null) change. */
function patchOf(a: UpdateArgs): Operations.OperationPatch {
  const p: Operations.OperationPatch = {};
  if (a.operationName != null) p.name = a.operationName;
  if (a.serviceId != null) p.serviceId = a.serviceId;
  if (a.doctorId != null) p.doctorId = a.doctorId;
  if (a.branchId != null) p.branchId = a.branchId;
  if (a.hospitalName != null) p.hospitalName = a.hospitalName;
  if (a.durationMin != null) p.durationMin = a.durationMin;
  if (a.anesthesia != null) p.anesthesia = a.anesthesia;
  if (a.price != null) p.price = a.price;
  if (a.notes != null) p.notes = a.notes;
  if (a.preOpInstructions != null) p.preOpInstructions = a.preOpInstructions;
  if (a.postOpInstructions != null) p.postOpInstructions = a.postOpInstructions;
  if (a.consentSigned != null) p.consentSigned = a.consentSigned;
  if (a.blockSurgeonSchedule != null) p.blockSchedule = a.blockSurgeonSchedule;
  if (a.coordinatorUserId != null) p.coordinatorId = a.coordinatorUserId;
  return p;
}

const updateOp: WriteAction<typeof updateSchema> = {
  name: "update_operation",
  description:
    "عدّل بيانات عملية: الجرّاح، المكان، المدة، التخدير، التكلفة، الإقرار، التعليمات، الملاحظات، المسؤول. مرّر فقط ما يتغير (الباقي null).",
  schema: updateSchema,
  allowed,
  async prepare(ctx, a) {
    const o = await scopedOp(ctx, a.operationId);
    if (!o) return { error: "العملية غير موجودة" };
    const p = patchOf(a);
    if (Object.keys(p).length === 0) return { error: "لم تحدد ما يتغير" };
    const n = await names({ ...a, userId: a.coordinatorUserId });
    const changes = [
      p.name && `الاسم: ${p.name}`,
      n.service && `النوع: ${n.service}`,
      n.doctor && `الجرّاح: ${n.doctor}`,
      n.branch && `المكان: ${n.branch}`,
      p.hospitalName && `المكان: ${p.hospitalName}`,
      p.durationMin && `المدة: ${p.durationMin} دقيقة`,
      p.anesthesia && `التخدير: ${p.anesthesia}`,
      p.price != null && `التكلفة: ${formatFee(p.price)}`,
      p.consentSigned != null && (p.consentSigned ? "تم توقيع الإقرار" : "الإقرار غير موقّع"),
      p.blockSchedule != null &&
        (p.blockSchedule ? "حجز جدول الجرّاح وقت العملية" : "عدم حجز جدول الجرّاح"),
      p.preOpInstructions && "تحديث تعليمات ما قبل العملية",
      p.postOpInstructions && "تحديث تعليمات ما بعد العملية",
      p.notes && "تحديث الملاحظات الداخلية",
      n.user && `المسؤول: ${n.user}`,
    ].filter(Boolean);
    return { summary: `تعديل عملية ${line(o)}: ${changes.join("، ")}` };
  },
  async execute(ctx, a) {
    const res = await Operations.updateOperation(
      ctx.clinicId,
      ctx.staff.branchIds,
      ctx.actorId,
      a.operationId,
      patchOf(a)
    );
    if (!res.ok) throw new Error(res.error);
    return { updated: true, conflicts: res.data.conflicts };
  },
};

const scheduleSchema = z.object({
  operationId: z.string(),
  date: dateField,
  time: z.string().describe("HH:MM بتوقيت العيادة (24 ساعة)"),
  durationMin: z.number().int().nullable().describe("المدة بالدقائق (اختياري)"),
});

const scheduleOp: WriteAction<typeof scheduleSchema> = {
  name: "schedule_operation",
  description:
    "حدّد (أو غيّر) موعد عملية: التاريخ والوقت والمدة. يحجز جدول الجرّاح في هذا الوقت تلقائياً، ويعرض أي تعارض مع مواعيده. لا يرسل شيئاً للمريض — أرسل التفاصيل بعدها بـ send_operation_message إن طُلب.",
  schema: scheduleSchema,
  allowed,
  async prepare(ctx, a) {
    const o = await scopedOp(ctx, a.operationId);
    if (!o) return { error: "العملية غير موجودة" };
    if (!o.doctor) return { error: "حدّد الجرّاح أولاً (update_operation)" };
    const time = normalizeHHMM(a.time);
    if (!time) return { error: "الوقت غير صالح (HH:MM)" };
    const date = new Date(`${a.date}T00:00:00Z`);
    const conflicts = await Operations.scheduleConflicts(ctx.clinicId, {
      doctorId: o.doctor.id,
      date,
      startTime: time,
      durationMin: a.durationMin ?? o.durationMin,
      excludeOperationId: o.id,
    });
    const minutes = a.durationMin ?? o.durationMin ?? Operations.DEFAULT_OPERATION_MINUTES;
    const warn = conflicts.length ? ` ⚠️ تعارض مع: ${conflicts.join("؛ ")}` : "";
    return {
      summary: `${o.scheduledDate ? "تغيير" : "تحديد"} موعد عملية ${line(o)} مع ${o.doctor.fullName}: ${Operations.whenLabel(date, time)} (${minutes} دقيقة)${o.location ? ` في ${o.location}` : ""}${warn}`,
    };
  },
  async execute(ctx, a) {
    const res = await Operations.scheduleOperation(
      ctx.clinicId,
      ctx.staff.branchIds,
      ctx.actorId,
      a.operationId,
      { date: a.date, startTime: a.time, durationMin: a.durationMin }
    );
    if (!res.ok) throw new Error(res.error);
    return { scheduled: true, conflicts: res.data.conflicts };
  },
};

const STATUS_TARGETS = [
  OperationStatus.PREPARING,
  OperationStatus.DONE,
  OperationStatus.CLOSED,
  OperationStatus.CANCELLED,
] as const;

const statusSchema = z.object({
  operationId: z.string(),
  status: z
    .enum(STATUS_TARGETS)
    .describe(
      "PREPARING بدء التجهيز / تأجيل عملية محددة / إعادة فتح ملغاة، DONE تمت العملية، CLOSED إغلاق بعد انتهاء المتابعة، CANCELLED إلغاء"
    ),
  reason: z.string().nullable().describe("السبب (للإلغاء أو التأجيل)"),
});

const setStatus: WriteAction<typeof statusSchema> = {
  name: "set_operation_status",
  description:
    "غيّر حالة عملية: بدء التجهيز بعد التواصل مع صاحب الطلب، تأجيل عملية محددة (يلغي موعدها ويحرر جدول الجرّاح)، تمت، إغلاق، أو إلغاء.",
  schema: statusSchema,
  allowed,
  async prepare(ctx, a) {
    const o = await scopedOp(ctx, a.operationId);
    if (!o) return { error: "العملية غير موجودة" };
    if (!OPERATION_TRANSITIONS[o.status].includes(a.status))
      return {
        error: `لا يمكن تغيير الحالة من «${OPERATION_STATUS_LABEL[o.status]}» إلى «${OPERATION_STATUS_LABEL[a.status]}»`,
      };
    const why = a.reason ? ` (السبب: ${a.reason})` : "";
    return {
      summary: `تغيير حالة عملية ${line(o)} من «${OPERATION_STATUS_LABEL[o.status]}» إلى «${OPERATION_STATUS_LABEL[a.status]}»${why}`,
    };
  },
  async execute(ctx, a) {
    const res = await Operations.setOperationStatus(
      ctx.clinicId,
      ctx.staff.branchIds,
      ctx.actorId,
      a.operationId,
      a.status,
      a.reason
    );
    if (!res.ok) throw new Error(res.error);
    return { operationId: a.operationId, status: OPERATION_STATUS_LABEL[a.status] };
  },
};

const checklistSchema = z.object({
  operationId: z.string(),
  add: z.array(z.string()).nullable().describe("بنود جديدة تضاف للتجهيزات"),
  markDone: z.array(z.string()).nullable().describe("itemId لبنود تمت (من get_operation)"),
  markNotDone: z.array(z.string()).nullable().describe("itemId لبنود تُعاد لـ «لم يتم»"),
  remove: z.array(z.string()).nullable().describe("itemId لبنود تُحذف"),
});

const checklist: WriteAction<typeof checklistSchema> = {
  name: "update_operation_checklist",
  description:
    "حدّث قائمة تجهيزات عملية: أضف بنوداً، علّم بنوداً «تمت» (مثل وصول نتيجة التحليل)، أو احذف بنوداً. احصل على itemId من get_operation.",
  schema: checklistSchema,
  allowed,
  async prepare(ctx, a) {
    const o = await scopedOp(ctx, a.operationId);
    if (!o) return { error: "العملية غير موجودة" };
    const byId = new Map(o.checklist.map((c) => [c.id, c.label]));
    const ids = [...(a.markDone ?? []), ...(a.markNotDone ?? []), ...(a.remove ?? [])];
    if (ids.some((id) => !byId.has(id))) return { error: "بند غير موجود — استخدم itemId من get_operation" };
    const parts = [
      a.add?.length && `إضافة: ${a.add.join("، ")}`,
      a.markDone?.length && `تمت: ${a.markDone.map((id) => byId.get(id)).join("، ")}`,
      a.markNotDone?.length && `لم تتم: ${a.markNotDone.map((id) => byId.get(id)).join("، ")}`,
      a.remove?.length && `حذف: ${a.remove.map((id) => byId.get(id)).join("، ")}`,
    ].filter(Boolean);
    if (parts.length === 0) return { error: "لم تحدد أي تغيير" };
    return { summary: `تجهيزات عملية ${line(o)} — ${parts.join(" | ")}` };
  },
  async execute(ctx, a) {
    const scope = ctx.staff.branchIds;
    const o = await scopedOp(ctx, a.operationId);
    if (!o) throw new Error("العملية غير موجودة");
    const mine = new Set(o.checklist.map((c) => c.id));
    if (a.add?.length) {
      const r = await Operations.addChecklistItems(ctx.clinicId, scope, ctx.actorId, o.id, a.add);
      if (!r.ok) throw new Error(r.error);
    }
    for (const id of a.markDone ?? [])
      if (mine.has(id)) await Operations.setChecklistItemDone(ctx.clinicId, scope, ctx.actorId, id, true);
    for (const id of a.markNotDone ?? [])
      if (mine.has(id)) await Operations.setChecklistItemDone(ctx.clinicId, scope, ctx.actorId, id, false);
    for (const id of a.remove ?? [])
      if (mine.has(id)) await Operations.removeChecklistItem(ctx.clinicId, scope, ctx.actorId, id);
    const fresh = await scopedOp(ctx, o.id);
    return {
      checklist: fresh?.checklist.map((c) => ({ itemId: c.id, item: c.label, done: c.done })),
    };
  },
};

const paymentSchema = z.object({
  operationId: z.string(),
  amount: z.number().min(0.01).describe("المبلغ المدفوع"),
  method: z.string().nullable().describe("كاش، فيزا، تحويل…"),
  note: z.string().nullable(),
});

const payment: WriteAction<typeof paymentSchema> = {
  name: "record_operation_payment",
  description: "سجّل دفعة (عربون أو قسط) على عملية.",
  schema: paymentSchema,
  allowed,
  async prepare(ctx, a) {
    const o = await scopedOp(ctx, a.operationId);
    if (!o) return { error: "العملية غير موجودة" };
    const after = o.price != null ? ` — المتبقي بعدها ${formatFee(Math.max(0, o.price - o.paid - a.amount))}` : "";
    return {
      summary: `تسجيل دفعة ${formatFee(a.amount)}${a.method ? ` (${a.method})` : ""} على عملية ${line(o)}${after}`,
    };
  },
  async execute(ctx, a) {
    const res = await Operations.addPayment(ctx.clinicId, ctx.staff.branchIds, ctx.actorId, a.operationId, {
      amount: a.amount,
      method: a.method,
      note: a.note,
    });
    if (!res.ok) throw new Error(res.error);
    const o = await scopedOp(ctx, a.operationId);
    return {
      paid: o ? formatFee(o.paid) : null,
      remaining: o?.remaining != null ? formatFee(o.remaining) : null,
    };
  },
};

const messageSchema = z.object({
  operationId: z.string(),
  kind: z
    .enum(["details", "preop", "postop", "custom"])
    .describe(
      "details تفاصيل الموعد والمكان والتعليمات والتجهيزات، preop تعليمات ما قبل العملية والتجهيزات، postop تعليمات ما بعد العملية، custom نص تكتبه"
    ),
  customText: z.string().nullable().describe("نص الرسالة عند kind=custom"),
});

const sendMessage: WriteAction<typeof messageSchema> = {
  name: "send_operation_message",
  description:
    "أرسل للمريض على واتساب معلومات عمليته (التفاصيل والموعد، تعليمات ما قبل أو بعد العملية، أو رسالة مخصّصة). الرسالة تظهر في محادثته في صندوق الرسائل.",
  schema: messageSchema,
  allowed,
  async prepare(ctx, a) {
    const res = await Operations.previewOperationMessage(
      ctx.clinicId,
      ctx.staff.branchIds,
      a.operationId,
      a.kind,
      a.customText
    );
    if (!res.ok) return { error: res.error };
    return {
      summary: `إرسال رسالة واتساب إلى ${res.data.patientName}:\n\n${res.data.text}`,
    };
  },
  async execute(ctx, a) {
    const res = await Operations.sendOperationMessage(
      ctx.clinicId,
      ctx.staff.branchIds,
      ctx.actorId,
      a.operationId,
      a.kind,
      a.customText
    );
    if (!res.ok) throw new Error(res.error);
    return { sent: true };
  },
};

/** Every operations write an ADMIN / STAFF member can be offered. */
export const OPERATION_WRITE_ACTIONS: WriteAction[] = [
  createOp,
  updateOp,
  scheduleOp,
  setStatus,
  checklist,
  payment,
  sendMessage,
] as WriteAction[];
