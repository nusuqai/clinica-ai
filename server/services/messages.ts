import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, Role, SenderType, type Prisma } from "@prisma/client";
import type {
  AgentMessageMetadata,
  VoiceMessageMetadata,
  MediaAttachmentMetadata,
  StructuredMessageMetadata,
} from "@/agent/types";

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

/** Voice fields the inbox needs to render a player (no URL — the audio streams
 *  through /api/admin/media/<id>, which signs it on demand). */
export interface MessageVoice {
  durationSec: number | null;
  transcript: string;
  status: VoiceMessageMetadata["status"];
}

/** Attachment fields the inbox needs to render/download a stored media object
 *  (image/video/document/sticker). The bytes stream through /api/admin/media/<id>. */
export interface MessageMedia {
  kind: MediaAttachmentMetadata["kind"];
  mimeType: string;
  filename?: string;
  caption?: string;
  /** The agent's vision description, when it read the image. */
  analysis?: string;
}

/** A structured (no-file) message — location/contacts/order — for a small badge. */
export interface MessageStructured {
  kind: StructuredMessageMetadata["kind"];
}

/** An open escalation tied to this message (media the agent couldn't read). Drives
 *  the "escalated" badge + the per-message "resolve" button in the inbox. */
export interface MessageEscalation {
  id: string;
  reason: string | null;
}

export interface MessageItem {
  id: string;
  content: string;
  senderType: SenderType;
  sessionId: string | null;
  createdAt: Date;
  isRead: boolean;
  /** Present when the message is/contains a voice note. */
  voice?: MessageVoice;
  /** Present when the message carries a stored media attachment. */
  media?: MessageMedia;
  /** Present when the message is a structured (location/contact/order) message. */
  structured?: MessageStructured;
  /** Present when this message has an unresolved escalation. */
  escalation?: MessageEscalation;
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
async function customerConversationWhere(clinicId: string): Promise<Prisma.ConversationWhereInput> {
  const staff = await prisma.clinicMember.findMany({
    where: { clinicId, role: { in: [Role.DOCTOR, Role.ADMIN] } },
    select: { userId: true },
  });
  const staffIds = staff.map((s) => s.userId);
  return { clinicId, OR: [{ userId: null }, { userId: { notIn: staffIds } }] };
}

export async function getConversations(clinicId: string): Promise<ConversationSummary[]> {
  const baseWhere = await customerConversationWhere(clinicId);
  const conversations = await prisma.conversation.findMany({
    where: {
      ...baseWhere,
      messages: { some: {} },
    },
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
    userId: c.userId,
    lastMessage: c.messages[0]?.content ?? undefined,
    lastMessageAt: c.messages[0]?.createdAt ?? undefined,
    unreadCount: c._count.messages,
    hasUnresolvedEscalation: c._count.escalations > 0,
  }));
}

/** Conversation IDs with at least one unresolved escalation — used to seed
 * the admin-wide alert state (sidebar bell) on first load. */
export async function getUnresolvedEscalationConversationIds(clinicId: string): Promise<string[]> {
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

export async function getMessages(conversationId: string): Promise<MessageItem[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  // Open, message-linked escalations for this conversation → per-message badge.
  const openEscalations = await prisma.escalation.findMany({
    where: { conversationId, resolvedAt: null, messageId: { not: null } },
    select: { id: true, messageId: true, reason: true },
  });
  const escalationByMessage = new Map(
    openEscalations.map((e) => [e.messageId as string, { id: e.id, reason: e.reason }])
  );

  return messages.map((m) => {
    const meta = m.metadata as AgentMessageMetadata | null;
    const voice = meta?.voice;
    const media = meta?.media;
    const structured = meta?.structured;
    const escalation = escalationByMessage.get(m.id);
    return {
      id: m.id,
      content: m.content,
      senderType: m.senderType,
      sessionId: m.sessionId,
      createdAt: m.createdAt,
      isRead: m.isRead,
      ...(voice
        ? {
            voice: {
              durationSec: voice.durationSec,
              transcript: voice.transcript,
              status: voice.status,
            },
          }
        : {}),
      ...(media
        ? {
            media: {
              kind: media.kind,
              mimeType: media.mimeType,
              filename: media.filename,
              caption: media.caption,
              analysis: media.analysis,
            },
          }
        : {}),
      ...(structured ? { structured: { kind: structured.kind } } : {}),
      ...(escalation ? { escalation } : {}),
    };
  });
}

export async function getConversationDetail(
  id: string,
  clinicId: string
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

export async function markConversationRead(conversationId: string): Promise<void> {
  await prisma.message.updateMany({
    where: { conversationId, isRead: false, senderType: SenderType.USER },
    data: { isRead: true },
  });
}
