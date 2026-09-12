import "server-only";
import { AppointmentStatus, Channel, SenderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { inngest, type AppointmentNotifyData } from "@/lib/inngest/client";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import { sendTemplateMessage, WhatsAppApiError, type WhatsAppRecipient } from "@/lib/meta/whatsapp";
import { effectiveEndUtc, effectiveStartUtc } from "@/lib/appointment-timing";
import { buildTemplateVariables, buildTokenContext } from "@/lib/appointment-templates";
import { fillTemplate } from "@/lib/meta/template-render";

/**
 * Appointment automation engine.
 *
 * - `appointmentsSweep` is ONE platform-wide cron. Each tick DISCOVERS due
 *   appointments across all clinics with cheap indexed queries and hands each
 *   off as an `appointment/notify` event — it never calls WhatsApp itself, so
 *   the tick stays fast and can't hit a function timeout.
 * - `appointmentNotify` does the actual send, throttled per clinic so one busy
 *   clinic can't starve another or exceed its Meta messaging tier.
 *
 * Timing is data-driven: the schedule is a dumb heartbeat and each row's own
 * time decides whether it is due (converted to a true instant via the clinic
 * timezone — stored times are wall-clock; see lib/appointment-timing.ts).
 */

// Mark a no-show only once its end has passed by this margin (late arrivals).
const NO_SHOW_GRACE_MS = 30 * 60 * 1000;
// Stored times are wall-clock, so a coarse SQL pre-filter (which treats them as
// UTC) must be widened by more than any real timezone offset before the precise
// per-clinic refinement in JS. 18h comfortably covers every IANA offset.
const COARSE_BUFFER_MS = 18 * 60 * 60 * 1000;
// Widest reminder lead we pre-filter for; the exact per-clinic lead is applied
// in the refinement pass. 48h leaves headroom above the 24h default.
const MAX_LEAD_MS = 48 * 60 * 60 * 1000;

const OPEN_STATUSES = [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED];

// ─── Pass 1: no-show sweep ──────────────────────────────────────────────────

/** Marks PENDING/CONFIRMED appointments whose end has passed as NO_SHOW. */
async function sweepNoShows(now: Date): Promise<number> {
  const coarseBefore = new Date(now.getTime() + COARSE_BUFFER_MS);
  const cutoff = now.getTime() - NO_SHOW_GRACE_MS;

  const candidates = await prisma.appointment.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      OR: [
        // Slot-based: has a slot whose (wall-clock) end is roughly past.
        { slotId: { not: null }, slot: { endTime: { lt: coarseBefore } } },
        // Order-based: booked on a day at/around today or earlier.
        { slotId: null, bookingDate: { lt: coarseBefore } },
      ],
    },
    select: {
      id: true,
      bookingDate: true,
      slot: { select: { startTime: true, endTime: true } },
      rule: { select: { startTime: true, endTime: true } },
      clinic: { select: { timezone: true } },
    },
  });

  const dueIds = candidates
    .filter((a) => {
      const end = effectiveEndUtc(a, a.clinic.timezone);
      return end != null && end.getTime() < cutoff;
    })
    .map((a) => a.id);

  if (dueIds.length === 0) return 0;

  const res = await prisma.appointment.updateMany({
    where: { id: { in: dueIds }, status: { in: OPEN_STATUSES } },
    data: { status: AppointmentStatus.NO_SHOW },
  });
  return res.count;
}

// ─── Pass 2: confirmation reminders ─────────────────────────────────────────

interface DueRow {
  id: string;
  clinicId: string;
}

/**
 * PENDING appointments within their clinic's reminder lead window that have not
 * been reminded yet. Gated on an enabled CONFIRM_REMINDER binding via a relation
 * filter, so clinics without a linked template are never selected.
 */
async function findDueReminders(now: Date): Promise<DueRow[]> {
  const coarseFrom = new Date(now.getTime() - COARSE_BUFFER_MS);
  const coarseTo = new Date(now.getTime() + MAX_LEAD_MS + COARSE_BUFFER_MS);

  const candidates = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.PENDING,
      reminderSentAt: null,
      clinic: {
        appointmentTemplates: {
          some: { purpose: "CONFIRM_REMINDER", enabled: true },
        },
      },
      OR: [
        { slotId: { not: null }, slot: { startTime: { gte: coarseFrom, lte: coarseTo } } },
        { slotId: null, bookingDate: { gte: coarseFrom, lte: coarseTo } },
      ],
    },
    select: {
      id: true,
      clinicId: true,
      bookingDate: true,
      slot: { select: { startTime: true, endTime: true } },
      rule: { select: { startTime: true, endTime: true } },
      clinic: {
        select: {
          timezone: true,
          appointmentTemplates: {
            where: { purpose: "CONFIRM_REMINDER", enabled: true },
            select: { leadMinutes: true },
          },
        },
      },
    },
  });

  return candidates
    .filter((a) => {
      const binding = a.clinic.appointmentTemplates[0];
      if (!binding) return false;
      const start = effectiveStartUtc(a, a.clinic.timezone);
      if (!start) return false;
      const leadStart = start.getTime() - binding.leadMinutes * 60_000;
      return leadStart <= now.getTime() && now.getTime() < start.getTime();
    })
    .map((a) => ({ id: a.id, clinicId: a.clinicId }));
}

