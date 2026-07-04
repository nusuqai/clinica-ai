import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { jsonTool } from "./shared";

/** Available to all identified (non-null-role) callers. */
export function escalationTool(): DynamicStructuredTool {
  return jsonTool(
    {
      name: "escalate_to_human",
      description:
        "استخدمه عندما يطلب المستخدم موظفاً بشرياً أو عند طلب خارج قدراتك — سيتابع أحد الموظفين المحادثة.",
      schema: z.object({ reason: z.string().nullable() }),
    },
    async ({ reason }) => ({ escalated: true, reason: reason ?? null }),
  );
}
