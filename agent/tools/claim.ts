import "server-only";
import { z } from "zod";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-users";
import { sendAccountInvite } from "@/lib/email/send-auth-email";
import { getOrCreatePatientByPhone } from "@/server/services/patients";
import type { AgentContext } from "@/agent/types";
import { jsonTool } from "./shared";

/**
 * In-chat web-account claim. A WhatsApp patient gives their email; we attach it to
 * their EXISTING account (swapping out the synthetic placeholder) and email a
 * set-password link. Messaging from their WhatsApp number is the phone-ownership
 * proof, so no SMS/phone-OTP is needed. The same account id is kept, so all their
 * appointments/data stay linked. WhatsApp-only (a web user is already logged in).
 */
export function claimWebLoginTool(ctx: AgentContext): DynamicStructuredTool {
  return jsonTool(
    {
      name: "claim_web_login",
      description:
        "استخدمه عندما يرغب المستخدم في تفعيل الدخول إلى الموقع أو لوحة التحكم على الويب ويزوّدك ببريده الإلكتروني. يربط البريد بحسابه الحالي ويرسل له رابطاً على بريده لتعيين كلمة المرور. بعد النجاح، اطلب منه فتح بريده والضغط على الرابط لتعيين كلمة المرور، وبعدها يمكنه تسجيل الدخول على الموقع بنفس حسابه وكل مواعيده محفوظة.",
      schema: z.object({
        email: z.email("بريد إلكتروني غير صالح"),
      }),
    },
    async ({ email }: { email: string }) => {
      const normalizedEmail = email.trim().toLowerCase();

      // Ensure the patient actually has an account (Case 1 → provision now).
      let profileId = ctx.actorId;
      if (!profileId) {
        if (!ctx.contactPhone) {
          return { error: "لا يمكن ربط الحساب بدون رقم هاتف." };
        }
        const res = await getOrCreatePatientByPhone({
          clinicId: ctx.clinicId,
          phone: ctx.contactPhone,
          name: ctx.actorName,
        });
        profileId = res.profileId;
      }

      // Reject if the email already belongs to a DIFFERENT account.
      const existingId = await findAuthUserIdByEmail(normalizedEmail);
      if (existingId && existingId !== profileId) {
        return {
          error: "هذا البريد الإلكتروني مستخدم بحساب آخر. جرّب بريداً مختلفاً.",
        };
      }

      const admin = createAdminClient();

      // Attach the real email to the existing user (does not touch the Profile).
      const { error: updErr } = await admin.auth.admin.updateUserById(
        profileId,
        {
          email: normalizedEmail,
          email_confirm: true,
        },
      );
      if (updErr) {
        return {
          error:
            "تعذّر ربط البريد بالحساب. تأكّد من صحة البريد وحاول مرة أخرى.",
        };
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: ctx.clinicId },
        select: { name: true },
      });
      await sendAccountInvite({
        email: normalizedEmail,
        name: ctx.actorName || null,
        clinicName: clinic?.name ?? "",
      });

      return { invited: true, email: normalizedEmail };
    },
  );
}
