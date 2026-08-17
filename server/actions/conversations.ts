"use server";
import { requireActiveMember } from "@/lib/auth";
import {
  getConversations,
  getConversationDetail,
} from "@/server/services/messages";
import type {
  ConversationSummary,
  ConversationDetail,
} from "@/server/services/messages";

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
