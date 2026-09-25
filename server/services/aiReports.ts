import "server-only";
import { Channel, AiUsageKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicAiStatus } from "./aiCredit";

// Read-only usage reporting over ai_usage_logs, in two flavours:
//
//   - getClinicAiUsage  — UNITS. What a clinic admin sees: replies bought,
//     replies spent, and where they went. Deliberately free of any dollar
//     figure: a clinic's meter is units, and pricing is not its concern.
//   - getPlatformAiOverview — UNITS *and* DOLLARS. What a platform admin sees:
//     the same unit meter per clinic, next to the real USD each clinic's replies
//     cost (from the rates snapshotted by computeCost at charge time), and the
//     resulting actual cost of one unit.
//
// All monetary values are serialized to `number` at this boundary (display
// only) — the money-mutation path in aiCredit.ts stays on Prisma.Decimal
// end-to-end and never uses these. Units are integers and need no such care.

const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v: { toNumber(): number } | null | undefined) => (v ? v.toNumber() : 0);

export interface LabelValue {
  label: string;
  value: number;
}

/** A clinic's unit meter and how it was spent. No dollars, by design. */
export interface ClinicAiUsageReport {
  aiEnabled: boolean;
  /** Replies remaining. */
  unitBalance: number;
  lowUnitsThreshold: number;
  lowUnits: boolean;
  /** False when the clinic has run out of units entirely. */
  unitsSufficient: boolean;
  windowDays: number;
  /** Units spent in the window — one per agent reply. */
  unitsUsed: number;
  /** Conversations (sessions) those replies belonged to. */
  sessions: number;
  /** Units per conversation — how much of the meter an average chat costs. */
  unitsPerSession: number;
  avgUnitsPerDay: number;
  /**
   * Days of meter left at the window's average burn rate, or null when the
   * clinic has spent nothing yet (nothing to extrapolate from).
   */
  projectedDaysLeft: number | null;
  /** Busiest day in the window, or null when nothing was spent. */
  busiestDay: LabelValue | null;
  byDay: LabelValue[];
  /** WhatsApp vs. the website. */
  byChannel: LabelValue[];
}

const CHANNEL_LABEL: Record<Channel, string> = {
  [Channel.WHATSAPP]: "واتساب",
  [Channel.WEB]: "الموقع",
};

export async function getClinicAiUsage(
  clinicId: string,
  windowDays = 30
): Promise<ClinicAiUsageReport> {
  const since = new Date(Date.now() - windowDays * DAY_MS);
  const status = await getClinicAiStatus(clinicId);

  const [totals, sessionRows, byDayRows, byChannelRows] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: { clinicId, createdAt: { gte: since } },
      _sum: { unitsCharged: true },
    }),
    // Distinct sessions that actually spent units. Transcription/TTS rows carry
    // no units, so filtering on kind keeps a voice chat from counting twice.
    prisma.aiUsageLog.groupBy({
      by: ["sessionId"],
      where: {
        clinicId,
        createdAt: { gte: since },
        kind: AiUsageKind.REPLY,
        sessionId: { not: null },
      },
    }),
    prisma.$queryRaw<{ day: Date; units: number }[]>`
      SELECT date_trunc('day', "createdAt") AS day, SUM("unitsCharged")::int AS units
      FROM "ai_usage_logs"
      WHERE "clinicId" = ${clinicId}::uuid AND "createdAt" >= ${since}
      GROUP BY day
      HAVING SUM("unitsCharged") > 0
      ORDER BY day ASC`,
    // Channel lives on the conversation, two hops up. Rows with no session
    // (vanishingly rare) are left out rather than guessed at, so this is a
    // breakdown of attributable replies, not necessarily every unit.
    prisma.$queryRaw<{ channel: Channel; units: number }[]>`
      SELECT c."channel" AS channel, SUM(u."unitsCharged")::int AS units
      FROM "ai_usage_logs" u
      JOIN "chat_sessions" s ON s."id" = u."sessionId"
      JOIN "conversations" c ON c."id" = s."conversationId"
      WHERE u."clinicId" = ${clinicId}::uuid
        AND u."createdAt" >= ${since}
        AND u."unitsCharged" > 0
      GROUP BY c."channel"`,
  ]);

  const unitsUsed = totals._sum.unitsCharged ?? 0;
  const sessions = sessionRows.length;
  const avgUnitsPerDay = unitsUsed / windowDays;
  const byDay = byDayRows.map((r) => ({
    label: r.day.toISOString().slice(0, 10),
    value: r.units,
  }));

  return {
    aiEnabled: status.aiEnabled,
    unitBalance: status.unitBalance,
    lowUnitsThreshold: status.lowUnitsThreshold,
    lowUnits: status.lowUnits,
    unitsSufficient: status.sufficient,
    windowDays,
    unitsUsed,
    sessions,
    unitsPerSession: sessions > 0 ? unitsUsed / sessions : 0,
    avgUnitsPerDay,
    projectedDaysLeft: avgUnitsPerDay > 0 ? status.unitBalance / avgUnitsPerDay : null,
    busiestDay: byDay.reduce<LabelValue | null>(
      (best, d) => (best === null || d.value > best.value ? d : best),
      null
    ),
    byDay,
    byChannel: byChannelRows
      .map((r) => ({ label: CHANNEL_LABEL[r.channel] ?? r.channel, value: r.units }))
      .sort((a, b) => b.value - a.value),
  };
}

