import "server-only";
import { z } from "zod";
import { Role } from "@prisma/client";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/agent/types";
import { getOrCreatePatientByPhone } from "@/server/services/patients";
import { phoneFromChat } from "@/lib/phone";
import { jsonTool } from "./shared";

/**
 * Registers the contact as a PATIENT in the clinic they're messaging, so they can
 * then book. Covers both:
 *   - Case 2: they already have an account (`ctx.actorId` set) but aren't a member
 *     here → just add the membership using their existing identity.
 *   - Case 1: a brand-new WhatsApp number (no account) → silently provisions an
 *     anonymous account from their phone + name, then adds the membership.
 *   - Hidden-phone WhatsApp contact (privacy "@lid", no number from WhatsApp):
 *     the agent asks for the number and passes it in `phone`. A number that is
 *     new to us gets an account linked to this conversation; a number that
 *     already belongs to an account is NOT linked (anyone could type someone
 *     else's number) — the agent escalates so the team verifies identity.
 * Either way their role becomes PATIENT from the next message onward. After
 * success, the agent should tell them they're now registered at the clinic
 * (a one-line consent notice) and continue.
 */
export function registerInClinicTool(ctx: AgentContext): DynamicStructuredTool {
  return jsonTool(
    {
      name: "register_in_clinic",
      description:
        "استخدمه عندما يرغب المستخدم في الحجز أو استخدام خدمات هذه العيادة وليس مسجّلاً فيها بعد — سواء كان لديه حساب لدينا أو رقمه جديد تماماً. يسجّله كمريض في هذه العيادة (وينشئ له حساباً تلقائياً إذا لم يكن لديه). إذا لم نكن نعرف اسمه بعد فمرّر اسمه الكامل في الحقل name بعد سؤاله عنه. إذا أعادت needsPhone=true (رقم واتساب الشخص مخفي) فاسأله عن رقم موبايله ثم أعد استدعاءها مع الرقم في الحقل phone كما كتبه. بعد نجاحه، أخبره أنه أصبح مسجّلاً في العيادة وسيتمكن من إتمام طلبه.",
      schema: z.object({
        name: z
          .string()
          .optional()
          .describe(
            "الاسم الكامل للمستخدم كما ذكره في المحادثة — مطلوب فقط إذا كان رقمه جديداً ولا نعرف اسمه بعد.",
          ),
        phone: z
          .string()
          .optional()
          .describe(
            "رقم موبايل المستخدم كما كتبه في المحادثة (مثل 01012345678) — فقط عندما تعيد الأداة needsPhone=true لأن رقم واتساب مخفي.",
          ),
      }),
    },
    async ({ name, phone: typedPhone }) => {
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
      const fullName = name?.trim() || ctx.actorName?.trim() || "";
      if (!fullName) {
        return { error: "أحتاج إلى اسمك الكامل أولاً لإتمام التسجيل." };
      }

      // Hidden-phone contact (WhatsApp "@lid"): use the number they typed.
      if (!ctx.contactPhone) {
        if (!typedPhone?.trim()) {
          return {
            needsPhone: true,
            error:
              "رقم واتساب هذا الشخص مخفي. اسأله عن رقم موبايله ثم أعد استدعاء register_in_clinic مع الرقم في الحقل phone.",
          };
        }
        const phone = phoneFromChat(typedPhone);
        if (!phone) {
          return {
            needsPhone: true,
            error: "الرقم غير صحيح. اطلب منه كتابة رقم الموبايل كاملاً (مثل 01012345678).",
          };
        }
        const taken = await prisma.profile.findUnique({ where: { phone }, select: { id: true } });
        if (taken) {
          return {
            error:
              "هذا الرقم مسجّل بالفعل لحساب لدينا، ولا يمكن ربطه بهذه المحادثة تلقائياً قبل التحقق من هوية صاحبه. أخبر المريض بلطف أن فريق الاستقبال سيتأكد من بياناته ويكمل معه الحجز، واستخدم escalate_to_human مع ذكر الرقم والخدمة المطلوبة. لا تذكر له أي بيانات عن صاحب الحساب.",
            needsStaffVerification: true,
          };
        }
        const { profileId } = await getOrCreatePatientByPhone({
          clinicId: ctx.clinicId,
          phone,
          name: fullName,
        });
        // No phone to match on later turns, so remember the account on the
        // conversation — resolveProfileAndLink falls back to conversation.userId.
        if (ctx.conversationId) {
          await prisma.conversation
            .update({ where: { id: ctx.conversationId }, data: { userId: profileId } })
            .catch((err) => console.error("[register_in_clinic] link failed:", err));
        }
        return { registered: true, role: Role.PATIENT };
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
