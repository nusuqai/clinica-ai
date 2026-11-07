import "server-only";
import { prisma } from "@/lib/prisma";
import { Channel, Role, SenderType, type Prisma } from "@prisma/client";
import { personSearch, phoneDigits } from "./_search";
import { quoteKindOf, quoteSnippet } from "@/lib/message-quote";
import {
  needsMeWhere,
  visibleNoteWhere,
  visibleReminderWhere,
  listConversationReminders,
  listOpenConversationAlerts,
  type InboxLabelItem,
  type ReminderItem,
  type StaffAlertItem,
} from "./inbox";
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
  /** Pinned to the top of THIS viewer's inbox (per user). */
  pinned: boolean;
  /** The viewer's own labels on this conversation. */
  labels: InboxLabelItem[];
  /** Who the conversation is assigned to (clinic-wide), if anyone. */
  assignedTo: { id: string; name: string } | null;
  /** The earliest open reminder the viewer can see, if any. */
  nextReminderAt?: Date;
  /** That reminder has come due — the row floats to the top. */
  reminderDue: boolean;
  /** Waiting on THIS viewer (escalated/assigned to them, or their reminder is due). */
  needsMe: boolean;
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
  /** OCR extraction surfaced to the call-centre team in extract-only mode (the
   *  agent never sees this — distinct from `analysis`). */
  extraction?: string;
  /** Intrinsic image dimensions, when known (staff-sent). */
  width?: number;
  height?: number;
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

/** The message a reply quotes, reduced to what the quoted-preview block shows. */
export interface MessageReplyPreview {
  id: string;
  senderType: SenderType;
  /** Staff member (ADMIN) or AI employee (AGENT) who wrote it; null for the
   *  patient, whom the inbox labels with the contact name. */
  authorName: string | null;
  snippet: string;
}

export interface MessageItem {
  id: string;
  content: string;
  senderType: SenderType;
  /** For a manual (ADMIN) reply: the team member who sent it, so the inbox can
   *  show who answered the client. Null for USER / AGENT messages. */
  senderId: string | null;
  senderName: string | null;
  /** For an AGENT reply: the AI employee that wrote it. Null for system notices
   *  and replies sent before AI employees existed. */
  agentName: string | null;
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
  /** The patient's emoji reaction to this message (WhatsApp), if any. */
  reaction?: string;
  /** The earlier message this one quotes, if any (and if it still exists). */
  replyTo?: MessageReplyPreview;
  /** Staff notes on this message the viewer can see (private ones only theirs). */
  notes?: MessageNoteItem[];
}

export interface MessageNoteItem {
  id: string;
  content: string;
  visibility: "PRIVATE" | "CLINIC";
  authorId: string;
  authorName: string;
  createdAt: Date;
}

export interface EscalationItem {
  reason: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  /** The team member whose action resolved it; null while open (or unknown). */
  resolvedByName: string | null;
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
  /** Who last paused / resumed the AI by hand for this session, if anyone. */
  aiToggledByName: string | null;
  aiToggledAt: Date | null;
  escalations: EscalationItem[];
  /** Timestamp of the contact's last inbound message. On WhatsApp this anchors
   *  the 24-hour customer-service window: free-form replies are only allowed
   *  while `now - lastInboundAt < 24h`. Null if the contact never wrote. */
  lastInboundAt: Date | null;
  /** Inbox utilities, from the viewer's point of view. */
  pinned: boolean;
  labelIds: string[];
  assignedTo: { id: string; name: string } | null;
  /** Open reminders the viewer can see (own + shared). */
  reminders: ReminderItem[];
  /** Open colleague escalations / assignments on this conversation. */
  staffAlerts: StaffAlertItem[];
}

// Conversations of this clinic that belong to customers, not staff. Admins (and
// doctors) also get the AI chat bubble; their own conversation with it is not a
// customer contact and must not appear in the inbox.
async function customerConversationWhere(clinicId: string): Promise<Prisma.ConversationWhereInput> {
  const staff = await prisma.clinicMember.findMany({
    where: { clinicId, role: { in: [Role.DOCTOR, Role.ADMIN, Role.STAFF] } },
    select: { userId: true },
  });
  const staffIds = staff.map((s) => s.userId);
  return { clinicId, OR: [{ userId: null }, { userId: { notIn: staffIds } }] };
}

export interface ConversationFilters {
  /** Contact name or phone — the linked patient's, or the WhatsApp profile's. */
  query?: string;
  channel?: string;
  /** "unread" | "escalated" | "needs_me" | "assigned_me" | "pinned" | "reminders". */
  show?: string;
  /** One of the viewer's label ids. */
  label?: string;
}

