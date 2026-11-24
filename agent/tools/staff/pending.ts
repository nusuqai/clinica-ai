import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { SenderType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AgentContext, StaffActor } from "@/agent/types";
import { jsonTool } from "../shared";

/**
 * Confirm-before-acting for the team assistant (#89), enforced on the SERVER.
 *
 * A write tool never changes anything: it validates the request, then saves a
 * pending action with a human summary and returns it for the assistant to show.
 * Only `confirm_action` executes — and only an action proposed BEFORE the
 * member's latest message, i.e. the member has answered since seeing the
 * summary. So the model cannot propose and execute in the same turn, whatever
 * it decides to do. The executor re-checks everything at execution time
 * (permissions, branch scope, current state).
 */

const PENDING_TTL_MINUTES = 30;

export interface WriteAction<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: S;
  /** Who may use it at all — tools failing this are never built. */
  allowed: (actor: StaffActor) => boolean;
  /** Validates and describes the action; nothing changes here. */
  prepare: (
    ctx: StaffToolContext,
    args: z.infer<S>
  ) => Promise<{ summary: string } | { error: string }>;
  /** Performs it — re-validating, since the world may have moved meanwhile. */
  execute: (ctx: StaffToolContext, args: z.infer<S>) => Promise<unknown>;
}

/** The agent context with the staff actor guaranteed. */
export type StaffToolContext = AgentContext & { staff: StaffActor; actorId: string };

/** The tool the model calls for a write: it only proposes. */
export function proposeTool(ctx: StaffToolContext, action: WriteAction): DynamicStructuredTool {
  return jsonTool(
    {
      name: action.name,
      description: `${action.description} لا يُنفَّذ فوراً: يعيد ملخصاً اعرضه على المستخدم واطلب تأكيده، ثم نفّذ بـ confirm_action بعد موافقته.`,
      schema: action.schema,
    },
    async (args) => {
      const prepared = await action.prepare(ctx, args);
      if ("error" in prepared) return prepared;
      // One open proposal at a time: a new one replaces any earlier one.
      await prisma.staffPendingAction.updateMany({
        where: { conversationId: ctx.conversationId, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      const pending = await prisma.staffPendingAction.create({
        data: {
          clinicId: ctx.clinicId,
          conversationId: ctx.conversationId,
          actorId: ctx.actorId,
          tool: action.name,
          args: args as Prisma.InputJsonValue,
          summary: prepared.summary,
          expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60_000),
        },
        select: { id: true },
      });
      return {
        needsConfirmation: true,
        actionId: pending.id,
        summary: prepared.summary,
        instruction:
          "اعرض هذا الملخص على المستخدم واسأله: «أؤكد التنفيذ؟». لا تستدعِ confirm_action إلا بعد أن يردّ بالموافقة في رسالة جديدة.",
      };
    }
  );
}

/** confirm_action / cancel_action over the given write actions. */
export function confirmTools(
  ctx: StaffToolContext,
  actions: WriteAction[]
): DynamicStructuredTool[] {
  const byName = new Map(actions.map((a) => [a.name, a]));
  return [
    jsonTool(
      {
        name: "confirm_action",
        description:
          "نفّذ إجراءً سبق اقتراحه (actionId) بعد أن وافق عليه المستخدم صراحةً في رسالته الأخيرة («نعم»، «أكّد»، «تمام»…). لا تستخدمه في نفس الرد الذي اقترحت فيه الإجراء.",
        schema: z.object({ actionId: z.string() }),
      },
      async ({ actionId }) => {
        const pending = await prisma.staffPendingAction.findFirst({
          where: {
            id: actionId,
            conversationId: ctx.conversationId,
            actorId: ctx.actorId,
          },
        });
        if (!pending) return { error: "لا يوجد إجراء بهذا المعرّف" };
        if (pending.consumedAt) return { error: "تم تنفيذ هذا الإجراء أو إلغاؤه من قبل" };
        if (pending.expiresAt < new Date())
          return { error: "انتهت صلاحية هذا الاقتراح، اقترحه من جديد" };

        // The member must have written AFTER seeing the proposal.
        const answered = await prisma.message.findFirst({
          where: {
            conversationId: ctx.conversationId,
            senderType: SenderType.USER,
            createdAt: { gt: pending.createdAt },
          },
          select: { id: true },
        });
        if (!answered) {
          return {
            error:
              "لم يؤكد المستخدم بعد. اعرض عليه الملخص وانتظر رده قبل التنفيذ.",
            summary: pending.summary,
          };
        }

        const action = byName.get(pending.tool);
        if (!action || !action.allowed(ctx.staff)) return { error: "لا تملك صلاحية هذا الإجراء" };
        const parsed = action.schema.safeParse(pending.args);
        if (!parsed.success) return { error: "بيانات الإجراء غير صالحة" };

        // Claim it first so a retry can never run it twice.
        const claimed = await prisma.staffPendingAction.updateMany({
          where: { id: pending.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (claimed.count === 0) return { error: "تم تنفيذ هذا الإجراء من قبل" };
        try {
          return { done: true, action: pending.summary, result: await action.execute(ctx, parsed.data) };
        } catch (err) {
          return { error: err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء" };
        }
      }
    ),
    jsonTool(
      {
        name: "cancel_action",
        description: "ألغِ إجراءً مقترحاً لم يُنفَّذ بعد، عندما يرفضه المستخدم أو يغيّر رأيه.",
        schema: z.object({ actionId: z.string() }),
      },
      async ({ actionId }) => {
        const res = await prisma.staffPendingAction.updateMany({
          where: {
            id: actionId,
            conversationId: ctx.conversationId,
            actorId: ctx.actorId,
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        });
        return res.count ? { cancelled: true } : { error: "لا يوجد إجراء معلّق بهذا المعرّف" };
      }
    ),
  ];
}
