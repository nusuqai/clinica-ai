import "server-only";
import { z } from "zod";
import { OperationStatus } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/agent/types";
import { formatFee } from "@/lib/currency";
import { OPERATION_STATUS_LABEL, formatHHMMAr } from "@/lib/operations";
import { formatSlotDate } from "@/lib/slot-time";
import * as Operations from "@/server/services/operations";
import { notifyOperationRequest } from "@/server/services/staff/notifications";
import { jsonTool } from "./shared";

/**
 * Patient-side operation tools. A patient can NEVER book or schedule an
 * operation: they can only ask for one (which opens a request and alerts the
 * team) and read their own cases.
 */
export function patientOperationTools(ctx: AgentContext): DynamicStructuredTool[] {
  const patientId = ctx.actorId!;
  return [
    jsonTool(
      {
        name: "request_operation",
        description:
          "سجّل رغبة المريض الحالي في إجراء عملية (جراحة) — لا يحجز موعداً ولا يحدد سعراً نهائياً: يفتح «طلب عملية» ويُبلغ فريق العيادة ليتواصل معه ويجهّز كل شيء (الكشف، التحاليل، الموعد، التكلفة). استخدمه بعد أن يؤكد المريض أنه يريد التواصل بخصوص العملية. مرّر serviceId إن كانت العملية من خدمات العيادة (من search_services)، وإلا اكتب اسمها في operationName.",
        schema: z.object({
          serviceId: z.string().nullable().describe("خدمة من نوع «عملية» من search_services (اختياري)"),
          operationName: z
            .string()
            .nullable()
            .describe("اسم العملية كما ذكرها المريض إن لم تكن في الخدمات"),
          details: z
            .string()
            .nullable()
            .describe("ما ذكره المريض عن حالته أو أسئلته أو الوقت المناسب له للتواصل"),
        }),
      },
      async ({ serviceId, operationName, details }) => {
        if (!serviceId && !operationName?.trim())
          return { error: "حدّد العملية (serviceId أو operationName)" };
        if (serviceId) {
          const s = await prisma.service.findFirst({
            where: { id: serviceId, clinicId: ctx.clinicId, isActive: true },
            select: { id: true },
          });
          if (!s) return { error: "الخدمة غير موجودة — ابحث بـ search_services أولاً" };
        }
        const res = await Operations.requestOperationFromPatient({
          clinicId: ctx.clinicId,
          patientId,
          serviceId: serviceId ?? null,
          name: operationName,
          note: details,
          conversationId: ctx.conversationId,
        });
        if (!res.ok) return { error: res.error };
        if (res.data.isNew) await notifyOperationRequest(res.data.id);
        return {
          requested: true,
          operation: res.data.name,
          alreadyRequested: !res.data.isNew,
          nextStep:
            "أخبر المريض أن طلبه وصل لفريق العيادة وسيتواصلون معه قريباً لترتيب كل التفاصيل (الكشف، التحاليل المطلوبة، الموعد والتكلفة). لا تَعِده بموعد أو سعر نهائي.",
        };
      }
    ),
    jsonTool(
      {
        name: "list_my_operations",
        description:
          "عمليات المريض الحالي في هذه العيادة (طلبات وعمليات محددة وسابقة): الحالة، الموعد والمكان والجرّاح إن حُدّدت، التجهيزات المطلوبة منه، وتعليمات ما قبل/بعد العملية، والمدفوع والمتبقي. للقراءة فقط — لا يمكن تغيير موعد عملية أو إلغاؤها من هنا؛ لأي تغيير صعّد للفريق.",
        schema: z.object({}),
      },
      async () => {
        const ops = await Operations.listPatientOperations(ctx.clinicId, patientId);
        if (ops.length === 0) return { operations: [], note: "لا توجد عمليات أو طلبات عمليات لهذا المريض." };
        return {
          operations: ops.map((o) => {
            const paid = o.payments.reduce((sum, p) => sum + Number(p.amount), 0);
            const price = o.price != null ? Number(o.price) : null;
            const scheduled = o.status === OperationStatus.SCHEDULED;
            return {
              operation: o.name,
              status: OPERATION_STATUS_LABEL[o.status],
              date:
                scheduled && o.scheduledDate
                  ? formatSlotDate(o.scheduledDate, { weekday: "long", day: "numeric", month: "long" })
                  : null,
              time: scheduled ? formatHHMMAr(o.startTime) || null : null,
              location: o.branch
                ? `${o.branch.name}${o.branch.address ? ` — ${o.branch.address}` : ""}`
                : o.hospitalName,
              surgeon: o.doctor?.fullName ?? null,
              stillNeeded: o.checklist.filter((c) => !c.doneAt).map((c) => c.label),
              preOpInstructions:
                o.status === OperationStatus.DONE || o.status === OperationStatus.CLOSED
                  ? null
                  : o.preOpInstructions,
              postOpInstructions:
                o.status === OperationStatus.DONE || o.status === OperationStatus.CLOSED
                  ? o.postOpInstructions
                  : null,
              agreedPrice: price != null ? formatFee(price) : null,
              paid: paid > 0 ? formatFee(paid) : null,
              remaining: price != null ? formatFee(Math.max(0, price - paid)) : null,
            };
          }),
          note: "لا تَعِد بتغيير موعد أو إلغاء: أي تغيير يتم عن طريق فريق العيادة (escalate_to_human).",
        };
      }
    ),
  ];
}
