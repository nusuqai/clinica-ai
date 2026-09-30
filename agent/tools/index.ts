import "server-only";
import { Channel } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import type { AgentContext } from "@/agent/types";
import { commonTools } from "./common";
import { knowledgeTools } from "./knowledge";
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
  const base = [
    ...commonTools(ctx.clinicId),
    ...knowledgeTools(ctx.clinicId),
    escalationTool(ctx),
  ];

  // Claiming website access (attach email + set-password link) only makes sense
  // on WhatsApp — a web user is already logged in.
  const claim = ctx.channel === Channel.WHATSAPP ? [claimWebLoginTool(ctx)] : [];

  // Unknown WhatsApp contact / anonymous web guest → info + human handoff.
  //
  // `register_in_clinic` provisions an account from the contact's phone, so it
  // only works on WhatsApp (where the phone is known). A web guest has no phone
  // and is instead told — by GUEST_WEB_GUIDE — to create an account / sign in
  // from the website, so the tool is withheld there to keep the model from
  // attempting a registration it cannot complete.
  if (ctx.role === null) {
    const register = ctx.channel === Channel.WHATSAPP ? [registerInClinicTool(ctx)] : [];
    return [...base, ...register, ...claim];
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
