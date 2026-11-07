import "server-only";
import { prisma } from "@/lib/prisma";
import { NoteVisibility, Role, SenderType, StaffAlertKind, type Prisma } from "@prisma/client";

// Inbox utilities — read side. Everything here is staff-only state layered on
// top of conversations: per-user (pins, labels, private reminders/notes) or
// clinic-wide (assignment, internal notes, shared reminders/notes, alerts).
// The agent and the patient never read any of it.

// ─── Team ──────────────────────────────────────────────────────────────────

export interface InboxTeammate {
  id: string;
  fullName: string;
}

/** Team members who work the inbox (ADMIN, or STAFF holding `messages`) — the
 *  people a conversation can be assigned or escalated to. */
export async function listInboxTeammates(clinicId: string): Promise<InboxTeammate[]> {
  const members = await prisma.clinicMember.findMany({
    where: {
      clinicId,
      OR: [
        { role: Role.ADMIN },
        { role: Role.STAFF, clinicRole: { permissions: { has: "messages" } } },
      ],
    },
    select: { user: { select: { id: true, fullName: true } } },
    orderBy: { user: { fullName: "asc" } },
  });
  return members.map((m) => ({ id: m.user.id, fullName: m.user.fullName }));
}

/** True when `userId` is an inbox teammate of this clinic. */
export async function isInboxTeammate(clinicId: string, userId: string): Promise<boolean> {
  const member = await prisma.clinicMember.findFirst({
    where: {
      clinicId,
      userId,
      OR: [
        { role: Role.ADMIN },
        { role: Role.STAFF, clinicRole: { permissions: { has: "messages" } } },
      ],
    },
    select: { id: true },
  });
  return !!member;
}

// ─── "Needs my response" ─────────────────────────────────────────────────────

/** Conversations waiting on THIS team member: an open escalation/assignment
 *  alert addressed to them, an assigned conversation with unread patient
 *  messages, or one of their own reminders that has come due. */
export function needsMeWhere(viewerId: string, now = new Date()): Prisma.ConversationWhereInput {
  return {
    OR: [
      { staffAlerts: { some: { recipientId: viewerId, resolvedAt: null } } },
      {
        assignedToId: viewerId,
        messages: { some: { isRead: false, senderType: SenderType.USER } },
      },
      { reminders: { some: { createdById: viewerId, doneAt: null, dueAt: { lte: now } } } },
    ],
  };
}

/** Reminders this viewer may see: their own, plus the team's shared ones. */
export function visibleReminderWhere(viewerId: string): Prisma.ConversationReminderWhereInput {
  return {
    doneAt: null,
    OR: [{ createdById: viewerId }, { visibility: NoteVisibility.CLINIC }],
  };
}

