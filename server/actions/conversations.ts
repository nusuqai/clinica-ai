"use server";
import { requireActiveMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getConversations,
  getConversationDetail,
} from "@/server/services/messages";
import type {
  ConversationSummary,
  ConversationDetail,
} from "@/server/services/messages";
import { SenderType } from "@prisma/client";

export async function fetchConversations(
  clinicId: string,
): Promise<ConversationSummary[]> {
  return getConversations(clinicId);
}

export async function fetchConversationDetail(
  conversationId: string,
): Promise<ConversationDetail | null> {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  return getConversationDetail(conversationId, clinic.id);
}
export async function markConversationRead(conversationId: string) {
  await prisma.message.updateMany({
    where: { conversationId, senderType: SenderType.USER, isRead: false },
    data: { isRead: true },
  });
}