// The inbox filters as conditions on the conversation, run in the database.
// Combined with AND so they never collide with the base OR (customer vs staff).
function conversationFilterWhere(
  f: ConversationFilters,
  viewerId: string | null
): Prisma.ConversationWhereInput[] {
  const where: Prisma.ConversationWhereInput[] = [];
  const q = f.query?.trim();
  if (q) {
    const phone = phoneDigits(q);
    const user = personSearch(q);
    where.push({
      OR: [
        ...(user ? [{ user }] : []),
        { whatsappName: { contains: q, mode: "insensitive" } },
        ...(phone ? [{ whatsappPhone: { contains: phone } }] : []),
      ],
    });
  }
  if (f.channel && f.channel in Channel) where.push({ channel: f.channel as Channel });
  if (f.show === "unread") {
    where.push({ messages: { some: { isRead: false, senderType: SenderType.USER } } });
  }
  if (f.show === "escalated") where.push({ escalations: { some: { resolvedAt: null } } });
  if (viewerId) {
    if (f.show === "needs_me") where.push(needsMeWhere(viewerId));
    if (f.show === "assigned_me") where.push({ assignedToId: viewerId });
    if (f.show === "pinned") where.push({ pins: { some: { userId: viewerId } } });
    if (f.show === "reminders") {
      where.push({ reminders: { some: visibleReminderWhere(viewerId) } });
    }
    // Labels are personal: the owner filter keeps another user's label id inert.
    if (f.label && /^[0-9a-f-]{36}$/i.test(f.label)) {
      where.push({ labels: { some: { labelId: f.label, label: { ownerId: viewerId } } } });
    }
  }
  return where;
}

export async function getConversations(
  clinicId: string,
  filters: ConversationFilters = {},
  /** The signed-in team member — drives the per-user pins/labels/reminders. */
  viewerId: string | null = null
): Promise<ConversationSummary[]> {
  const baseWhere = await customerConversationWhere(clinicId);
  const now = new Date();
  // Viewer-scoped relations; a null viewer (shouldn't happen in the inbox)
  // matches nothing.
  const me = viewerId ?? "00000000-0000-0000-0000-000000000000";
  const conversations = await prisma.conversation.findMany({
    where: {
      AND: [baseWhere, { messages: { some: {} } }, ...conversationFilterWhere(filters, viewerId)],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      user: { select: { fullName: true, phone: true } },
      assignedTo: { select: { id: true, fullName: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      pins: { where: { userId: me }, select: { userId: true } },
      labels: {
        where: { label: { ownerId: me } },
        select: { label: { select: { id: true, name: true, color: true } } },
      },
      reminders: {
        where: visibleReminderWhere(me),
        orderBy: { dueAt: "asc" },
        take: 1,
        select: { dueAt: true },
      },
      staffAlerts: {
        where: { recipientId: me, resolvedAt: null },
        select: { id: true },
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

  // My own due reminders (for the needs-me flag — shared ones don't ping me).
  const myDue = viewerId
    ? new Set(
        (
          await prisma.conversationReminder.findMany({
            where: {
              clinicId,
              createdById: viewerId,
              doneAt: null,
              dueAt: { lte: now },
            },
            select: { conversationId: true },
          })
        ).map((r) => r.conversationId)
      )
    : new Set<string>();

  const summaries: ConversationSummary[] = conversations.map((c) => {
    const nextReminderAt = c.reminders[0]?.dueAt;
    const unreadCount = c._count.messages;
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
      lastMessage: c.messages[0]?.content ?? undefined,
      lastMessageAt: c.messages[0]?.createdAt ?? undefined,
      unreadCount,
      hasUnresolvedEscalation: c._count.escalations > 0,
      pinned: c.pins.length > 0,
      labels: c.labels.map((l) => l.label),
      assignedTo: c.assignedTo ? { id: c.assignedTo.id, name: c.assignedTo.fullName } : null,
      ...(nextReminderAt ? { nextReminderAt } : {}),
      reminderDue: !!nextReminderAt && nextReminderAt <= now,
      needsMe:
        !!viewerId &&
        (c.staffAlerts.length > 0 ||
          (c.assignedToId === viewerId && unreadCount > 0) ||
          myDue.has(c.id)),
    };
  });

  return sortConversations(summaries);
}

/** Due reminders first (time-sensitive), then the viewer's pins, then recency —
 *  the order is stable otherwise (the query is already newest-first). */
export function sortConversations(list: ConversationSummary[]): ConversationSummary[] {
  const rank = (c: ConversationSummary) => (c.reminderDue ? 0 : c.pinned ? 1 : 2);
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map(({ c }) => c);
}

/** How many conversations are waiting on this team member — the red counter on
 *  the "needs my response" filter. */
export async function countNeedsMe(clinicId: string, viewerId: string): Promise<number> {
  const baseWhere = await customerConversationWhere(clinicId);
  return prisma.conversation.count({ where: { AND: [baseWhere, needsMeWhere(viewerId)] } });
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

export async function getMessages(
  conversationId: string,
  /** The viewer — only their private notes (plus the team's) are attached. */
  viewerId: string | null = null
): Promise<MessageItem[]> {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: {
      notes: {
        where: viewerId ? visibleNoteWhere(viewerId) : { visibility: "CLINIC" },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { fullName: true } } },
      },
      sender: { select: { fullName: true } },
      aiAgent: { select: { name: true } },
      replyTo: {
        select: {
          id: true,
          content: true,
          senderType: true,
          metadata: true,
          sender: { select: { fullName: true } },
          aiAgent: { select: { name: true } },
        },
      },
    },
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
      // Attribution is for staff replies only — a USER message's sender is the
      // patient, already shown as the contact.
      senderId: m.senderType === SenderType.ADMIN ? m.senderId : null,
      senderName: m.senderType === SenderType.ADMIN ? (m.sender?.fullName ?? null) : null,
      agentName: m.aiAgent?.name ?? null,
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
              extraction: media.extraction,
              width: media.width,
              height: media.height,
            },
          }
        : {}),
      ...(structured ? { structured: { kind: structured.kind } } : {}),
      ...(escalation ? { escalation } : {}),
      ...(meta?.reaction ? { reaction: meta.reaction } : {}),
      ...(m.notes.length
        ? {
            notes: m.notes.map((n) => ({
              id: n.id,
              content: n.content,
              visibility: n.visibility,
              authorId: n.authorId,
              authorName: n.author.fullName,
              createdAt: n.createdAt,
            })),
          }
        : {}),
      ...(m.replyTo
        ? {
            replyTo: {
              id: m.replyTo.id,
              senderType: m.replyTo.senderType,
              authorName:
                m.replyTo.senderType === SenderType.ADMIN
                  ? (m.replyTo.sender?.fullName ?? null)
                  : (m.replyTo.aiAgent?.name ?? null),
              snippet: quoteSnippet(
                m.replyTo.content,
                quoteKindOf(m.replyTo.metadata as AgentMessageMetadata | null)
              ),
            },
          }
        : {}),
    };
  });
}

