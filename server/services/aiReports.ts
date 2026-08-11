import "server-only";
import { prisma } from "@/lib/prisma";
import { getClinicAiStatus } from "./aiCredit";

// Read-only cost/usage reporting over ai_usage_logs. All monetary values are
// serialized to `number` at this boundary (display only) — the money-mutation
// path in aiCredit.ts stays on Prisma.Decimal end-to-end and never uses these.

const DAY_MS = 24 * 60 * 60 * 1000;
const num = (v: { toNumber(): number } | null | undefined) =>
  v ? v.toNumber() : 0;

export interface LabelValue {
  label: string;
  value: number;
}

export interface ClinicAiUsageReport {
  aiEnabled: boolean;
  balance: number;
  markup: number;
  lowBalanceThreshold: number;
  lowBalance: boolean;
  windowDays: number;
  totalCharged: number;
  totalRaw: number;
  totalTokens: number;
  turns: number;
  avgCostPerTurn: number;
  byModel: LabelValue[];
  byDay: LabelValue[];
}

export async function getClinicAiUsage(
  clinicId: string,
  windowDays = 30,
): Promise<ClinicAiUsageReport> {
  const since = new Date(Date.now() - windowDays * DAY_MS);
  const status = await getClinicAiStatus(clinicId);

  const [totals, byModelRows, byDayRows] = await Promise.all([
    prisma.aiUsageLog.aggregate({
      where: { clinicId, createdAt: { gte: since } },
      _sum: { chargedCost: true, rawCost: true, totalTokens: true },
      _count: true,
    }),
    prisma.aiUsageLog.groupBy({
      by: ["model"],
      where: { clinicId, createdAt: { gte: since } },
      _sum: { chargedCost: true },
    }),
    prisma.$queryRaw<{ day: Date; charged: { toNumber(): number } }[]>`
      SELECT date_trunc('day', "createdAt") AS day, SUM("chargedCost") AS charged
      FROM "ai_usage_logs"
      WHERE "clinicId" = ${clinicId}::uuid AND "createdAt" >= ${since}
      GROUP BY day
      ORDER BY day ASC`,
  ]);

  const turns = totals._count;
  const totalCharged = num(totals._sum.chargedCost);

  return {
    aiEnabled: status.aiEnabled,
    balance: status.balance.toNumber(),
    markup: status.markup.toNumber(),
    lowBalanceThreshold: status.lowBalanceThreshold.toNumber(),
    lowBalance: status.lowBalance,
    windowDays,
    totalCharged,
    totalRaw: num(totals._sum.rawCost),
    totalTokens: totals._sum.totalTokens ?? 0,
    turns,
    avgCostPerTurn: turns > 0 ? totalCharged / turns : 0,
    byModel: byModelRows
      .map((r) => ({ label: r.model, value: num(r._sum.chargedCost) }))
      .sort((a, b) => b.value - a.value),
    byDay: byDayRows.map((r) => ({
      label: r.day.toISOString().slice(0, 10),
      value: num(r.charged),
    })),
  };
}

export interface PlatformClinicCredit {
  clinicId: string;
  name: string;
  slug: string;
  aiEnabled: boolean;
  balance: number;
  markup: number;
  lowBalanceThreshold: number;
  lowBalance: boolean;
  spendWindow: number;
}

export interface PlatformAiOverview {
  windowDays: number;
  clinics: PlatformClinicCredit[];
  totalBalance: number;
  totalSpendWindow: number;
  lowBalanceCount: number;
}

export async function getPlatformAiOverview(
  windowDays = 30,
): Promise<PlatformAiOverview> {
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
            balance: true,
            markup: true,
            lowBalanceThreshold: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.aiUsageLog.groupBy({
      by: ["clinicId"],
      where: { createdAt: { gte: since } },
      _sum: { chargedCost: true },
    }),
  ]);

  const spendByClinic = new Map(
    spendRows.map((r) => [r.clinicId, num(r._sum.chargedCost)]),
  );

  let totalBalance = 0;
  let totalSpendWindow = 0;
  let lowBalanceCount = 0;

  const rows: PlatformClinicCredit[] = clinics.map((c) => {
    const balance = num(c.aiCredit?.balance);
    const threshold = c.aiCredit?.lowBalanceThreshold
      ? c.aiCredit.lowBalanceThreshold.toNumber()
      : 5;
    const spend = spendByClinic.get(c.id) ?? 0;
    const lowBalance = balance <= threshold;
    totalBalance += balance;
    totalSpendWindow += spend;
    if (lowBalance) lowBalanceCount += 1;
    return {
      clinicId: c.id,
      name: c.name,
      slug: c.slug,
      aiEnabled: c.aiCredit?.aiEnabled ?? true,
      balance,
      markup: c.aiCredit?.markup ? c.aiCredit.markup.toNumber() : 1.5,
      lowBalanceThreshold: threshold,
      lowBalance,
      spendWindow: spend,
    };
  });

  return {
    windowDays,
    clinics: rows,
    totalBalance,
    totalSpendWindow,
    lowBalanceCount,
  };
}
