import "server-only";
import { ConversationKind, MessageDelivery, Role, SenderType, StaffEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inBranchScope } from "@/lib/branch-scope";
import { escalationReasonLabel } from "@/lib/escalation-reasons";
import { formatSlotDate, formatSlotTime } from "@/lib/slot-time";
import { sendTemplateMessage } from "@/lib/meta/whatsapp";
import {
  getClinicWhatsappTransport,
  getWhatsappTransportById,
  hasServiceWindow,
  sendWhatsAppText,
  type WhatsAppTransport,
} from "@/lib/whatsapp/transport";
import { STAFF_EVENT_META, STAFF_EVENTS, type StaffAlertToken } from "@/lib/staff/events";
import { persistAgentMessage, resolveActiveSession } from "@/server/services/agentSession";
import { getStaffAssistantConfig } from "./access";

/**
 * Team alerts (#89).
 *
 * Event sources call `queueStaffEvent` (directly or through the small notify*
 * helpers below). Nothing is sent there: each recipient gets a queued row, and
 * the minute sweep (`runStaffAlertSweep`, pg_cron → /api/cron/staff-alerts)
 * sends ONE grouped WhatsApp message per member once their oldest unsent alert
 * is `batchMinutes` old.
 *
 * Delivery honours the 24h rule: WhatsApp Web, or an official number inside the
 * member's window → the full grouped text. An official number outside it → the
 * clinic's approved alert template (count + one-line summary); the full text
 * follows as soon as the member writes in (`flushMemberAlertsOnInbound`). With
 * no template bound, alerts simply wait for that moment.
 *
 * Every function here is best-effort: an alert must never break the action
 * that raised it.
 */

const MAX_LINES_PER_GROUP = 10;
const MAX_ATTEMPTS = 10;
/** How many members one sweep delivers to. */
const SWEEP_BATCH = 50;
/** Reminders older than this when the sweep first sees them are not sent. */
const REMINDER_MAX_AGE_MS = 24 * 60 * 60_000;
/** lastError of alerts that can only go out once the member writes in. */
const NO_TEMPLATE = "window_closed_no_template";

export interface StaffEventInput {
  clinicId: string;
  event: StaffEvent;
  /** One line describing it, e.g. "أحمد محمد — طلب التحدث مع موظف". */
  text: string;
  /** Idempotency key per member (e.g. "esc:<id>"). */
  dedupeKey: string;
  conversationId?: string | null;
  appointmentId?: string | null;
  /** The branch it happened in — branch-limited members only get theirs.
   *  `undefined` = not branch-shaped (e.g. units), everyone routed gets it. */
  branchId?: string | null;
  /** The appointment's doctor — doctor members only get their own. */
  doctorId?: string | null;
  /** Personal events: exactly these users (members of the clinic). */
  toUserIds?: string[];
  /** Whoever caused it — never alerted about their own action. */
  actorUserId?: string | null;
}

