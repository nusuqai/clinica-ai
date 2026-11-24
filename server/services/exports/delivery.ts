import "server-only";
import { Prisma, Role, StaffEvent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendTemplateMessage } from "@/lib/meta/whatsapp";
import { hasServiceWindow, sendWhatsAppMedia } from "@/lib/whatsapp/transport";
import type { StaffAlertToken } from "@/lib/staff/events";
import {
  addDays,
  exportFileName,
  exportFiltersSchema,
  localDay,
  type ExportFilters,
} from "@/lib/exports/filters";
import type { StaffActor } from "@/agent/types";
import {
  actorCan,
  getStaffAssistantConfig,
  loadStaffMemberById,
} from "@/server/services/staff/access";
import {
  loadTarget,
  recordInThread,
  staffThreadId,
  targetTransport,
  templateParam,
  windowOpen,
} from "@/server/services/staff/notifications";
import { collectExport, type ExportAccess, type ExportData } from "./data";
import { XLSX_MIME, periodLabel, renderWorkbook, summaryLines } from "./workbook";

/**
 * Patient-data export: building the file, and sending it to team members over
 * WhatsApp (docs/data-export.md) — on request through the team assistant, and
 * as the clinic's scheduled report.
 *
 * Every send is a `DataReportDelivery` row. The file is never stored: it is
 * rebuilt from the row's filters when it actually goes out. On an official
 * number whose 24h window is closed, the member first gets the clinic's alert
 * template ("your report is ready") and the file follows when they write in
 * (`flushMemberReportsOnInbound`) — same rule as team alerts.
 */

const MAX_ATTEMPTS = 5;
/** Deliveries older than this are not sent any more. */
const MAX_AGE_MS = 3 * 24 * 60 * 60_000;
/** Files built per sweep (each is a few queries + an xlsx render). */
const SWEEP_BATCH = 20;
/** Waiting for the member to write in (official number, no template bound). */
const NO_TEMPLATE = "window_closed_no_template";

// ─── Building ───────────────────────────────────────────────────────────────

/** What an actor may see in an export: their branches, medical only with permission. */
export function accessFor(actor: Pick<StaffActor, "branchIds" | "permissions">): ExportAccess {
  return { branchIds: actor.branchIds, medical: actor.permissions.includes("medical_records") };
}

export async function buildExportFile(
  clinicId: string,
  filters: ExportFilters,
  access: ExportAccess
): Promise<{ data: ExportData; bytes: Buffer; fileName: string }> {
  const data = await collectExport(clinicId, filters, access);
  const bytes = await renderWorkbook(data);
  return { data, bytes, fileName: exportFileName(filters) };
}

/** The WhatsApp caption / assistant summary of an export. */
export function exportCaption(data: ExportData, heading = "تقرير بيانات المرضى"): string {
  const lines = summaryLines(data)
    .filter(([, v]) => v !== 0)
    .map(([label, v]) => `• ${label}: ${typeof v === "number" ? v.toLocaleString("en-US") : v}`);
  return [
    `📊 *${heading} — ${data.clinicName}*`,
    `الفترة: ${periodLabel(data)}`,
    ...(data.filterLabels.length ? [data.filterLabels.join("، ")] : []),
    "",
    ...(lines.length ? lines : ["لا توجد حركة على المرضى في هذه الفترة."]),
  ].join("\n");
}

// ─── Delivery ───────────────────────────────────────────────────────────────

type DeliveryOutcome =
  | { status: "sent"; caption: string }
  | { status: "announced" | "waiting" }
  | { status: "failed"; error: string };

async function fail(id: string, error: string, giveUp: boolean): Promise<DeliveryOutcome> {
  await prisma.dataReportDelivery.update({
    where: { id },
    data: {
      attempts: giveUp ? MAX_ATTEMPTS : { increment: 1 },
      lastError: error.slice(0, 500),
      // Release a claim taken in `deliver` so the sweep can retry.
      sentAt: null,
    },
  });
  return { status: "failed", error };
}

