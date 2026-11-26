import "server-only";
import { Channel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { WhatsAppAddress } from "@/lib/whatsapp/transport";

/** Builds a WhatsApp recipient from a conversation row (phone or BSUID). */
export function conversationRecipient(conv: {
  whatsappPhone: string | null;
  whatsappUserId: string | null;
}): WhatsAppAddress | null {
  if (!conv.whatsappPhone && !conv.whatsappUserId) return null;
  return { phone: conv.whatsappPhone, userId: conv.whatsappUserId };
}

/**
 * Finds (or creates) the patient's WhatsApp conversation in a clinic so an
 * outbound message (automation, or the team via the assistant) threads with
 * their history and their reply lands in a conversation the agent already has
 * context for. Returns null if there is no way to reach them on WhatsApp (no
 * existing thread and no phone on file).
 */
export async function getWhatsappThread(
  clinicId: string,
  patient: { id: string; phone: string | null }
) {
  const existing = await prisma.conversation.findFirst({
    where: { clinicId, userId: patient.id, channel: Channel.WHATSAPP },
    select: { id: true, whatsappPhone: true, whatsappUserId: true },
  });
  if (existing) return existing;

  const phone = patient.phone?.replace(/\D/g, "") || null;
  if (!phone) return null;

  const byPhone = await prisma.conversation.findUnique({
    where: { clinicId_whatsappPhone: { clinicId, whatsappPhone: phone } },
    select: { id: true, whatsappPhone: true, whatsappUserId: true, userId: true },
  });
  if (byPhone) {
    if (!byPhone.userId) {
      await prisma.conversation.update({
        where: { id: byPhone.id },
        data: { userId: patient.id },
      });
    }
    return byPhone;
  }

  return prisma.conversation.create({
    data: { clinicId, userId: patient.id, whatsappPhone: phone, channel: Channel.WHATSAPP },
    select: { id: true, whatsappPhone: true, whatsappUserId: true },
  });
}