/** Queues one event for every member it should reach. Never throws. */
export async function queueStaffEvent(input: StaffEventInput): Promise<void> {
  try {
    const personal = STAFF_EVENT_META[input.event].personal;
    const members = await prisma.clinicMember.findMany({
      where: {
        clinicId: input.clinicId,
        role: { in: [Role.ADMIN, Role.STAFF, Role.DOCTOR] },
        // Only members who linked their WhatsApp can be reached.
        whatsappLink: { verifiedAt: { not: null } },
        ...(personal
          ? { userId: { in: input.toUserIds ?? [] } }
          : { eventSubscriptions: { some: { event: input.event } } }),
      },
      select: {
        id: true,
        userId: true,
        role: true,
        allBranches: true,
        branches: { select: { branchId: true } },
      },
    });
    if (members.length === 0) return;

    let doctorMemberUserId: string | null = null;
    if (input.doctorId && members.some((m) => m.role === Role.DOCTOR)) {
      const d = await prisma.doctor.findUnique({
        where: { id: input.doctorId },
        select: { profileId: true },
      });
      doctorMemberUserId = d?.profileId ?? null;
    }

    const recipients = members.filter((m) => {
      if (input.actorUserId && m.userId === input.actorUserId) return false;
      if (m.role === Role.DOCTOR) {
        // A doctor hears only about their own appointments, and only the
        // events doctors can be routed.
        if (!personal && !STAFF_EVENT_META[input.event].doctors) return false;
        if (!personal && m.userId !== doctorMemberUserId) return false;
      }
      if (m.role === Role.STAFF && !m.allBranches && input.branchId !== undefined) {
        const scope = m.branches.map((b) => b.branchId);
        if (!inBranchScope(scope, input.branchId)) return false;
      }
      return true;
    });
    if (recipients.length === 0) return;

    await prisma.staffNotification.createMany({
      data: recipients.map((m) => ({
        clinicId: input.clinicId,
        memberId: m.id,
        event: input.event,
        text: oneLine(input.text, 300),
        conversationId: input.conversationId ?? null,
        appointmentId: input.appointmentId ?? null,
        dedupeKey: input.dedupeKey,
      })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("[staff-alerts] failed to queue event", input.event, err);
  }
}

function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ─── Event sources ───────────────────────────────────────────────────────────

async function clinicTimezone(clinicId: string): Promise<string> {
  const c = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { timezone: true } });
  return c?.timezone ?? "Africa/Cairo";
}

function clockIn(date: Date, timeZone: string): string {
  return date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", timeZone });
}

/** Contact name + the branch of the number the conversation last went through. */
async function conversationInfo(conversationId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      kind: true,
      whatsappName: true,
      whatsappPhone: true,
      user: { select: { fullName: true } },
      messages: {
        where: { whatsappConfigId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { whatsappConfig: { select: { branchId: true } } },
      },
    },
  });
  if (!conv) return null;
  return {
    kind: conv.kind,
    name: conv.user?.fullName || conv.whatsappName || conv.whatsappPhone || "عميل",
    // Website chats / untagged history have no number → no branch.
    branchId: conv.messages[0]?.whatsappConfig?.branchId ?? null,
  };
}

/** A new AI/system escalation (escalate_to_human, media to review, gates). */
export async function notifyAiEscalation(args: {
  clinicId: string;
  conversationId: string;
  escalationId: string;
  reason: string | null;
}): Promise<void> {
  try {
    const info = await conversationInfo(args.conversationId);
    if (!info || info.kind === ConversationKind.STAFF_ASSISTANT) return;
    const tz = await clinicTimezone(args.clinicId);
    await queueStaffEvent({
      clinicId: args.clinicId,
      event: StaffEvent.AI_ESCALATION,
      text: `${info.name} — ${escalationReasonLabel(args.reason)} (${clockIn(new Date(), tz)})`,
      dedupeKey: `esc:${args.escalationId}`,
      conversationId: args.conversationId,
      branchId: info.branchId,
    });
  } catch (err) {
    console.error("[staff-alerts] escalation alert failed", err);
  }
}

/** A colleague escalated a conversation to `recipientId` (inbox). */
export async function notifyColleagueEscalation(args: {
  clinicId: string;
  alertId: string;
  conversationId: string;
  recipientId: string;
  actorId: string;
  note: string | null;
}): Promise<void> {
  try {
    const [info, actor] = await Promise.all([
      conversationInfo(args.conversationId),
      prisma.profile.findUnique({ where: { id: args.actorId }, select: { fullName: true } }),
    ]);
    if (!info) return;
    const note = args.note ? `: ${args.note}` : "";
    await queueStaffEvent({
      clinicId: args.clinicId,
      event: StaffEvent.COLLEAGUE_ESCALATION,
      text: `${actor?.fullName ?? "زميل"} صعّد لك محادثة ${info.name}${note}`,
      dedupeKey: `alert:${args.alertId}`,
      conversationId: args.conversationId,
      toUserIds: [args.recipientId],
    });
  } catch (err) {
    console.error("[staff-alerts] colleague alert failed", err);
  }
}