export async function getConversationDetail(
  id: string,
  clinicId: string,
  viewerId: string | null = null
): Promise<ConversationDetail | null> {
  const me = viewerId ?? "00000000-0000-0000-0000-000000000000";
  const c = await prisma.conversation.findFirst({
    where: { id, ...(await customerConversationWhere(clinicId)) },
    include: {
      user: { select: { fullName: true, phone: true } },
      assignedTo: { select: { id: true, fullName: true } },
      pins: { where: { userId: me }, select: { userId: true } },
      labels: { where: { label: { ownerId: me } }, select: { labelId: true } },
      sessions: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          escalations: {
            orderBy: { createdAt: "desc" },
            include: { resolvedBy: { select: { fullName: true } } },
          },
          aiToggledBy: { select: { fullName: true } },
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
  const [reminders, staffAlerts] = await Promise.all([
    listConversationReminders(c.id, me),
    listOpenConversationAlerts(c.id),
  ]);
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
    aiToggledByName: latestSession?.aiToggledBy?.fullName ?? null,
    aiToggledAt: latestSession?.aiToggledAt ?? null,
    escalations: (latestSession?.escalations ?? []).map((e) => ({
      reason: e.reason,
      createdAt: e.createdAt,
      resolvedAt: e.resolvedAt,
      resolvedByName: e.resolvedBy?.fullName ?? null,
    })),
    lastInboundAt: c.messages[0]?.createdAt ?? null,
    pinned: c.pins.length > 0,
    labelIds: c.labels.map((l) => l.labelId),
    assignedTo: c.assignedTo ? { id: c.assignedTo.id, name: c.assignedTo.fullName } : null,
    reminders,
    staffAlerts,
  };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await prisma.message.updateMany({
    where: { conversationId, isRead: false, senderType: SenderType.USER },
    data: { isRead: true },
  });
}
