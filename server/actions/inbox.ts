"use server";

import { NoteVisibility, StaffAlertKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPermittedContext, type ClinicContext } from "@/lib/auth";
import { isLabelColor } from "@/lib/inbox-labels";
import {
  isInboxTeammate,
  listInboxTeammates,
  listMyLabels,
  listMyOpenReminders,
  resolveMyEscalationAlerts,
  type InboxLabelItem,
  type InboxTeammate,
  type InternalNoteItem,
} from "@/server/services/inbox";

// Inbox utilities — write side. Every action resolves the clinic from the
// request host (never the caller), requires `messages`, and checks that the
// conversation / label / reminder / note it touches belongs to that clinic (and,
// for per-user state, to the caller).

export type InboxActionResult<T = void> =
  ({ ok: true } & (T extends void ? object : { data: T })) | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

async function inboxContext(): Promise<ClinicContext | null> {
  return getPermittedContext("messages");
}

async function ownConversation(ctx: ClinicContext, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, clinicId: ctx.clinic.id },
    select: { id: true, assignedToId: true, updatedAt: true },
  });
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// ─── Team ──────────────────────────────────────────────────────────────────

export async function fetchInboxTeammates(): Promise<InboxTeammate[]> {
  const ctx = await inboxContext();
  if (!ctx) return [];
  return listInboxTeammates(ctx.clinic.id);
}

// ─── Pins (per user) ─────────────────────────────────────────────────────────

export async function setConversationPinned(
  conversationId: string,
  pinned: boolean
): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  if (!(await ownConversation(ctx, conversationId))) return fail("not_found");

  if (pinned) {
    await prisma.conversationPin.upsert({
      where: { userId_conversationId: { userId: ctx.user.id, conversationId } },
      create: { userId: ctx.user.id, conversationId, clinicId: ctx.clinic.id },
      update: {},
    });
  } else {
    await prisma.conversationPin.deleteMany({ where: { userId: ctx.user.id, conversationId } });
  }
  return { ok: true };
}

// ─── Labels (per user) ───────────────────────────────────────────────────────

export async function fetchMyLabels(): Promise<InboxLabelItem[]> {
  const ctx = await inboxContext();
  if (!ctx) return [];
  return listMyLabels(ctx.clinic.id, ctx.user.id);
}

export async function createLabel(
  name: string,
  color: string
): Promise<InboxActionResult<InboxLabelItem>> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const clean = cleanText(name, 40);
  if (!clean) return fail("اسم التصنيف مطلوب");
  if (!isLabelColor(color)) return fail("لون غير صالح");

  const exists = await prisma.inboxLabel.findFirst({
    where: { clinicId: ctx.clinic.id, ownerId: ctx.user.id, name: clean },
    select: { id: true },
  });
  if (exists) return fail("لديك تصنيف بنفس الاسم");

  const label = await prisma.inboxLabel.create({
    data: { clinicId: ctx.clinic.id, ownerId: ctx.user.id, name: clean, color },
    select: { id: true, name: true, color: true },
  });
  return { ok: true, data: label };
}

export async function updateLabel(
  labelId: string,
  name: string,
  color: string
): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const clean = cleanText(name, 40);
  if (!clean) return fail("اسم التصنيف مطلوب");
  if (!isLabelColor(color)) return fail("لون غير صالح");

  const clash = await prisma.inboxLabel.findFirst({
    where: { clinicId: ctx.clinic.id, ownerId: ctx.user.id, name: clean, NOT: { id: labelId } },
    select: { id: true },
  });
  if (clash) return fail("لديك تصنيف بنفس الاسم");

  const res = await prisma.inboxLabel.updateMany({
    where: { id: labelId, clinicId: ctx.clinic.id, ownerId: ctx.user.id },
    data: { name: clean, color },
  });
  return res.count ? { ok: true } : fail("not_found");
}

export async function deleteLabel(labelId: string): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const res = await prisma.inboxLabel.deleteMany({
    where: { id: labelId, clinicId: ctx.clinic.id, ownerId: ctx.user.id },
  });
  return res.count ? { ok: true } : fail("not_found");
}