// ─── Pass 3: feedback requests ──────────────────────────────────────────────

/**
 * COMPLETED appointments whose completion is older than their clinic's feedback
 * delay and that have not been asked yet. `completedAt` is a true instant, so no
 * timezone conversion is needed here — only the per-clinic delay is applied.
 */
async function findDueFeedback(now: Date): Promise<DueRow[]> {
  const candidates = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.COMPLETED,
      feedbackRequestedAt: null,
      completedAt: { not: null, lte: now },
      clinic: {
        appointmentTemplates: {
          some: { purpose: "FEEDBACK_REQUEST", enabled: true },
        },
      },
    },
    select: {
      id: true,
      clinicId: true,
      completedAt: true,
      clinic: {
        select: {
          appointmentTemplates: {
            where: { purpose: "FEEDBACK_REQUEST", enabled: true },
            select: { delayMinutes: true },
          },
        },
      },
    },
  });

  return candidates
    .filter((a) => {
      const binding = a.clinic.appointmentTemplates[0];
      if (!binding || !a.completedAt) return false;
      return a.completedAt.getTime() <= now.getTime() - binding.delayMinutes * 60_000;
    })
    .map((a) => ({ id: a.id, clinicId: a.clinicId }));
}

// ─── The cron ───────────────────────────────────────────────────────────────

export const appointmentsSweep = inngest.createFunction(
  {
    id: "appointments-sweep",
    // Hourly while pre-launch to conserve free-tier executions; tighten to
    // "*/15 * * * *" once there is real traffic on a paid tier.
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step }) => {
    const now = new Date(await step.run("stamp-now", async () => new Date().toISOString()));

    const noShows = await step.run("sweep-no-shows", () => sweepNoShows(now));

    const reminders = await step.run("find-due-reminders", () => findDueReminders(now));
    if (reminders.length > 0) {
      await step.sendEvent(
        "queue-reminders",
        reminders.map((r) => ({
          name: "appointment/notify" as const,
          data: { appointmentId: r.id, clinicId: r.clinicId, purpose: "CONFIRM_REMINDER" as const },
          // Dedupe repeat emits within a sweep-retry; the DB flag guards ticks.
          id: `remind-${r.id}`,
        }))
      );
    }

    const feedback = await step.run("find-due-feedback", () => findDueFeedback(now));
    if (feedback.length > 0) {
      await step.sendEvent(
        "queue-feedback",
        feedback.map((r) => ({
          name: "appointment/notify" as const,
          data: { appointmentId: r.id, clinicId: r.clinicId, purpose: "FEEDBACK_REQUEST" as const },
          id: `feedback-${r.id}`,
        }))
      );
    }

    return { noShows, reminders: reminders.length, feedback: feedback.length };
  }
);

// ─── The throttled sender ───────────────────────────────────────────────────

/** Builds a WhatsApp recipient from a conversation row (phone or BSUID). */
function conversationRecipient(conv: {
  whatsappPhone: string | null;
  whatsappUserId: string | null;
}): WhatsAppRecipient | null {
  if (!conv.whatsappPhone && !conv.whatsappUserId) return null;
  return { phone: conv.whatsappPhone, userId: conv.whatsappUserId };
}

/**
 * Finds (or creates) the patient's WhatsApp conversation in a clinic so the
 * automation message threads with their history and their reply lands in a
 * conversation the agent already has context for. Returns null if there is no
 * way to reach them on WhatsApp (no existing thread and no phone on file).
 */
async function getWhatsappThread(clinicId: string, patient: { id: string; phone: string | null }) {
  const existing = await prisma.conversation.findFirst({
    where: { clinicId, userId: patient.id, channel: Channel.WHATSAPP },
    select: { id: true, whatsappPhone: true, whatsappUserId: true },
  });
  if (existing) return existing;

  const phone = patient.phone?.replace(/\D/g, "") || null;
  if (!phone) return null;

  const byPhone = await prisma.conversation.findUnique({
    where: { clinicId_whatsappPhone: { clinicId, whatsappPhone: phone } },
    select: { id: true, whatsappPhone: true, whatsappUserId: true, userId: true },
  });
  if (byPhone) {
    if (!byPhone.userId) {
      await prisma.conversation.update({
        where: { id: byPhone.id },
        data: { userId: patient.id },
      });
    }
    return byPhone;
  }

  return prisma.conversation.create({
    data: { clinicId, userId: patient.id, whatsappPhone: phone, channel: Channel.WHATSAPP },
    select: { id: true, whatsappPhone: true, whatsappUserId: true },
  });
}

