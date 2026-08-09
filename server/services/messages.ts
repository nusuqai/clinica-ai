import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, Role, SenderType, type Prisma } from "@prisma/client";

export interface ConversationSummary {
  id: string;
  channel: Channel;
  contactName: string;
  contactPhone?: string;
  lastMessage?: string;
  lastMessageAt?: Date;
  unreadCount: number;
  hasUnresolvedEscalation: boolean;
}

export interface MessageItem {
  id: string;
  content: string;
  senderType: SenderType;
  sessionId: string | null;
  createdAt: Date;
  isRead: boolean;
}

export interface EscalationItem {
  reason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface ConversationDetail {
  id: string;
  channel: Channel;
  contactName: string;
  contactPhone?: string;
  /** Most recent chat session (may be expired) — null if no message yet. */
  activeSessionId: string | null;
  aiEnabled: boolean;
  escalations: EscalationItem[];
}

// Conversations of this clinic that belong to customers, not staff. Admins (and
// doctors) also get the AI chat bubble; their own conversation with it is not a
// customer contact and must not appear in the inbox.
async function customerConversationWhere(
  clinicId: string,
): Promise<Prisma.ConversationWhereInput> {
  const staff = await prisma.clinicMember.findMany({
    where: { clinicId, role: { in: [Role.DOCTOR, Role.ADMIN] } },
    select: { userId: true },
  });
  const staffIds = staff.map((s) => s.userId);
  return { clinicId, OR: [{ userId: null }, { userId: { notIn: staffIds } }] };
}

export async function getConversations(
  clinicId: string,
): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
    where: await customerConversationWhere(clinicId),
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { fullName: true, phone: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          messages: { where: { isRead: false, senderType: SenderType.USER } },
          escalations: { where: { resolvedAt: null } },
        },
      },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    channel: c.channel,
    contactName:
      c.user?.fullName ??
      c.whatsappName ??
      c.whatsappPhone ??
      (c.channel === Channel.WEB ? "زائر" : "غير معروف"),
    contactPhone: c.user?.phone ?? c.whatsappPhone ?? undefined,
    lastMessage: c.messages[0]?.content ?? undefined,
    lastMessageAt: c.messages[0]?.createdAt ?? undefined,
    unreadCount: c._count.messages,
    hasUnresolvedEscalation: c._count.escalations > 0,
  }));
}

/** Conversation IDs with at least one unresolved escalation — used to seed
 * the admin-wide alert state (sidebar bell) on first load. */
export async function getUnresolvedEscalationConversationIds(
  clinicId: string,
): Promise<string[]> {
  const rows = await prisma.escalation.findMany({
    where: {
      resolvedAt: null,
      conversation: await customerConversationWhere(clinicId),
    },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });
  return rows.map((r) => r.conversationId);
}

export async function getMessages(
  conversationId: string,
): Promise<MessageItem[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    senderType: m.senderType,
    sessionId: m.sessionId,
    createdAt: m.createdAt,
    isRead: m.isRead,
  }));
}

export async function getConversationDetail(
  id: string,
  clinicId: string,
): Promise<ConversationDetail | null> {
  const c = await prisma.conversation.findFirst({
    where: { id, ...(await customerConversationWhere(clinicId)) },
    include: {
      user: { select: { fullName: true, phone: true } },
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          escalations: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!c) return null;
  const latestSession = c.sessions[0];
  return {
    id: c.id,
    channel: c.channel,
    contactName:
      c.user?.fullName ??
      c.whatsappName ??
      c.whatsappPhone ??
      (c.channel === Channel.WEB ? "زائر" : "غير معروف"),
    contactPhone: c.user?.phone ?? c.whatsappPhone ?? undefined,
    activeSessionId: latestSession?.id ?? null,
    aiEnabled: latestSession?.aiEnabled ?? true,
    escalations: latestSession?.escalations ?? [],
  };
}

export async function markConversationRead(
  conversationId: string,
): Promise<void> {
  await prisma.message.updateMany({
    where: { conversationId, isRead: false, senderType: SenderType.USER },
    data: { isRead: true },
  });
}
