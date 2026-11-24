import "server-only";
import { MessageDelivery } from "@prisma/client";
import { sendWhatsAppText, type WhatsAppTransport } from "@/lib/whatsapp/transport";
import type { InboundEnvelope } from "@/lib/meta/whatsapp-inbound";
import { persistAgentMessage, resolveActiveSession } from "@/server/services/agentSession";
import {
  bindStaffWhatsappConversation,
  detachOrphanStaffConversation,
  findVerifiedLink,
  parseLinkCode,
  verifyLinkCode,
} from "./link";
import { flushMemberAlertsOnInbound } from "./notifications";
import { flushMemberReportsOnInbound } from "@/server/services/exports/delivery";

/**
 * Team assistant (#89) — the front of the WhatsApp inbound path, shared by the
 * Cloud API and Evolution webhooks (both reach processInboundWhatsApp).
 *
 * Returns how the message continues:
 *  - "handled": consumed here (a link code, or something the assistant doesn't
 *    take) — the patient pipeline must not see it;
 *  - { staffConversationId }: a linked member — run the normal text/voice
 *    handlers on THEIR assistant thread (they persist + debounce; the debounce
 *    processor answers with the team assistant);
 *  - null: an ordinary contact — the patient pipeline as before.
 */
export type StaffRoute = "handled" | { staffConversationId: string } | null;

const LINK_REPLIES = {
  invalid: "رمز الربط غير صحيح. أنشئ رمزاً جديداً من لوحة التحكم وأرسله هنا كما هو.",
  expired: "انتهت صلاحية رمز الربط. أنشئ رمزاً جديداً من لوحة التحكم وأرسله هنا.",
  taken: "هذا الرقم مربوط بالفعل بعضو آخر في فريق العيادة.",
} as const;

const UNSUPPORTED_NOTICE =
  "أستطيع حالياً فهم الرسائل النصية والصوتية فقط. اكتب طلبك أو أرسله كرسالة صوتية.";

function welcome(fullName: string): string {
  return [
    `تم ربط رقمك بنجاح يا ${fullName} ✅`,
    "من هنا يمكنك سؤالي عن العيادة (المواعيد، الحجوزات، التصعيدات…) أو طلب إجراء نيابةً عنك، وستصلك هنا التنبيهات التي يحددها لك مدير العيادة.",
  ].join("\n");
}

async function reply(
  creds: WhatsAppTransport,
  to: { phone: string | null; userId: string | null },
  text: string
) {
  try {
    await sendWhatsAppText(creds, to, text);
  } catch (err) {
    console.error("[staff-assistant] reply failed:", err);
  }
}

export async function routeStaffInbound(
  envelope: InboundEnvelope,
  creds: WhatsAppTransport
): Promise<StaffRoute> {
  const { phone, userId, name, message } = envelope;
  const contact = { phone, userId };
  const clinicId = creds.clinicId;

  // 1) A link code — whoever sends it (it's how a member links).
  if (message.kind === "text") {
    const code = parseLinkCode(message.text);
    if (code) {
      const result = await verifyLinkCode(clinicId, code, { phone, userId, name }, creds.configId);
      if (!result.ok) {
        await reply(creds, contact, LINK_REPLIES[result.reason]);
        return "handled";
      }
      const text = welcome(result.fullName);
      await reply(creds, contact, text);
      const link = await findVerifiedLink(clinicId, contact);
      if (link) {
        const convId = await bindStaffWhatsappConversation(clinicId, link.member.userId, {
          phone,
          userId,
          name,
        });
        const sessionId = await resolveActiveSession(convId, clinicId);
        await persistAgentMessage(
          convId,
          sessionId,
          clinicId,
          text,
          null,
          MessageDelivery.SENT,
          null,
          creds.configId
        );
      }
      return "handled";
    }
  }

  // 2) A linked member?
  const link = await findVerifiedLink(clinicId, contact);
  if (!link) {
    // A former member's number: its old assistant thread must not swallow the
    // message — detach it so the number gets an ordinary customer thread.
    await detachOrphanStaffConversation(clinicId, contact);
    return null;
  }

  if (message.kind === "ignore" || message.kind === "reaction") return "handled";

  const conversationId = await bindStaffWhatsappConversation(clinicId, link.member.userId, {
    phone,
    userId,
    name,
  });

  // Their 24h window is open now: deliver anything waiting for them first.
  await flushMemberAlertsOnInbound(link.memberId);
  await flushMemberReportsOnInbound(link.memberId);

  if (message.kind !== "text" && message.kind !== "voice") {
    await reply(creds, contact, UNSUPPORTED_NOTICE);
    return "handled";
  }
  return { staffConversationId: conversationId };
}