/** A conversation was assigned to `assigneeId` by `actorId`. */
export async function notifyAssignment(args: {
  clinicId: string;
  conversationId: string;
  assigneeId: string;
  actorId: string;
}): Promise<void> {
  try {
    if (args.assigneeId === args.actorId) return;
    const [info, actor] = await Promise.all([
      conversationInfo(args.conversationId),
      prisma.profile.findUnique({ where: { id: args.actorId }, select: { fullName: true } }),
    ]);
    if (!info) return;
    await queueStaffEvent({
      clinicId: args.clinicId,
      event: StaffEvent.ASSIGNMENT,
      text: `${actor?.fullName ?? "زميل"} أسند إليك محادثة ${info.name}`,
      // A re-assignment later is a new event.
      dedupeKey: `assign:${args.conversationId}:${Date.now()}`,
      conversationId: args.conversationId,
      toUserIds: [args.assigneeId],
    });
  } catch (err) {
    console.error("[staff-alerts] assignment alert failed", err);
  }
}

async function appointmentLine(appointmentId: string) {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      clinicId: true,
      branchId: true,
      doctorId: true,
      orderNumber: true,
      bookingDate: true,
      scheduledTime: true,
      rule: { select: { mode: true } },
      cancellationReason: true,
      patient: { select: { fullName: true } },
      doctor: { select: { fullName: true } },
      branch: { select: { name: true } },
      slot: { select: { date: true, startTime: true } },
    },
  });
  if (!a) return null;
  const day = a.slot?.date ?? a.bookingDate;
  const when = [
    day ? formatSlotDate(day, { weekday: "long", day: "numeric", month: "short" }) : "",
    a.slot
      ? formatSlotTime(a.slot.startTime)
      : a.rule?.mode === "DAY_ONLY"
        ? // Day-only: the team still has to call the patient to set the time.
          (a.scheduledTime ?? "(حجز يوم — يحتاج تحديد الوقت)")
        : a.orderNumber != null
          ? `دور ${a.orderNumber}`
          : "",
  ]
    .filter(Boolean)
    .join(" ");
  const where = a.branch?.name ? ` — ${a.branch.name}` : "";
  return {
    a,
    line: `${a.patient.fullName} مع ${a.doctor.fullName} — ${when}${where}`,
  };
}

/** A new booking (any source). `actorUserId` = the team member who booked it. */
export async function notifyNewBooking(
  appointmentId: string,
  actorUserId: string | null = null
): Promise<void> {
  try {
    const r = await appointmentLine(appointmentId);
    if (!r) return;
    await queueStaffEvent({
      clinicId: r.a.clinicId,
      event: StaffEvent.NEW_BOOKING,
      text: r.line,
      dedupeKey: `book:${appointmentId}`,
      appointmentId,
      branchId: r.a.branchId,
      doctorId: r.a.doctorId,
      actorUserId,
    });
  } catch (err) {
    console.error("[staff-alerts] booking alert failed", err);
  }
}

/** The PATIENT cancelled their own appointment. */
export async function notifyPatientCancelled(appointmentId: string): Promise<void> {
  try {
    const r = await appointmentLine(appointmentId);
    if (!r) return;
    const reason = r.a.cancellationReason ? ` (السبب: ${r.a.cancellationReason})` : "";
    await queueStaffEvent({
      clinicId: r.a.clinicId,
      event: StaffEvent.PATIENT_CANCELLED,
      text: `${r.line}${reason}`,
      dedupeKey: `cancel:${appointmentId}`,
      appointmentId,
      branchId: r.a.branchId,
      doctorId: r.a.doctorId,
    });
  } catch (err) {
    console.error("[staff-alerts] cancellation alert failed", err);
  }
}

/** A patient asked the AI for an operation — the team must contact them. */
export async function notifyOperationRequest(operationId: string): Promise<void> {
  try {
    const op = await prisma.operation.findUnique({
      where: { id: operationId },
      select: {
        clinicId: true,
        name: true,
        requestNote: true,
        conversationId: true,
        patient: { select: { fullName: true, phone: true } },
      },
    });
    if (!op) return;
    const phone = op.patient.phone ? ` (${op.patient.phone})` : "";
    const note = op.requestNote ? ` — ${op.requestNote.slice(0, 120)}` : "";
    await queueStaffEvent({
      clinicId: op.clinicId,
      event: StaffEvent.OPERATION_REQUEST,
      text: `${op.patient.fullName}${phone} يطلب: ${op.name}${note}`,
      dedupeKey: `op:${operationId}`,
      conversationId: op.conversationId,
      // A request has no branch yet: every routed member hears about it.
      branchId: undefined,
    });
  } catch (err) {
    console.error("[staff-alerts] operation request alert failed", err);
  }
}

