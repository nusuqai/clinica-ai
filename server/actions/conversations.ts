"use server";
import { getPermittedContext, requirePermission } from "@/lib/auth";
import { inboxNumberScope } from "@/lib/inbox-scope";
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

/**
 * The inbox list for the caller's own clinic, with the current filters.
 *
 * Returns null — NOT [] — when the caller's session/permission can't be
 * confirmed on this request (an expiring access token being refreshed by
 * several background calls at once, a blip reaching Supabase Auth…). The
 * inbox treats null as "keep what's on screen"; an [] here used to wipe the
 * whole list until a full page reload.
 */
export async function fetchConversations(
  filters: ConversationFilters
): Promise<ConversationSummary[] | null> {
  // Clinic from the request host — never from the caller — and the caller must
  // manage messages there.
  const ctx = await getPermittedContext("messages");
  if (!ctx) return null;
  return getConversations(ctx.clinic.id, filters, ctx.user.id, await inboxNumberScope(ctx));
}

export async function fetchConversationDetail(
  conversationId: string
): Promise<ConversationDetail | null> {
  // Background refresh — null (keep current) rather than a redirect.
  const ctx = await getPermittedContext("messages");
  if (!ctx) return null;
  return getConversationDetail(
    conversationId,
    ctx.clinic.id,
    ctx.user.id,
    await inboxNumberScope(ctx)
  );
}

/** Reloads a conversation's messages — used to pick up server-derived state that
 *  a bare realtime row doesn't carry (e.g. a per-message escalation), so the
 *  "escalated" badge + resolve button appear live without a manual refresh. */
export async function fetchMessages(conversationId: string): Promise<MessageItem[] | null> {
  // Background refresh: never redirect (that would yank the admin to /login on
  // a transient auth miss) and never answer [] for "couldn't check" — null
  // tells the inbox to keep the thread it already shows.
  const ctx = await getPermittedContext("messages");
  if (!ctx) return null;
  const scope = await inboxNumberScope(ctx);
  // Scope the read to the admin's clinic (and branch part): confirm access first.
  const detail = await getConversationDetail(conversationId, ctx.clinic.id, ctx.user.id, scope);
  if (!detail) return null;
  return getMessages(conversationId, ctx.user.id, scope);
}

/** A conversation's staff-only internal notes (clinic-scoped). */
export async function fetchInternalNotes(conversationId: string): Promise<InternalNoteItem[]> {
  const ctx = await requirePermission("messages");
  const detail = await getConversationDetail(
    conversationId,
    ctx.clinic.id,
    ctx.user.id,
    await inboxNumberScope(ctx)
  );
  if (!detail) return [];
  return listInternalNotes(conversationId);
}

/** The red counter on the "needs my response" filter. */
export async function fetchNeedsMeCount(): Promise<number> {
  const ctx = await getPermittedContext("messages");
  if (!ctx) return 0;
  return countNeedsMe(ctx.clinic.id, ctx.user.id, await inboxNumberScope(ctx));
}
