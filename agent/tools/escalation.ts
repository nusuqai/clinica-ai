import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/agent/types";
import { jsonTool } from "./shared";

/**
 * Available to all identified (non-null-role) callers. Turns off AI
 * auto-reply for the current session and logs the request — a session can
 * accumulate several of these if the admin re-enables the AI and the user
 * asks for a human again.
 */
export function escalationTool(ctx: AgentContext): DynamicStructuredTool {
  return jsonTool(
    {
      name: "escalate_to_human",
      description:
        "استخدمه عندما يطلب المستخدم موظفاً بشرياً أو عند طلب خارج قدراتك — سيتابع أحد الموظفين المحادثة.",
      schema: z.object({ reason: z.string().nullable() }),
    },
    async ({ reason }) => {
      await prisma.$transaction([
        prisma.chatSession.update({
          where: { id: ctx.sessionId },
          data: { aiEnabled: false },
        }),
        prisma.escalation.create({
          data: {
            conversationId: ctx.conversationId,
            sessionId: ctx.sessionId,
            reason: reason ?? null,
          },
        }),
      ]);
      return { escalated: true, reason: reason ?? null };
    },
  );
}
