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
}

export interface MessageItem {
  id: string;
  content: string;
  senderType: "USER" | "ADMIN" | "AGENT";
  sessionId: string | null;
  createdAt: Date;
  isRead: boolean;
}

export interface ConversationDetail {
  id: string;
  channel: "WEB" | "WHATSAPP";
  contactName: string;
  contactPhone?: string;
}

export async function getConversations(): Promise<ConversationSummary[]> {
  const conversations = await prisma.conversation.findMany({
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
        },
      },
    },
  });

  return conversations.map((c) => ({
    id: c.id,
    channel: c.channel,
    contactName:
      c.user?.fullName ?? c.whatsappName ?? c.whatsappPhone ?? "غير معروف",
    contactPhone: c.user?.phone ?? c.whatsappPhone ?? undefined,
    lastMessage: c.messages[0]?.content ?? undefined,
    lastMessageAt: c.messages[0]?.createdAt ?? undefined,
    unreadCount: c._count.messages,
  }));
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
  const c = await prisma.conversation.findUnique({
    where: { id },
    include: { user: { select: { fullName: true, phone: true } } },
  });
  if (!c) return null;
  return {
    id: c.id,
    channel: c.channel,
    contactName:
      c.user?.fullName ?? c.whatsappName ?? c.whatsappPhone ?? "غير معروف",
    contactPhone: c.user?.phone ?? c.whatsappPhone ?? undefined,
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