/**
 * Sends one queued file. `windowKnownOpen` = the member just wrote in, so the
 * file can go out as a document on any number.
 */
async function deliver(deliveryId: string, windowKnownOpen: boolean): Promise<DeliveryOutcome> {
  const d = await prisma.dataReportDelivery.findUnique({ where: { id: deliveryId } });
  if (!d || d.sentAt) return { status: "waiting" };

  // Re-check on every send: permissions or the link may have changed since.
  const member = await loadStaffMemberById(d.memberId);
  if (!member || member.actor.role === Role.DOCTOR || !actorCan(member.actor, "reports")) {
    return fail(d.id, "not_allowed", true);
  }
  const target = await loadTarget(d.memberId);
  if (!target) return fail(d.id, "member_not_linked", true);
  const transport = await targetTransport(target);
  if (!transport) return fail(d.id, "no_whatsapp_number", d.attempts + 1 >= MAX_ATTEMPTS);

  const parsed = exportFiltersSchema.safeParse(d.filters);
  if (!parsed.success) return fail(d.id, "bad_filters", true);
  const filters = parsed.data;

  const threadId = await staffThreadId(target.clinicId, target.userId);
  const canSend =
    windowKnownOpen || !hasServiceWindow(transport.provider) || (await windowOpen(threadId));

  try {
    if (canSend) {
      // Claim it: the minute sweep and an inbound flush may race for one row.
      const claim = await prisma.dataReportDelivery.updateMany({
        where: { id: d.id, sentAt: null },
        data: { sentAt: new Date() },
      });
      if (claim.count === 0) return { status: "waiting" };
      const { data, bytes, fileName } = await buildExportFile(
        target.clinicId,
        filters,
        accessFor(member.actor)
      );
      const caption = exportCaption(
        data,
        d.dedupeKey.startsWith("daily:") ? "التقرير اليومي" : undefined
      );
      const providerId = await sendWhatsAppMedia(transport, target.contact, {
        kind: "document",
        bytes,
        mimeType: XLSX_MIME,
        filename: fileName,
        caption,
      });
      await prisma.dataReportDelivery.update({
        where: { id: d.id },
        data: { sentAt: new Date(), lastError: null, attempts: { increment: 1 } },
      });
      await recordInThread(
        target.clinicId,
        threadId,
        `${caption}\n\n📎 ${fileName}`,
        transport.configId,
        providerId
      );
      return { status: "sent", caption };
    }

    // Official number, closed window: announce once by the alert template.
    if (d.announcedAt) return { status: "announced" };
    if (transport.provider !== "META_CLOUD") return { status: "waiting" };
    const config = await getStaffAssistantConfig(target.clinicId);
    if (!config.alertTemplateName || !config.alertTemplateLanguage) {
      await prisma.dataReportDelivery.update({
        where: { id: d.id },
        data: { lastError: NO_TEMPLATE },
      });
      return { status: "waiting" };
    }
    const values: Record<StaffAlertToken, string> = {
      alert_count: "1",
      alert_summary: `تقرير بيانات المرضى (${periodLabel({ filters })}) جاهز`,
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
    await prisma.dataReportDelivery.update({
      where: { id: d.id },
      data: { announcedAt: new Date(), lastError: null },
    });
    await recordInThread(
      target.clinicId,
      threadId,
      config.alertBodyText
        ? config.alertBodyText.replace(/\{\{(\d+)\}\}/g, (_, n) => variables[Number(n) - 1] ?? "")
        : values.alert_summary,
      transport.configId,
      providerId
    );
    return { status: "announced" };
  } catch (err) {
    console.error(`[data-report] delivery ${d.id} failed:`, err);
    return fail(
      d.id,
      err instanceof Error ? err.message : String(err),
      d.attempts + 1 >= MAX_ATTEMPTS
    );
  }
}

/**
 * The team assistant was asked for an export over WhatsApp: the member just
 * wrote in, so the file goes out right away.
 */
export async function sendExportToMemberNow(
  clinicId: string,
  memberId: string,
  filters: ExportFilters
): Promise<DeliveryOutcome> {
  const row = await prisma.dataReportDelivery.create({
    data: {
      clinicId,
      memberId,
      filters: filters as unknown as Prisma.InputJsonValue,
      dedupeKey: `ask:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    },
    select: { id: true },
  });
  return deliver(row.id, true);
}

/** The member wrote in: send every file still waiting for them. Never throws. */
export async function flushMemberReportsOnInbound(memberId: string): Promise<void> {
  try {
    const pending = await prisma.dataReportDelivery.findMany({
      where: {
        memberId,
        sentAt: null,
        attempts: { lt: MAX_ATTEMPTS },
        createdAt: { gte: new Date(Date.now() - MAX_AGE_MS) },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      take: 5,
    });
    for (const p of pending) await deliver(p.id, true);
  } catch (err) {
    console.error("[data-report] inbound flush failed", err);
  }
}

// ─── Scheduled report ───────────────────────────────────────────────────────

/** Minutes after midnight on the clinic's clock. */
function localMinute(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return g("hour") * 60 + g("minute");
}

/** Queues today's report for every clinic whose send time has come. */
async function queueDueReports(now: Date): Promise<number> {
  const settings = await prisma.dataReportSettings.findMany({
    where: { enabled: true },
    select: {
      clinicId: true,
      sendMinute: true,
      coverage: true,
      lastRunOn: true,
      clinic: { select: { timezone: true } },
    },
  });
  let queued = 0;
  for (const s of settings) {
    const tz = s.clinic.timezone || "Africa/Cairo";
    const today = localDay(now, tz);
    if (s.lastRunOn && s.lastRunOn.toISOString().slice(0, 10) >= today) continue;
    if (localMinute(now, tz) < s.sendMinute) continue;

    // Claim the day first so a concurrent sweep can't queue it twice.
    const todayDate = new Date(`${today}T00:00:00Z`);
    const claimed = await prisma.dataReportSettings.updateMany({
      where: {
        clinicId: s.clinicId,
        OR: [{ lastRunOn: null }, { lastRunOn: { lt: todayDate } }],
      },
      data: { lastRunOn: todayDate },
    });
    if (claimed.count === 0) continue;

    const day = s.coverage === "YESTERDAY" ? addDays(today, -1) : today;
    const filters: ExportFilters = {
      from: day,
      to: day,
      branchId: null,
      doctorId: null,
      specialtyId: null,
      serviceId: null,
      patientId: null,
      status: null,
    };
    const recipients = await prisma.clinicMember.findMany({
      where: {
        clinicId: s.clinicId,
        role: { in: [Role.ADMIN, Role.STAFF] },
        whatsappLink: { verifiedAt: { not: null } },
        eventSubscriptions: { some: { event: StaffEvent.DAILY_REPORT } },
      },
      select: { id: true },
    });
    if (recipients.length === 0) continue;
    const res = await prisma.dataReportDelivery.createMany({
      data: recipients.map((m) => ({
        clinicId: s.clinicId,
        memberId: m.id,
        filters: filters as unknown as Prisma.InputJsonValue,
        dedupeKey: `daily:${day}`,
      })),
      skipDuplicates: true,
    });
    queued += res.count;
  }
  return queued;
}

/**
 * Runs from the minute team-alert sweep (/api/cron/staff-alerts): queues due
 * scheduled reports, then sends waiting files (not ones already announced by
 * template, nor ones parked until the member writes in).
 */
export async function runDataReportSweep(
  now = new Date()
): Promise<{ queued: number; delivered: number }> {
  const queued = await queueDueReports(now);
  const due = await prisma.dataReportDelivery.findMany({
    where: {
      sentAt: null,
      announcedAt: null,
      attempts: { lt: MAX_ATTEMPTS },
      createdAt: { gte: new Date(now.getTime() - MAX_AGE_MS) },
      OR: [{ lastError: null }, { lastError: { not: NO_TEMPLATE } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
    take: SWEEP_BATCH,
  });
  for (const d of due) await deliver(d.id, false);
  return { queued, delivered: due.length };
}
