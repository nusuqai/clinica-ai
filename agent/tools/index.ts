import "server-only";
import { Channel } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext } from "@/agent/types";
import { commonTools } from "./common";
import { patientTools } from "./patient";
import { doctorTools } from "./doctor";
import { adminTools } from "./admin";
import { escalationTool } from "./escalation";
import { registerInClinicTool } from "./registration";
import { claimWebLoginTool } from "./claim";

/**
 * Returns EXACTLY the tools the actor's role may use. Out-of-role tools are
 * never constructed, so the model cannot see or call them.
 */
export function getToolsForRole(ctx: AgentContext): DynamicStructuredTool[] {
  const base = [...commonTools(ctx.clinicId), escalationTool(ctx)];

  // Claiming website access (attach email + set-password link) only makes sense
  // on WhatsApp — a web user is already logged in.
  const claim = ctx.channel === Channel.WHATSAPP ? [claimWebLoginTool(ctx)] : [];

  // Unknown WhatsApp contact / anonymous web guest → info + human handoff, plus
  // the ability to register as a patient in this clinic so they can then book.
  // `register_in_clinic` covers both Case 2 (has an account, not a member here)
  // and Case 1 (brand-new number → provisions an anonymous account from the phone).
  if (ctx.role === null) {
    return [...base, registerInClinicTool(ctx), ...claim];
  }

  switch (ctx.role) {
    case "PATIENT":
      return [...base, ...patientTools(ctx), ...claim];
    case "DOCTOR":
      return [...base, ...doctorTools(ctx)];
    case "ADMIN":
      return [...base, ...adminTools(ctx)];
    default:
      return commonTools(ctx.clinicId);
  }
}