/** Replaces the caller's labels on a conversation (other users' are untouched). */
export async function setConversationLabels(
  conversationId: string,
  labelIds: string[]
): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  if (!(await ownConversation(ctx, conversationId))) return fail("not_found");

  const mine = await prisma.inboxLabel.findMany({
    where: { clinicId: ctx.clinic.id, ownerId: ctx.user.id },
    select: { id: true },
  });
  const myIds = mine.map((l) => l.id);
  const wanted = labelIds.filter((id) => myIds.includes(id));

  await prisma.$transaction([
    prisma.conversationLabel.deleteMany({
      where: { conversationId, labelId: { in: myIds } },
    }),
    prisma.conversationLabel.createMany({
      data: wanted.map((labelId) => ({ labelId, conversationId })),
      skipDuplicates: true,
    }),
  ]);
  return { ok: true };
}

// ─── Assignment (clinic-wide) ────────────────────────────────────────────────

export async function assignConversation(
  conversationId: string,
  assigneeId: string | null
): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const conversation = await ownConversation(ctx, conversationId);
  if (!conversation) return fail("not_found");
  if (assigneeId && !(await isInboxTeammate(ctx.clinic.id, assigneeId))) {
    return fail("هذا العضو لا يملك صلاحية الرسائل");
  }
  if (conversation.assignedToId === assigneeId) return { ok: true };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.conversation.update({
      where: { id: conversationId },
      data: {
        assignedToId: assigneeId,
        assignedById: assigneeId ? ctx.user.id : null,
        assignedAt: assigneeId ? now : null,
        // Keep the list order: @updatedAt would otherwise bump it to the top.
        updatedAt: conversation.updatedAt,
      },
    });
    // The previous assignee's pending "assigned to you" alert is moot now.
    await tx.staffAlert.updateMany({
      where: { conversationId, kind: StaffAlertKind.ASSIGNMENT, resolvedAt: null },
      data: { resolvedAt: now, resolvedById: ctx.user.id },
    });
    // Notify the new assignee — unless they assigned it to themselves.
    if (assigneeId && assigneeId !== ctx.user.id) {
      await tx.staffAlert.create({
        data: {
          clinicId: ctx.clinic.id,
          conversationId,
          recipientId: assigneeId,
          actorId: ctx.user.id,
          kind: StaffAlertKind.ASSIGNMENT,
        },
      });
    }
  });
  return { ok: true };
}

// ─── Escalate to a colleague ─────────────────────────────────────────────────

export async function escalateToColleague(input: {
  conversationId: string;
  messageId?: string | null;
  recipientId: string;
  note: string;
}): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  if (!(await ownConversation(ctx, input.conversationId))) return fail("not_found");
  if (input.recipientId === ctx.user.id) return fail("لا يمكنك التصعيد لنفسك");
  if (!(await isInboxTeammate(ctx.clinic.id, input.recipientId))) {
    return fail("هذا العضو لا يملك صلاحية الرسائل");
  }

  let messageId: string | null = null;
  if (input.messageId) {
    const msg = await prisma.message.findFirst({
      where: { id: input.messageId, conversationId: input.conversationId },
      select: { id: true },
    });
    messageId = msg?.id ?? null;
  }

  await prisma.staffAlert.create({
    data: {
      clinicId: ctx.clinic.id,
      conversationId: input.conversationId,
      messageId,
      recipientId: input.recipientId,
      actorId: ctx.user.id,
      kind: StaffAlertKind.ESCALATION,
      note: cleanText(input.note, 1000) || null,
    },
  });
  return { ok: true };
}

/** Marks a colleague escalation / assignment alert done. The recipient or the
 *  colleague who raised it can close it. */
export async function resolveStaffAlert(alertId: string): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const res = await prisma.staffAlert.updateMany({
    where: {
      id: alertId,
      clinicId: ctx.clinic.id,
      resolvedAt: null,
      OR: [{ recipientId: ctx.user.id }, { actorId: ctx.user.id }],
    },
    data: { resolvedAt: new Date(), resolvedById: ctx.user.id },
  });
  return res.count ? { ok: true } : fail("not_found");
}

// ─── Reminders ───────────────────────────────────────────────────────────────