/** The clinic's AI units crossed the low line / ran out. */
export async function notifyUnits(
  clinicId: string,
  severity: "low" | "out",
  unitBalance: number
): Promise<void> {
  await queueStaffEvent({
    clinicId,
    event: severity === "out" ? StaffEvent.UNITS_OUT : StaffEvent.UNITS_LOW,
    text:
      severity === "out"
        ? "نفد رصيد وحدات المساعد الذكي، وتوقف عن الرد على العملاء حتى يُشحن الرصيد"
        : `رصيد وحدات المساعد الذكي منخفض: ${Math.max(0, unitBalance)} وحدة متبقية`,
    dedupeKey: `units:${severity}:${new Date().toISOString().slice(0, 13)}`,
  });
}

/** Queues every due, not-yet-alerted conversation reminder to its creator. */
async function queueDueReminders(now: Date): Promise<void> {
  const due = await prisma.conversationReminder.findMany({
    where: {
      doneAt: null,
      whatsappNotifiedAt: null,
      dueAt: { lte: now, gte: new Date(now.getTime() - REMINDER_MAX_AGE_MS) },
    },
    select: { id: true, clinicId: true, conversationId: true, createdById: true, note: true },
    take: 200,
  });
  if (due.length === 0) return;
  // Claim first: a concurrent sweep must not queue them again.
  const claimed = await prisma.conversationReminder.updateMany({
    where: { id: { in: due.map((r) => r.id) }, whatsappNotifiedAt: null },
    data: { whatsappNotifiedAt: now },
  });
  if (claimed.count === 0) return;
  for (const r of due) {
    const info = await conversationInfo(r.conversationId);
    if (!info) continue;
    await queueStaffEvent({
      clinicId: r.clinicId,
      event: StaffEvent.REMINDER_DUE,
      text: `تذكير: محادثة ${info.name}${r.note ? ` — ${r.note}` : ""}`,
      dedupeKey: `reminder:${r.id}`,
      conversationId: r.conversationId,
      toUserIds: [r.createdById],
    });
  }
}

// ─── Delivery ────────────────────────────────────────────────────────────────

type PendingRow = { id: string; event: StaffEvent; text: string; createdAt: Date };

/** The grouped WhatsApp message for a member's alerts. */
export function composeAlertDigest(clinicName: string, rows: PendingRow[]): string {
  const byEvent = new Map<StaffEvent, PendingRow[]>();
  for (const r of rows) byEvent.set(r.event, [...(byEvent.get(r.event) ?? []), r]);
  const parts = [`🔔 *تنبيهات ${clinicName}* (${rows.length})`];
  for (const event of STAFF_EVENTS) {
    const list = byEvent.get(event);
    if (!list?.length) continue;
    const lines = list.slice(0, MAX_LINES_PER_GROUP).map((r) => `• ${r.text}`);
    if (list.length > MAX_LINES_PER_GROUP) {
      lines.push(`• و${list.length - MAX_LINES_PER_GROUP} أخرى…`);
    }
    parts.push(`*${STAFF_EVENT_META[event].heading} (${list.length})*\n${lines.join("\n")}`);
  }
  parts.push("_اسألني عن أي منها أو اطلب مني إجراءً عليها._");
  return parts.join("\n\n");
}

/** "2 تصعيد، 1 حجز جديد" — one line, safe as a template parameter. */
export function summarizeAlerts(rows: { event: StaffEvent }[]): string {
  const counts = new Map<StaffEvent, number>();
  for (const r of rows) counts.set(r.event, (counts.get(r.event) ?? 0) + 1);
  return STAFF_EVENTS.filter((e) => counts.has(e))
    .map((e) => `${counts.get(e)} ${STAFF_EVENT_META[e].short}`)
    .join("، ");
}

/** Meta rejects template parameters with newlines, tabs or 4+ spaces. */
export function templateParam(value: string): string {
  return oneLine(value.replace(/[\n\t]/g, " ").replace(/ {4,}/g, "   "), 900) || "-";
}

export interface MemberTarget {
  memberId: string;
  clinicId: string;
  userId: string;
  fullName: string;
  clinicName: string;
  contact: { phone: string | null; userId: string | null };
  linkConfigId: string | null;
}

