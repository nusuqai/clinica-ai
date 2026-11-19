import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ClinicContext } from "@/lib/auth";

/**
 * Which WhatsApp numbers' messages a team member may see in the inbox.
 *
 *  - `null` — everything: clinic ADMINs, platform admins, and staff with no
 *    branch limit. They see every number (clinic-level and every branch's),
 *    plus website chats and messages from before numbers were tracked.
 *  - a list of number ids — a branch-limited staff member: only messages that
 *    went through a number of one of their branches. A conversation shows up
 *    when it has at least one such message, and only those messages show in it.
 *    Clinic-level numbers, website chats and untagged history are hidden.
 *
 * The database enforces the same rule for browser reads (RLS on `messages` /
 * `conversations`, migration 20261117000002) — this is the server-side mirror
 * for Prisma, which connects as the table owner and bypasses RLS.
 */
export type InboxNumberScope = readonly string[] | null;

export async function inboxNumberScope(ctx: ClinicContext): Promise<InboxNumberScope> {
  if (ctx.branchIds === null) return null;
  if (ctx.branchIds.length === 0) return [];
  const rows = await prisma.whatsappConfig.findMany({
    where: { clinicId: ctx.clinic.id, branchId: { in: [...ctx.branchIds] } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Messages the scope may see. */
export function messageScopeWhere(scope: InboxNumberScope | undefined): Prisma.MessageWhereInput {
  return scope == null ? {} : { whatsappConfigId: { in: [...scope] } };
}

/** Conversations the scope may see: at least one visible message. */
export function conversationScopeWhere(
  scope: InboxNumberScope | undefined
): Prisma.ConversationWhereInput {
  return scope == null ? {} : { messages: { some: { whatsappConfigId: { in: [...scope] } } } };
}

/** Whether `conversationId` is in the clinic and visible to `ctx` — the guard
 *  every inbox action on a conversation runs before touching it. */
export async function canAccessConversation(
  ctx: ClinicContext,
  conversationId: string
): Promise<boolean> {
  const scope = await inboxNumberScope(ctx);
  const n = await prisma.conversation.count({
    where: { id: conversationId, clinicId: ctx.clinic.id, ...conversationScopeWhere(scope) },
  });
  return n > 0;
}

/** Whether a single message is visible to `ctx` (its conversation's part they may see). */
export async function canAccessMessage(ctx: ClinicContext, messageId: string): Promise<boolean> {
  const scope = await inboxNumberScope(ctx);
  const n = await prisma.message.count({
    where: { id: messageId, clinicId: ctx.clinic.id, ...messageScopeWhere(scope) },
  });
  return n > 0;
}