// Fallback labels for the inbox thread when a binding has no snapshotted text
// (legacy rows saved before bodyText was captured).
const PURPOSE_LABEL = {
  CONFIRM_REMINDER: "تذكير بالموعد — برجاء تأكيد الحجز",
  FEEDBACK_REQUEST: "طلب تقييم بعد الزيارة",
} as const;

/**
 * Renders the exact message text from the binding's snapshotted template
 * (header / body / footer), filling the body's {{n}} placeholders with the
 * resolved variables — so the admin inbox shows what the patient received,
 * with no Graph API call. Header/footer are static (Meta keeps them variable-
 * free in our create flow), so only the body is filled.
 */
function renderBindingText(
  binding: { bodyText: string; headerText: string; footerText: string },
  variables: string[],
  fallback: string
): string {
  if (!binding.bodyText.trim()) return fallback;
  const parts = [
    binding.headerText.trim(),
    fillTemplate(binding.bodyText, variables).trim(),
    binding.footerText.trim(),
  ].filter(Boolean);
  return parts.join("\n\n");
}

export const appointmentNotify = inngest.createFunction(
  {
    id: "appointment-notify",
    triggers: [{ event: "appointment/notify" }],
    // Per-clinic isolation: one clinic's backlog can't starve another, and each
    // stays within its own WhatsApp throughput.
    concurrency: { key: "event.data.clinicId", limit: 5 },
    throttle: { key: "event.data.clinicId", limit: 20, period: "60s" },
    retries: 4,
  },
  async ({ event, step }) => {
    const { appointmentId, clinicId, purpose } = event.data as AppointmentNotifyData;

    const result = await step.run("send", async () => {
      const appt = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          id: true,
          status: true,
          orderNumber: true,
          bookingDate: true,
          reminderSentAt: true,
          feedbackRequestedAt: true,
          patient: { select: { id: true, fullName: true, phone: true } },
          doctor: {
            select: {
              fullName: true,
              title: true,
              specialty: { select: { name: true } },
            },
          },
          branch: { select: { name: true, address: true } },
          slot: { select: { startTime: true, date: true } },
          clinic: { select: { id: true, name: true } },
        },
      });
      if (!appt) return "gone";

      // Re-check state at send time — it may have changed since discovery.
      if (purpose === "CONFIRM_REMINDER") {
        if (appt.status !== AppointmentStatus.PENDING || appt.reminderSentAt) return "stale";
      } else {
        if (appt.status !== AppointmentStatus.COMPLETED || appt.feedbackRequestedAt) return "stale";
      }

      // The binding is the gate: no enabled binding → don't send, and DON'T set
      // the dedupe flag, so it fires later if the clinic links a template.
      const binding = await prisma.clinicAppointmentTemplate.findUnique({
        where: { clinicId_purpose: { clinicId, purpose } },
      });
      if (!binding || !binding.enabled) return "no_binding";

      const creds = await getClinicWhatsappCredentials(clinicId);
      if (!creds) return "no_creds";

      const thread = await getWhatsappThread(clinicId, appt.patient);
      const recipient = thread ? conversationRecipient(thread) : null;
      if (!recipient) return "no_recipient";

      const context = buildTokenContext(appt);
      const variables = buildTemplateVariables(binding.variableMap, context);

      try {
        await sendTemplateMessage(
          recipient,
          { name: binding.templateName, languageCode: binding.languageCode, variables },
          { phoneNumberId: creds.phoneNumberId, accessToken: creds.accessToken }
        );
      } catch (err) {
        // A permanent Meta rejection (unknown template, bad number) will never
        // succeed on retry — mark it handled so we stop re-queuing it, and log.
        if (err instanceof WhatsAppApiError && !err.isOutsideServiceWindow) {
          await markHandled(appointmentId, purpose);
          console.error(`appointment/notify permanent failure (${appointmentId}):`, err.message);
          return "send_failed_permanent";
        }
        throw err; // transient → let Inngest retry with backoff
      }

      await markHandled(appointmentId, purpose);

      // Thread the outbound so the patient's reply has context (best-effort).
      if (thread) {
        await prisma.message.create({
          data: {
            clinicId,
            conversationId: thread.id,
            senderType: SenderType.AGENT,
            content: renderBindingText(binding, variables, PURPOSE_LABEL[purpose]),
            metadata: {
              automation: purpose,
              appointmentId,
              template: binding.templateName,
              language: binding.languageCode,
              variables,
            },
            isRead: true,
          },
        });
        await prisma.conversation.update({
          where: { id: thread.id },
          data: { updatedAt: new Date() },
        });
      }

      return "sent";
    });

    return { appointmentId, purpose, result };
  }
);

/** Stamps the purpose-specific dedupe flag so the message is never re-sent. */
async function markHandled(
  appointmentId: string,
  purpose: "CONFIRM_REMINDER" | "FEEDBACK_REQUEST"
): Promise<void> {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data:
      purpose === "CONFIRM_REMINDER"
        ? { reminderSentAt: new Date() }
        : { feedbackRequestedAt: new Date() },
  });
}
