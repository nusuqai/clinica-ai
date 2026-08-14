import "server-only";
import { z } from "zod";
import { Role } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/agent/types";
import { jsonTool } from "./shared";

/**
 * Case 2: the contact already has an account (`ctx.actorId` is set) but is NOT a
 * member of the clinic they're messaging (so `ctx.role` came back null). This
 * tool registers them as a PATIENT in this clinic directly, using their existing
 * identity — no new account, no website trip. Their role becomes PATIENT from
 * the next message onward.
 *
 * Only meaningful when `ctx.actorId` exists; the caller (`getToolsForRole`) only
 * exposes it in that situation, and the handler guards defensively.
 */
export function registerInClinicTool(ctx: AgentContext): DynamicStructuredTool {
  return jsonTool(
    {
      name: "register_in_clinic",
      description:
        "استخدمه عندما يملك المستخدم حساباً لدينا بالفعل لكنه غير مسجّل في هذه العيادة تحديداً، ويرغب في الحجز أو استخدام خدماتها. يسجّله كمريض في هذه العيادة باستخدام حسابه الحالي. بعد نجاحه، أخبره أنه أصبح مسجّلاً وسيتمكن من إتمام طلبه.",
      schema: z.object({}),
    },
    async () => {
      if (!ctx.actorId) {
        // No linked account → this is Case 1 (brand-new contact), not handled here.
        return { error: "لا يوجد حساب مرتبط بهذا الرقم." };
      }
      await prisma.clinicMember.upsert({
        where: {
          userId_clinicId: { userId: ctx.actorId, clinicId: ctx.clinicId },
        },
        update: {},
        create: {
          userId: ctx.actorId,
          clinicId: ctx.clinicId,
          role: Role.PATIENT,
        },
      });
      return { registered: true, role: Role.PATIENT };
    },
  );
}
