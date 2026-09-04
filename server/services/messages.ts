import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, Role, SenderType, type Prisma } from "@prisma/client";

export interface ConversationSummary {
  id: string;
  channel: Channel;
  contactName: string;
  contactPhone?: string;
  /** Linked patient Profile id, or null for an anonymous (unclaimed) contact. */
  userId: string | null;
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
  /** Linked patient Profile id, or null for an anonymous (unclaimed) contact. */
  userId: string | null;
  /** Most recent chat session (may be expired) — null if no message yet. */
  activeSessionId: string | null;
  aiEnabled: boolean;
  escalations: EscalationItem[];
  /** Timestamp of the contact's last inbound message. On WhatsApp this anchors
   *  the 24-hour customer-service window: free-form replies are only allowed
   *  while `now - lastInboundAt < 24h`. Null if the contact never wrote. */
  lastInboundAt: Date | null;
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
  options?: { cursor?: string | null; limit?: number },
): Promise<{ conversations: ConversationSummary[]; nextCursor: string | null }> {
  const limit = options?.limit ?? 30;
  const baseWhere = await customerConversationWhere(clinicId);

  const rows = await prisma.conversation.findMany({
    where: {
      ...baseWhere,
      messages: { some: {} },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(options?.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: {
      user: { select: { fullName: true, phone: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: {
        select: {
          messages: { where: { isRead: false, senderType: SenderType.USER } },
          escalations: { where: { resolvedAt: null } },
        },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return {
    conversations: page.map((c) => ({
      id: c.id,
      contactName: c.user?.fullName ?? "مستخدم جديد",
      lastMessage: c.messages[0]?.content ?? null,
      lastMessageAt: c.messages[0]?.createdAt ?? c.updatedAt,
      unreadCount: c._count.messages,
      hasUnresolvedEscalation: c._count.escalations > 0,
      channel: c.channel,
      userId: c.userId,
    })),
    nextCursor,
  };
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

// server/services/messages.ts
export async function getMessages(
  conversationId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<{ messages: MessageItem[]; nextCursor: string | null }> {
  const { cursor, limit = 10 } = opts;

  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" }, // newest first — easiest to page "backwards" from
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length === limit;
  const page = rows.reverse(); // back to ascending for rendering

  return {
    messages: page, // your existing row → MessageItem mapper
    nextCursor: hasMore ? page[0].id : null, // oldest id in this batch = anchor for the next "older" fetch
  };
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
      messages: {
        where: { senderType: SenderType.USER },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
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
    userId: c.userId,
    activeSessionId: latestSession?.id ?? null,
    aiEnabled: latestSession?.aiEnabled ?? true,
    escalations: latestSession?.escalations ?? [],
    lastInboundAt: c.messages[0]?.createdAt ?? null,
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