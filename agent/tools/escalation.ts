import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/agent/types";
import { jsonTool } from "./shared";

/**
 * Available to all identified (non-null-role) callers. Logs an escalation so
 * staff are notified and can follow up — the AI keeps auto-replying in the
 * session (staff can still turn it off manually from the inbox). A session can
 * accumulate several of these if the user asks for a human more than once.
 */
export function escalationTool(ctx: AgentContext): DynamicStructuredTool {
  return jsonTool(
    {
      name: "escalate_to_human",
      description:
        "استخدمه عندما يطلب المستخدم موظفاً بشرياً أو عند طلب خارج قدراتك — سيتم إشعار أحد الموظفين لمتابعة المحادثة، وتستمر أنت في الرد على المستخدم.",
      schema: z.object({ reason: z.string().nullable() }),
    },
    async ({ reason }) => {
      await prisma.escalation.create({
        data: {
          clinicId: ctx.clinicId,
          conversationId: ctx.conversationId,
          sessionId: ctx.sessionId,
          reason: reason ?? null,
        },
      });
      return { escalated: true, reason: reason ?? null };
    },
  );
}
