"use server";
import { requireClinicMember } from "@/lib/auth";
import { getConversations, getConversationDetail, getMessages } from "@/server/services/messages";
import type {
  ConversationFilters,
  ConversationSummary,
  ConversationDetail,
  MessageItem,
} from "@/server/services/messages";

/** The inbox list for the admin's own clinic, with the current filters. */
export async function fetchConversations(
  filters: ConversationFilters
): Promise<ConversationSummary[]> {
  // Clinic from the session — never from the caller (this used to trust a
  // client-supplied clinicId with no auth check).
  const { clinic } = await requireClinicMember(["ADMIN"]);
  return getConversations(clinic.id, filters);
}

export async function fetchConversationDetail(
  conversationId: string
): Promise<ConversationDetail | null> {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  return getConversationDetail(conversationId, clinic.id);
}

/** Reloads a conversation's messages — used to pick up server-derived state that
 *  a bare realtime row doesn't carry (e.g. a per-message escalation), so the
 *  "escalated" badge + resolve button appear live without a manual refresh. */
export async function fetchMessages(conversationId: string): Promise<MessageItem[]> {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  // Scope the read to the admin's clinic: confirm the conversation belongs to it.
  const detail = await getConversationDetail(conversationId, clinic.id);
  if (!detail) return [];
  return getMessages(conversationId);
}