export interface PlatformClinicCredit {
  clinicId: string;
  name: string;
  slug: string;
  aiEnabled: boolean;
  /** Unit meter — what the clinic bought and what it has left. */
  unitBalance: number;
  lowUnitsThreshold: number;
  lowUnits: boolean;
  unitsUsedWindow: number;
  /** USD telemetry — platform-only, and never a balance anyone tops up. */
  markup: number;
  /** Marked-up USD accrued in the window (replies + voice). */
  spendWindow: number;
  /** Raw provider USD in the window, before markup — the true cost to serve. */
  rawSpendWindow: number;
  /**
   * What one unit really cost to serve in the window: total raw USD (voice
   * included) ÷ units sold through. The number to price a unit against; null
   * when the clinic spent no units in the window.
   */
  rawCostPerUnit: number | null;
}

export interface PlatformAiOverview {
  windowDays: number;
  clinics: PlatformClinicCredit[];
  totalUnitBalance: number;
  totalUnitsUsedWindow: number;
  lowUnitsCount: number;
  totalSpendWindow: number;
  totalRawSpendWindow: number;
  /** Platform-wide raw USD per unit served in the window; null if no units. */
  rawCostPerUnit: number | null;
}

export async function getPlatformAiOverview(windowDays = 30): Promise<PlatformAiOverview> {
  const since = new Date(Date.now() - windowDays * DAY_MS);

  const [clinics, spendRows] = await Promise.all([
    prisma.clinic.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        aiCredit: {
          select: {
            aiEnabled: true,
            unitBalance: true,
            lowUnitsThreshold: true,
            markup: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    // One pass for both meters: the USD a clinic's AI burned and the units it
    // sold through are summed from the same rows, so cost-per-unit is exact
    // rather than two reports divided by each other.
    prisma.aiUsageLog.groupBy({
      by: ["clinicId"],
      where: { createdAt: { gte: since } },
      _sum: { chargedCost: true, rawCost: true, unitsCharged: true },
    }),
  ]);

  const usageByClinic = new Map(
    spendRows.map((r) => [
      r.clinicId,
      {
        charged: num(r._sum.chargedCost),
        raw: num(r._sum.rawCost),
        units: r._sum.unitsCharged ?? 0,
      },
    ])
  );

  let totalUnitBalance = 0;
  let totalUnitsUsedWindow = 0;
  let lowUnitsCount = 0;
  let totalSpendWindow = 0;
  let totalRawSpendWindow = 0;

  const rows: PlatformClinicCredit[] = clinics.map((c) => {
    const unitBalance = c.aiCredit?.unitBalance ?? 0;
    const lowUnitsThreshold = c.aiCredit?.lowUnitsThreshold ?? 50;
    const usage = usageByClinic.get(c.id) ?? { charged: 0, raw: 0, units: 0 };
    const lowUnits = unitBalance <= lowUnitsThreshold;

    totalUnitBalance += unitBalance;
    totalUnitsUsedWindow += usage.units;
    totalSpendWindow += usage.charged;
    totalRawSpendWindow += usage.raw;
    if (lowUnits) lowUnitsCount += 1;

    return {
      clinicId: c.id,
      name: c.name,
      slug: c.slug,
      aiEnabled: c.aiCredit?.aiEnabled ?? true,
      unitBalance,
      lowUnitsThreshold,
      lowUnits,
      unitsUsedWindow: usage.units,
      markup: c.aiCredit?.markup ? c.aiCredit.markup.toNumber() : 1.5,
      spendWindow: usage.charged,
      rawSpendWindow: usage.raw,
      rawCostPerUnit: usage.units > 0 ? usage.raw / usage.units : null,
    };
  });

  return {
    windowDays,
    clinics: rows,
    totalUnitBalance,
    totalUnitsUsedWindow,
    lowUnitsCount,
    totalSpendWindow,
    totalRawSpendWindow,
    rawCostPerUnit: totalUnitsUsedWindow > 0 ? totalRawSpendWindow / totalUnitsUsedWindow : null,
  };
}
