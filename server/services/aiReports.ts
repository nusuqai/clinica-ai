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
//     cost (from the rates snapshotted by computeCost at charge time), the
//     resulting actual cost of one unit, and where that USD went by call kind.
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
  /** Units per AI employee — who answered most. Replies from before AI
   *  employees existed, or by a since-deleted one, are left out. */
  byAgent: LabelValue[];
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

  const [totals, sessionRows, byDayRows, byChannelRows, byAgentRows] = await Promise.all([
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
    prisma.$queryRaw<{ name: string; units: number }[]>`
      SELECT a."name" AS name, SUM(u."unitsCharged")::int AS units
      FROM "ai_usage_logs" u
      JOIN "ai_agents" a ON a."id" = u."aiAgentId"
      WHERE u."clinicId" = ${clinicId}::uuid
        AND u."createdAt" >= ${since}
        AND u."unitsCharged" > 0
      GROUP BY a."id", a."name"
      ORDER BY units DESC`,
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
    byAgent: byAgentRows.map((r) => ({ label: r.name, value: r.units })),
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
  /** Raw provider USD in the window — the true cost to serve. Platform-only
   *  telemetry, never charged to the clinic. */
  rawSpendWindow: number;
  /**
   * What one unit really cost to serve in the window: total raw USD (voice
   * included) ÷ units sold through. The number to price a unit against; null
   * when the clinic spent no units in the window.
   */
  rawCostPerUnit: number | null;
  /** Where this clinic's raw USD went in the window. */
  costBreakdown: AiCostBreakdown;
}

export interface PlatformAiOverview {
  windowDays: number;
  clinics: PlatformClinicCredit[];
  totalUnitBalance: number;
  totalUnitsUsedWindow: number;
  lowUnitsCount: number;
  totalRawSpendWindow: number;
  /** Platform-wide raw USD per unit served in the window; null if no units. */
  rawCostPerUnit: number | null;
  /** Where the platform's raw USD went in the window (all listed clinics). */
  costBreakdown: AiCostBreakdown;
}

// ─── Cost breakdown ───────────────────────────────────────────────────────────
//
// Platform-only: what share of the raw OpenAI USD each kind of AI call takes
// (reply / transcription / TTS / image extraction / any future kind), and —
// within replies — how much is context (input) vs. generation (output).
//
// By kind it is a plain GROUP BY kind over rawCost, so a new AiUsageKind shows
// up here on its own (labelled by its enum name until KIND_LABEL names it).
// The reply split is recomputed from each row's token counts and snapshotted
// rates — the same formula computeCost used — so it stays correct across
// pricing changes.

export interface CostSlice {
  key: string;
  label: string;
  usd: number;
  /** 0–1 share of the breakdown's total (for `reply` slices: of reply cost). */
  share: number;
  /** Number of calls behind the slice; omitted on the reply sub-split. */
  calls?: number;
}

export interface AiCostBreakdown {
  totalUsd: number;
  /** One slice per AiUsageKind present in the window, largest first. */
  byKind: CostSlice[];
  /** Reply cost split: context (uncached input), cached context, generation. */
  reply: CostSlice[];
  /** Total cost of REPLY rows — the base the `reply` shares are taken of. */
  replyUsd: number;
}

const KIND_LABEL: Partial<Record<AiUsageKind, string>> = {
  [AiUsageKind.REPLY]: "ردود المساعد",
  [AiUsageKind.TRANSCRIPTION]: "تفريغ الرسائل الصوتية",
  [AiUsageKind.TTS]: "الردود الصوتية",
  [AiUsageKind.EXTRACTION]: "قراءة الصور",
};

const REPLY_PART_LABEL = {
  context: "السياق (إدخال)",
  cachedContext: "السياق المخزّن مؤقتاً",
  generation: "التوليد (إخراج)",
} as const;

/** One (clinic, kind) aggregate. USD is cast to float8 here: display only. */
interface KindCostRow {
  clinicId: string;
  kind: AiUsageKind;
  calls: number;
  rawUsd: number;
  contextUsd: number;
  cachedContextUsd: number;
  generationUsd: number;
}

function buildCostBreakdown(rows: KindCostRow[]): AiCostBreakdown {
  const byKindMap = new Map<AiUsageKind, { usd: number; calls: number }>();
  const replyParts = { context: 0, cachedContext: 0, generation: 0 };
  let replyUsd = 0;

  for (const r of rows) {
    const k = byKindMap.get(r.kind) ?? { usd: 0, calls: 0 };
    k.usd += r.rawUsd;
    k.calls += r.calls;
    byKindMap.set(r.kind, k);

    if (r.kind === AiUsageKind.REPLY) {
      replyUsd += r.rawUsd;
      replyParts.context += r.contextUsd;
      replyParts.cachedContext += r.cachedContextUsd;
      replyParts.generation += r.generationUsd;
    }
  }

  const totalUsd = [...byKindMap.values()].reduce((s, k) => s + k.usd, 0);
  const byKind = [...byKindMap.entries()]
    .map(([kind, k]) => ({
      key: kind,
      label: KIND_LABEL[kind] ?? kind,
      usd: k.usd,
      share: totalUsd > 0 ? k.usd / totalUsd : 0,
      calls: k.calls,
    }))
    .sort((a, b) => b.usd - a.usd);

  // Shares of the recomputed parts, applied to the logged reply cost — so the
  // three parts always add up to exactly what the reply rows recorded.
  const partsTotal = replyParts.context + replyParts.cachedContext + replyParts.generation;
  const reply = (Object.keys(replyParts) as (keyof typeof replyParts)[]).map((key) => {
    const share = partsTotal > 0 ? replyParts[key] / partsTotal : 0;
    return { key, label: REPLY_PART_LABEL[key], usd: share * replyUsd, share };
  });

  return { totalUsd, byKind, reply, replyUsd };
}

export async function getPlatformAiOverview(windowDays = 30): Promise<PlatformAiOverview> {
  const since = new Date(Date.now() - windowDays * DAY_MS);

  const [clinics, spendRows, costRows] = await Promise.all([
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
      _sum: { rawCost: true, unitsCharged: true },
    }),
    // Cost by (clinic, kind), plus each kind's input / cached / output parts
    // recomputed from the snapshotted rates. promptTokens includes the cached
    // share, so it is subtracted for the uncached context part. Audio rows have
    // null token columns and come out as 0 for the parts (only REPLY uses them).
    prisma.$queryRaw<KindCostRow[]>`
      SELECT "clinicId",
             "kind",
             COUNT(*)::int AS calls,
             COALESCE(SUM("rawCost"), 0)::float8 AS "rawUsd",
             COALESCE(SUM((COALESCE("promptTokens", 0) - COALESCE("cachedInputTokens", 0))
                          * "inputRatePerM"), 0)::float8 / 1000000 AS "contextUsd",
             COALESCE(SUM(COALESCE("cachedInputTokens", 0)
                          * COALESCE("cachedInputRatePerM", 0)), 0)::float8 / 1000000 AS "cachedContextUsd",
             COALESCE(SUM(COALESCE("completionTokens", 0)
                          * "outputRatePerM"), 0)::float8 / 1000000 AS "generationUsd"
      FROM "ai_usage_logs"
      WHERE "createdAt" >= ${since}
      GROUP BY "clinicId", "kind"`,
  ]);

  const costRowsByClinic = new Map<string, KindCostRow[]>();
  for (const r of costRows) {
    const list = costRowsByClinic.get(r.clinicId) ?? [];
    list.push(r);
    costRowsByClinic.set(r.clinicId, list);
  }

  const usageByClinic = new Map(
    spendRows.map((r) => [
      r.clinicId,
      {
        raw: num(r._sum.rawCost),
        units: r._sum.unitsCharged ?? 0,
      },
    ])
  );

  let totalUnitBalance = 0;
  let totalUnitsUsedWindow = 0;
  let lowUnitsCount = 0;
  let totalRawSpendWindow = 0;

  const rows: PlatformClinicCredit[] = clinics.map((c) => {
    const unitBalance = c.aiCredit?.unitBalance ?? 0;
    const lowUnitsThreshold = c.aiCredit?.lowUnitsThreshold ?? 50;
    const usage = usageByClinic.get(c.id) ?? { raw: 0, units: 0 };
    const lowUnits = unitBalance <= lowUnitsThreshold;

    totalUnitBalance += unitBalance;
    totalUnitsUsedWindow += usage.units;
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
      rawSpendWindow: usage.raw,
      rawCostPerUnit: usage.units > 0 ? usage.raw / usage.units : null,
      costBreakdown: buildCostBreakdown(costRowsByClinic.get(c.id) ?? []),
    };
  });

  return {
    windowDays,
    clinics: rows,
    totalUnitBalance,
    totalUnitsUsedWindow,
    lowUnitsCount,
    totalRawSpendWindow,
    rawCostPerUnit: totalUnitsUsedWindow > 0 ? totalRawSpendWindow / totalUnitsUsedWindow : null,
    // Same clinics as the totals above (active ones), so the two agree.
    costBreakdown: buildCostBreakdown(clinics.flatMap((c) => costRowsByClinic.get(c.id) ?? [])),
  };
}
