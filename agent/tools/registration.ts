import "server-only";
import { z } from "zod";
import { Role } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/agent/types";
import { getOrCreatePatientByPhone } from "@/server/services/patients";
import { jsonTool } from "./shared";

/**
 * Registers the contact as a PATIENT in the clinic they're messaging, so they can
 * then book. Covers both:
 *   - Case 2: they already have an account (`ctx.actorId` set) but aren't a member
 *     here → just add the membership using their existing identity.
 *   - Case 1: a brand-new WhatsApp number (no account) → silently provisions an
 *     anonymous account from their phone + name, then adds the membership.
 * Either way their role becomes PATIENT from the next message onward. After
 * success, the agent should tell them they're now registered at the clinic
 * (a one-line consent notice) and continue.
 */
export function registerInClinicTool(ctx: AgentContext): DynamicStructuredTool {
  return jsonTool(
    {
      name: "register_in_clinic",
      description:
        "استخدمه عندما يرغب المستخدم في الحجز أو استخدام خدمات هذه العيادة وليس مسجّلاً فيها بعد — سواء كان لديه حساب لدينا أو رقمه جديد تماماً. يسجّله كمريض في هذه العيادة (وينشئ له حساباً تلقائياً إذا لم يكن لديه). إذا لم نكن نعرف اسمه بعد فمرّر اسمه الكامل في الحقل name بعد سؤاله عنه. بعد نجاحه، أخبره أنه أصبح مسجّلاً في العيادة وسيتمكن من إتمام طلبه.",
      schema: z.object({
        name: z
          .string()
          .optional()
          .describe(
            "الاسم الكامل للمستخدم كما ذكره في المحادثة — مطلوب فقط إذا كان رقمه جديداً ولا نعرف اسمه بعد.",
          ),
      }),
    },
    async ({ name }) => {
      // Case 2 — existing account, just link it to this clinic.
      if (ctx.actorId) {
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
      }

      // Case 1 — brand-new number: provision an account from the phone. A name is
      // required (the WhatsApp fallback name is the phone number itself, which is
      // why eager onboarding skipped this contact); prefer the one just collected
      // in chat, falling back to any display name we do have.
      if (!ctx.contactPhone) {
        return { error: "لا يمكن التسجيل بدون رقم هاتف." };
      }
      const fullName = name?.trim() || ctx.actorName?.trim() || "";
      if (!fullName) {
        return { error: "أحتاج إلى اسمك الكامل أولاً لإتمام التسجيل." };
      }
      await getOrCreatePatientByPhone({
        clinicId: ctx.clinicId,
        phone: ctx.contactPhone,
        name: fullName,
      });
      return { registered: true, role: Role.PATIENT };
    },
  );
}
