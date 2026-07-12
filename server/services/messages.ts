import "server-only";
import { prisma } from "@/lib/prisma";

export interface ConversationSummary {
  id: string;
  channel: "WEB" | "WHATSAPP";
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
  senderType: "USER" | "ADMIN" | "AGENT";
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
  channel: "WEB" | "WHATSAPP";
  contactName: string;
  contactPhone?: string;
  /** Most recent chat session (may be expired) — null if no message yet. */
  activeSessionId: string | null;
  aiEnabled: boolean;
  escalations: EscalationItem[];
}

// Admins (and doctors) also get the AI chat bubble in their dashboard — their
// own conversation with it is not a customer contact and must not appear in
// the inbox they use to manage customer conversations.
const NOT_STAFF_OWNED = {
  OR: [{ userId: null }, { user: { role: "PATIENT" as const } }],
};

export async function getConversations(): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
    where: NOT_STAFF_OWNED,
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { fullName: true, phone: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: {
          messages: { where: { isRead: false, senderType: "USER" } },
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
      (c.channel === "WEB" ? "زائر" : "غير معروف"),
    contactPhone: c.user?.phone ?? c.whatsappPhone ?? undefined,
    lastMessage: c.messages[0]?.content ?? undefined,
    lastMessageAt: c.messages[0]?.createdAt ?? undefined,
    unreadCount: c._count.messages,
    hasUnresolvedEscalation: c._count.escalations > 0,
  }));
}

/** Conversation IDs with at least one unresolved escalation — used to seed
 * the admin-wide alert state (sidebar bell) on first load. */
export async function getUnresolvedEscalationConversationIds(): Promise<
  string[]
> {
  const rows = await prisma.escalation.findMany({
    where: { resolvedAt: null, conversation: NOT_STAFF_OWNED },
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
): Promise<ConversationDetail | null> {
  const c = await prisma.conversation.findFirst({
    where: { id, ...NOT_STAFF_OWNED },
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
      (c.channel === "WEB" ? "زائر" : "غير معروف"),
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
    where: { conversationId, isRead: false, senderType: "USER" },
    data: { isRead: true },
  });
}