export async function loadTarget(memberId: string): Promise<MemberTarget | null> {
  const m = await prisma.clinicMember.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      clinicId: true,
      userId: true,
      user: { select: { fullName: true } },
      clinic: { select: { name: true } },
      whatsappLink: {
        select: { phone: true, whatsappUserId: true, whatsappConfigId: true, verifiedAt: true },
      },
    },
  });
  if (!m?.whatsappLink?.verifiedAt) return null;
  return {
    memberId: m.id,
    clinicId: m.clinicId,
    userId: m.userId,
    fullName: m.user.fullName,
    clinicName: m.clinic.name,
    contact: { phone: m.whatsappLink.phone, userId: m.whatsappLink.whatsappUserId },
    linkConfigId: m.whatsappLink.whatsappConfigId,
  };
}

/** The member's own WhatsApp assistant thread (where alerts are recorded). */
export async function staffThreadId(clinicId: string, userId: string): Promise<string | null> {
  const conv = await prisma.conversation.findFirst({
    where: {
      clinicId,
      userId,
      channel: "WHATSAPP",
      kind: ConversationKind.STAFF_ASSISTANT,
    },
    select: { id: true },
  });
  return conv?.id ?? null;
}

/** The number the member linked through, else the clinic's main number. */
export async function targetTransport(t: MemberTarget): Promise<WhatsAppTransport | null> {
  if (t.linkConfigId) {
    const byLink = await getWhatsappTransportById(t.clinicId, t.linkConfigId);
    if (byLink) return byLink;
  }
  return getClinicWhatsappTransport(t.clinicId);
}

const WINDOW_MS = 24 * 60 * 60_000;

export async function windowOpen(conversationId: string | null): Promise<boolean> {
  if (!conversationId) return false;
  const last = await prisma.message.findFirst({
    where: { conversationId, senderType: SenderType.USER },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return !!last && Date.now() - last.createdAt.getTime() < WINDOW_MS;
}

/** Records an alert message in the member's thread so the assistant (and the
 *  member, scrolling back) see what was sent. */
export async function recordInThread(
  clinicId: string,
  conversationId: string | null,
  text: string,
  configId: string,
  providerMessageId: string | null
): Promise<void> {
  if (!conversationId) return;
  try {
    const sessionId = await resolveActiveSession(conversationId, clinicId);
    const msg = await persistAgentMessage(
      conversationId,
      sessionId,
      clinicId,
      text,
      null,
      MessageDelivery.SENT,
      null,
      configId
    );
    if (providerMessageId) {
      await prisma.message.update({
        where: { id: msg.id },
        data: { whatsappMessageId: providerMessageId },
      });
    }
  } catch (err) {
    console.error("[staff-alerts] failed to record alert in thread", err);
  }
}

async function markFailed(ids: string[], error: string, giveUp: boolean): Promise<void> {
  await prisma.staffNotification.updateMany({
    where: { id: { in: ids } },
    data: {
      attempts: { increment: 1 },
      lastError: error.slice(0, 500),
      ...(giveUp ? { sentAt: new Date() } : {}),
    },
  });
}

/**
 * Sends one member their unsent alerts (and, when `includeDetails`, the full
 * text of ones only announced by template). `windowKnownOpen` = the member just
 * wrote in, so free text is allowed on any number.
 */
async function deliverToMember(
  memberId: string,
  opts: { includeDetails: boolean; windowKnownOpen: boolean }
): Promise<void> {
  const target = await loadTarget(memberId);
  const rows = await prisma.staffNotification.findMany({
    where: {
      memberId,
      OR: [{ sentAt: null }, ...(opts.includeDetails ? [{ detailsPending: true }] : [])],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, event: true, text: true, createdAt: true, attempts: true, sentAt: true },
    take: 200,
  });
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);

  // Unlinked since the alert was queued — drop it.
  if (!target) {
    await markFailed(ids, "member_not_linked", true);
    return;
  }
  const transport = await targetTransport(target);
  const giveUp = rows.every((r) => r.attempts + 1 >= MAX_ATTEMPTS);
  if (!transport) {
    await markFailed(ids, "no_whatsapp_number", giveUp);
    return;
  }

  const threadId = await staffThreadId(target.clinicId, target.userId);
  const canText =
    opts.windowKnownOpen || !hasServiceWindow(transport.provider) || (await windowOpen(threadId));

  try {
    if (canText) {
      const text = composeAlertDigest(target.clinicName, rows);
      const providerId = await sendWhatsAppText(transport, target.contact, text);
      await prisma.staffNotification.updateMany({
        where: { id: { in: ids } },
        data: { sentAt: new Date(), detailsPending: false, lastError: null },
      });
      await recordInThread(target.clinicId, threadId, text, transport.configId, providerId);
      return;
    }

    // Official number, closed window: announce by the approved template.
    const unsent = rows.filter((r) => !r.sentAt);
    if (unsent.length === 0 || transport.provider !== "META_CLOUD") return;
    const config = await getStaffAssistantConfig(target.clinicId);
    if (!config.alertTemplateName || !config.alertTemplateLanguage) {
      // Nothing can reach them now; the alerts go out when they next write in.
      await prisma.staffNotification.updateMany({
        where: { id: { in: unsent.map((r) => r.id) }, lastError: null },
        data: { lastError: NO_TEMPLATE },
      });
      return;
    }
    const values: Record<StaffAlertToken, string> = {
      alert_count: String(unsent.length),
      alert_summary: summarizeAlerts(unsent),
      member_name: target.fullName,
      clinic_name: target.clinicName,
    };
    const variables = config.alertVariableMap.map((t) =>
      templateParam(values[t as StaffAlertToken] ?? "")
    );
    const providerId = await sendTemplateMessage(
      target.contact,
      { name: config.alertTemplateName, languageCode: config.alertTemplateLanguage, variables },
      transport
    );
    await prisma.staffNotification.updateMany({
      where: { id: { in: unsent.map((r) => r.id) } },
      data: { sentAt: new Date(), detailsPending: true, lastError: null },
    });
    const rendered = config.alertBodyText
      ? config.alertBodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[Number(n) - 1] ?? "")
      : `لديك ${unsent.length} تنبيهات جديدة: ${values.alert_summary}`;
    await recordInThread(target.clinicId, threadId, rendered, transport.configId, providerId);
  } catch (err) {
    console.error(`[staff-alerts] delivery to member ${memberId} failed:`, err);
    await markFailed(
      rows.filter((r) => !r.sentAt).map((r) => r.id),
      err instanceof Error ? err.message : String(err),
      giveUp
    );
  }
}