/** Message notes this viewer may see. */
export function visibleNoteWhere(viewerId: string): Prisma.MessageNoteWhereInput {
  return { OR: [{ authorId: viewerId }, { visibility: NoteVisibility.CLINIC }] };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export interface InboxLabelItem {
  id: string;
  name: string;
  color: string;
}

export async function listMyLabels(clinicId: string, viewerId: string): Promise<InboxLabelItem[]> {
  return prisma.inboxLabel.findMany({
    where: { clinicId, ownerId: viewerId },
    select: { id: true, name: true, color: true },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export interface ReminderItem {
  id: string;
  conversationId: string;
  dueAt: Date;
  note: string | null;
  visibility: NoteVisibility;
  createdById: string;
  createdByName: string;
}

/** The viewer's own open reminders (any conversation) — the dashboard arms a
 *  timer per reminder so it can toast the moment one comes due. */
export async function listMyOpenReminders(
  clinicId: string,
  viewerId: string
): Promise<
  { id: string; conversationId: string; dueAt: Date; note: string | null; contactName: string }[]
> {
  const rows = await prisma.conversationReminder.findMany({
    where: { clinicId, createdById: viewerId, doneAt: null },
    orderBy: { dueAt: "asc" },
    take: 200,
    select: {
      id: true,
      conversationId: true,
      dueAt: true,
      note: true,
      conversation: {
        select: {
          whatsappName: true,
          whatsappPhone: true,
          user: { select: { fullName: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    dueAt: r.dueAt,
    note: r.note,
    contactName:
      r.conversation.user?.fullName ??
      r.conversation.whatsappName ??
      r.conversation.whatsappPhone ??
      "محادثة",
  }));
}

export async function listConversationReminders(
  conversationId: string,
  viewerId: string
): Promise<ReminderItem[]> {
  const rows = await prisma.conversationReminder.findMany({
    where: { conversationId, ...visibleReminderWhere(viewerId) },
    orderBy: { dueAt: "asc" },
    include: { createdBy: { select: { fullName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    dueAt: r.dueAt,
    note: r.note,
    visibility: r.visibility,
    createdById: r.createdById,
    createdByName: r.createdBy.fullName,
  }));
}

// ─── Internal notes (staff-only messages) ────────────────────────────────────

export interface InternalNoteItem {
  id: string;
  content: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: Date;
}

export async function listInternalNotes(conversationId: string): Promise<InternalNoteItem[]> {
  const rows = await prisma.internalNote.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { fullName: true } } },
  });
  return rows.map((n) => ({
    id: n.id,
    content: n.content,
    authorId: n.authorId,
    authorName: n.author?.fullName ?? null,
    createdAt: n.createdAt,
  }));
}

// ─── Staff alerts ────────────────────────────────────────────────────────────

export interface StaffAlertItem {
  id: string;
  kind: StaffAlertKind;
  messageId: string | null;
  note: string | null;
  recipientId: string;
  recipientName: string;
  actorName: string | null;
  createdAt: Date;
}

/** Open alerts on a conversation (everyone sees who it was escalated to). */
export async function listOpenConversationAlerts(
  conversationId: string
): Promise<StaffAlertItem[]> {
  const rows = await prisma.staffAlert.findMany({
    where: { conversationId, resolvedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      recipient: { select: { fullName: true } },
      actor: { select: { fullName: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    messageId: a.messageId,
    note: a.note,
    recipientId: a.recipientId,
    recipientName: a.recipient.fullName,
    actorName: a.actor?.fullName ?? null,
    createdAt: a.createdAt,
  }));
}

/** Opening a conversation acknowledges the viewer's assignment alert on it. */
export async function acknowledgeAssignment(
  conversationId: string,
  viewerId: string
): Promise<void> {
  await prisma.staffAlert.updateMany({
    where: {
      conversationId,
      recipientId: viewerId,
      kind: StaffAlertKind.ASSIGNMENT,
      resolvedAt: null,
    },
    data: { resolvedAt: new Date(), resolvedById: viewerId },
  });
}

/** The viewer acted in the conversation (replied, or posted an internal note):
 *  that answers any escalation a colleague raised to them there. */
export async function resolveMyEscalationAlerts(
  conversationId: string,
  viewerId: string
): Promise<void> {
  await prisma.staffAlert.updateMany({
    where: {
      conversationId,
      recipientId: viewerId,
      kind: StaffAlertKind.ESCALATION,
      resolvedAt: null,
    },
    data: { resolvedAt: new Date(), resolvedById: viewerId },
  });
}

// ─── Quick replies ───────────────────────────────────────────────────────────

export interface QuickReplyItem {
  id: string;
  title: string;
  content: string;
  category: string | null;
  hasMedia: boolean;
  mediaMimeType: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  usageCount: number;
  updatedAt: Date;
}

export async function listQuickReplies(clinicId: string): Promise<QuickReplyItem[]> {
  const rows = await prisma.quickReply.findMany({
    where: { clinicId },
    // Most used first — the pool is about speed.
    orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map((q) => ({
    id: q.id,
    title: q.title,
    content: q.content,
    category: q.category,
    hasMedia: !!q.mediaPath,
    mediaMimeType: q.mediaMimeType,
    mediaWidth: q.mediaWidth,
    mediaHeight: q.mediaHeight,
    usageCount: q.usageCount,
    updatedAt: q.updatedAt,
  }));
}
