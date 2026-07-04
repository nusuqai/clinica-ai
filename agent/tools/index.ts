import "server-only";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext } from "@/agent/types";
import { commonTools } from "./common";
import { patientTools } from "./patient";
import { doctorTools } from "./doctor";
import { adminTools } from "./admin";
import { escalationTool } from "./escalation";

/**
 * Returns EXACTLY the tools the actor's role may use. Out-of-role tools are
 * never constructed, so the model cannot see or call them.
 */
export function getToolsForRole(ctx: AgentContext): DynamicStructuredTool[] {
  // Unknown WhatsApp contact → info only, no actions.
  if (ctx.role === null) return commonTools();

  const base = [...commonTools(), escalationTool()];
  switch (ctx.role) {
    case "PATIENT":
      return [...base, ...patientTools(ctx)];
    case "DOCTOR":
      return [...base, ...doctorTools(ctx)];
    case "ADMIN":
      return [...base, ...adminTools(ctx)];
    default:
      return commonTools();
  }
}