/**
 * The member just wrote to the clinic (their window is open): send everything
 * still waiting for them — unsent alerts and the details of template-announced
 * ones — right away, before the assistant answers.
 */
export async function flushMemberAlertsOnInbound(memberId: string): Promise<void> {
  try {
    await deliverToMember(memberId, { includeDetails: true, windowKnownOpen: true });
  } catch (err) {
    console.error("[staff-alerts] inbound flush failed", err);
  }
}

/**
 * The minute sweep: queues due reminders, then delivers to every member whose
 * oldest unsent alert has waited the clinic's batch window.
 */
export async function runStaffAlertSweep(now = new Date()): Promise<{ members: number }> {
  await queueDueReminders(now);

  const groups = await prisma.staffNotification.groupBy({
    by: ["memberId", "clinicId"],
    // Alerts parked for lack of a template wait for the member's next message
    // (flushMemberAlertsOnInbound) instead of being retried every minute.
    where: {
      sentAt: null,
      OR: [{ lastError: null }, { lastError: { not: NO_TEMPLATE } }],
    },
    _min: { createdAt: true },
  });
  if (groups.length === 0) return { members: 0 };

  const windows = new Map<string, number>();
  const due: string[] = [];
  for (const g of groups) {
    if (!windows.has(g.clinicId)) {
      windows.set(g.clinicId, (await getStaffAssistantConfig(g.clinicId)).batchMinutes);
    }
    const oldest = g._min.createdAt;
    if (oldest && now.getTime() - oldest.getTime() >= windows.get(g.clinicId)! * 60_000) {
      due.push(g.memberId);
    }
  }

  const batch = due.slice(0, SWEEP_BATCH);
  for (const memberId of batch) {
    await deliverToMember(memberId, { includeDetails: false, windowKnownOpen: false });
  }
  return { members: batch.length };
}
