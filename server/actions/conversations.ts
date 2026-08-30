"use server";
import { requireActiveMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getConversations,
  getConversationDetail,
  getMessages,
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

export async function fetchOlderMessages(conversationId: string, cursor: string) {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  // reuse whatever ownership check getConversationDetail does, so an admin
  // can't page through another clinic's conversation by guessing an id
  const owned = await getConversationDetail(conversationId, clinic.id);
  if (!owned) throw new Error("Conversation not found");

  return getMessages(conversationId, { cursor, limit: 10 });
}