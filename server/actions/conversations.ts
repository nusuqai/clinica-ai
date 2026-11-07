"use server";
import { getPermittedContext, requirePermission } from "@/lib/auth";
import {
  countNeedsMe,
  getConversations,
  getConversationDetail,
  getMessages,
} from "@/server/services/messages";
import type {
  ConversationFilters,
  ConversationSummary,
  ConversationDetail,
  MessageItem,
} from "@/server/services/messages";
import { listInternalNotes, type InternalNoteItem } from "@/server/services/inbox";

/** The inbox list for the caller's own clinic, with the current filters. */
export async function fetchConversations(
  filters: ConversationFilters
): Promise<ConversationSummary[]> {
  // Clinic from the request host — never from the caller — and the caller must
  // manage messages there.
  const ctx = await getPermittedContext("messages");
  if (!ctx) return [];
  return getConversations(ctx.clinic.id, filters, ctx.user.id);
}

export async function fetchConversationDetail(
  conversationId: string
): Promise<ConversationDetail | null> {
  const { clinic, user } = await requirePermission("messages");
  return getConversationDetail(conversationId, clinic.id, user.id);
}

/** Reloads a conversation's messages — used to pick up server-derived state that
 *  a bare realtime row doesn't carry (e.g. a per-message escalation), so the
 *  "escalated" badge + resolve button appear live without a manual refresh. */
export async function fetchMessages(conversationId: string): Promise<MessageItem[]> {
  const { clinic, user } = await requirePermission("messages");
  // Scope the read to the admin's clinic: confirm the conversation belongs to it.
  const detail = await getConversationDetail(conversationId, clinic.id, user.id);
  if (!detail) return [];
  return getMessages(conversationId, user.id);
}

/** A conversation's staff-only internal notes (clinic-scoped). */
export async function fetchInternalNotes(conversationId: string): Promise<InternalNoteItem[]> {
  const { clinic, user } = await requirePermission("messages");
  const detail = await getConversationDetail(conversationId, clinic.id, user.id);
  if (!detail) return [];
  return listInternalNotes(conversationId);
}

/** The red counter on the "needs my response" filter. */
export async function fetchNeedsMeCount(): Promise<number> {
  const ctx = await getPermittedContext("messages");
  if (!ctx) return 0;
  return countNeedsMe(ctx.clinic.id, ctx.user.id);
}