export async function createReminder(input: {
  conversationId: string;
  dueAt: string;
  note?: string;
  visibility: NoteVisibility;
}): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  if (!(await ownConversation(ctx, input.conversationId))) return fail("not_found");
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime())) return fail("وقت غير صالح");
  if (dueAt.getTime() < Date.now() - 60_000) return fail("اختر وقتًا في المستقبل");
  const visibility =
    input.visibility === NoteVisibility.CLINIC ? NoteVisibility.CLINIC : NoteVisibility.PRIVATE;

  await prisma.conversationReminder.create({
    data: {
      clinicId: ctx.clinic.id,
      conversationId: input.conversationId,
      createdById: ctx.user.id,
      dueAt,
      note: cleanText(input.note, 500) || null,
      visibility,
    },
  });
  return { ok: true };
}

/** Done = handled. Anyone who can see a shared reminder may close it; a private
 *  one only its creator. */
export async function completeReminder(reminderId: string): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const res = await prisma.conversationReminder.updateMany({
    where: {
      id: reminderId,
      clinicId: ctx.clinic.id,
      doneAt: null,
      OR: [{ createdById: ctx.user.id }, { visibility: NoteVisibility.CLINIC }],
    },
    data: { doneAt: new Date(), doneById: ctx.user.id },
  });
  return res.count ? { ok: true } : fail("not_found");
}

/** Deleting is the creator's call only. */
export async function deleteReminder(reminderId: string): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const res = await prisma.conversationReminder.deleteMany({
    where: { id: reminderId, clinicId: ctx.clinic.id, createdById: ctx.user.id },
  });
  return res.count ? { ok: true } : fail("not_found");
}

/** The caller's open reminders, for the dashboard-wide due timers. */
export async function fetchMyOpenReminders(): Promise<
  { id: string; conversationId: string; dueAt: string; note: string | null; contactName: string }[]
> {
  const ctx = await inboxContext();
  if (!ctx) return [];
  const rows = await listMyOpenReminders(ctx.clinic.id, ctx.user.id);
  return rows.map((r) => ({ ...r, dueAt: r.dueAt.toISOString() }));
}

// ─── Internal notes (staff-only messages in the thread) ──────────────────────

export async function addInternalNote(
  conversationId: string,
  content: string
): Promise<InboxActionResult<InternalNoteItem>> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  if (!(await ownConversation(ctx, conversationId))) return fail("not_found");
  const text = cleanText(content, 4000);
  if (!text) return fail("الملاحظة فارغة");

  const note = await prisma.internalNote.create({
    data: { clinicId: ctx.clinic.id, conversationId, authorId: ctx.user.id, content: text },
  });
  // Answering a colleague's escalation with a note counts as handling it.
  await resolveMyEscalationAlerts(conversationId, ctx.user.id);
  return {
    ok: true,
    data: {
      id: note.id,
      content: note.content,
      authorId: ctx.user.id,
      authorName: ctx.user.profile.fullName,
      createdAt: note.createdAt,
    },
  };
}

export async function deleteInternalNote(noteId: string): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const res = await prisma.internalNote.deleteMany({
    where: { id: noteId, clinicId: ctx.clinic.id, authorId: ctx.user.id },
  });
  return res.count ? { ok: true } : fail("not_found");
}

// ─── Message notes ───────────────────────────────────────────────────────────

export async function addMessageNote(input: {
  messageId: string;
  content: string;
  visibility: NoteVisibility;
}): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const msg = await prisma.message.findFirst({
    where: { id: input.messageId, clinicId: ctx.clinic.id },
    select: { id: true, conversationId: true },
  });
  if (!msg) return fail("not_found");
  const text = cleanText(input.content, 2000);
  if (!text) return fail("الملاحظة فارغة");

  await prisma.messageNote.create({
    data: {
      clinicId: ctx.clinic.id,
      conversationId: msg.conversationId,
      messageId: msg.id,
      authorId: ctx.user.id,
      content: text,
      visibility:
        input.visibility === NoteVisibility.CLINIC ? NoteVisibility.CLINIC : NoteVisibility.PRIVATE,
    },
  });
  return { ok: true };
}

export async function deleteMessageNote(noteId: string): Promise<InboxActionResult> {
  const ctx = await inboxContext();
  if (!ctx) return fail("forbidden");
  const res = await prisma.messageNote.deleteMany({
    where: { id: noteId, clinicId: ctx.clinic.id, authorId: ctx.user.id },
  });
  return res.count ? { ok: true } : fail("not_found");
}
