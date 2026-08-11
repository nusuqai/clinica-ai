import "server-only";
import { Prisma, AiLedgerType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { TokenUsage } from "@/agent/types";

/**
 * Per-clinic AI credit metering — the money path.
 *
 * MONEY SAFETY (read before editing):
 *   - Every amount here is a Prisma.Decimal (decimal.js). JS floats never touch a
 *     rate, cost, markup or balance. `Number()` is only ever applied at the UI
 *     serialization boundary, never in this file.
 *   - The AiCreditLedger is the source of truth; `ClinicAiCredit.balance` is a
 *     denormalized cache. Every balance change happens inside one transaction
 *     that locks the credit row (SELECT … FOR UPDATE), mutates the balance, and
 *     appends a ledger row — so SUM(ledger.amount) always equals balance.
 *   - Charging is idempotent via AiUsageLog.messageId @unique: a webhook
 *     redelivery that re-charges the same reply rolls the whole txn back.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const TOKENS_PER_MILLION = D(1_000_000);
const DEFAULT_MARKUP = D("1.5");

/** OpenAI list prices in USD per 1,000,000 tokens (as of 2026). Snapshotted onto
 *  each usage log so historical cost stays correct when these change. */
const PRICING: Record<string, { inputPerM: Prisma.Decimal; outputPerM: Prisma.Decimal }> = {
  "gpt-4o": { inputPerM: D("2.5"), outputPerM: D("10") },
  "gpt-4o-mini": { inputPerM: D("0.15"), outputPerM: D("0.6") },
  "gpt-4.1": { inputPerM: D("2"), outputPerM: D("8") },
  "gpt-4.1-mini": { inputPerM: D("0.4"), outputPerM: D("1.6") },
  "gpt-4.1-nano": { inputPerM: D("0.1"), outputPerM: D("0.4") },
};

/** Used when a model isn't in the table — never bill an unknown model as free. */
const FALLBACK_RATE = { inputPerM: D("2.5"), outputPerM: D("10") };

function rateFor(model: string): { inputPerM: Prisma.Decimal; outputPerM: Prisma.Decimal } {
  // Provider may report a dated variant (e.g. "gpt-4o-2024-08-06"); match on prefix.
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING).find((k) => model.startsWith(k));
  return key ? PRICING[key] : FALLBACK_RATE;
}

export interface CostBreakdown {
  rawCost: Prisma.Decimal;
  chargedCost: Prisma.Decimal;
  inputRatePerM: Prisma.Decimal;
  outputRatePerM: Prisma.Decimal;
}

/** Raw OpenAI cost + marked-up charged cost for a turn. Decimal only. */
export function computeCost(usage: TokenUsage, markup: Prisma.Decimal): CostBreakdown {
  const rate = rateFor(usage.model);
  const rawCost = rate.inputPerM
    .mul(usage.promptTokens)
    .div(TOKENS_PER_MILLION)
    .plus(rate.outputPerM.mul(usage.completionTokens).div(TOKENS_PER_MILLION));
  const chargedCost = rawCost.mul(markup);
  return {
    rawCost,
    chargedCost,
    inputRatePerM: rate.inputPerM,
    outputRatePerM: rate.outputPerM,
  };
}

/** Creates the credit satellite for a clinic if it doesn't exist yet. */
export async function ensureClinicAiCredit(clinicId: string): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: {},
    create: { clinicId },
  });
}

export interface ClinicAiStatus {
  aiEnabled: boolean;
  balance: Prisma.Decimal;
  markup: Prisma.Decimal;
  lowBalanceThreshold: Prisma.Decimal;
  /** Hard gate: agent replies only when true (balance strictly positive). */
  sufficient: boolean;
  /** Soft warning for the UI only — does not block replies. */
  lowBalance: boolean;
}

/**
 * Reads the clinic's AI gate + balance, creating the satellite lazily so a
 * clinic that predates the migration (or slipped past the backfill) is never a
 * missing-row error. Used by the runner gate and the settings page.
 */
export async function getClinicAiStatus(clinicId: string): Promise<ClinicAiStatus> {
  const row = await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: {},
    create: { clinicId },
    select: {
      aiEnabled: true,
      balance: true,
      markup: true,
      lowBalanceThreshold: true,
    },
  });
  return {
    aiEnabled: row.aiEnabled,
    balance: row.balance,
    markup: row.markup,
    lowBalanceThreshold: row.lowBalanceThreshold,
    sufficient: row.balance.gt(0),
    lowBalance: row.balance.lte(row.lowBalanceThreshold),
  };
}

/**
 * Deducts the cost of one agent reply from the clinic balance, atomically.
 *
 * The credit row is locked FOR UPDATE first so concurrent turns for the same
 * clinic serialize and `balanceAfter` is always exact. The markup is read under
 * that lock so a mid-turn markup edit can't split the cost. The balance may dip
 * slightly negative on the turn that spent the last of the credit — that's
 * accepted; the next turn is blocked by the `sufficient` gate.
 *
 * Idempotent: a duplicate `messageId` violates the unique index and rolls the
 * whole txn back. Callers should swallow that specific error (already charged).
 */
export async function chargeUsage(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  usage: TokenUsage;
}): Promise<void> {
  const { clinicId, sessionId, messageId, usage } = args;

  await prisma.$transaction(async (tx) => {
    // (1) Lock the credit row and read the CURRENT markup under the lock.
    const locked = await tx.$queryRaw<{ markup: Prisma.Decimal }[]>`
      SELECT "markup" FROM "clinic_ai_credits"
      WHERE "clinicId" = ${clinicId}::uuid
      FOR UPDATE`;
    const markup = locked[0]?.markup ?? DEFAULT_MARKUP;

    // (2) Compute cost (Decimal only).
    const { rawCost, chargedCost, inputRatePerM, outputRatePerM } = computeCost(
      usage,
      markup,
    );

    // (3) Atomic decrement; the returned balance is the post-decrement value.
    const credit = await tx.clinicAiCredit.update({
      where: { clinicId },
      data: { balance: { decrement: chargedCost } },
      select: { balance: true },
    });

    // (4) Append the usage log — messageId @unique makes this idempotent.
    const usageRow = await tx.aiUsageLog.create({
      data: {
        clinicId,
        sessionId,
        messageId,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        inputRatePerM,
        outputRatePerM,
        rawCost,
        markup,
        chargedCost,
      },
      select: { id: true },
    });

    // (5) Append the USAGE ledger entry (source of truth), signed negative.
    await tx.aiCreditLedger.create({
      data: {
        clinicId,
        type: AiLedgerType.USAGE,
        amount: chargedCost.neg(),
        balanceAfter: credit.balance,
        usageId: usageRow.id,
      },
    });
  });
}

/** True when the thrown error is a duplicate-messageId charge (already applied). */
export function isDuplicateChargeError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

async function moveBalance(
  clinicId: string,
  signedAmount: Prisma.Decimal,
  type: AiLedgerType,
  actorId: string | null,
  note: string | null,
): Promise<Prisma.Decimal> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "clinic_ai_credits"
      WHERE "clinicId" = ${clinicId}::uuid
      FOR UPDATE`;
    const credit = await tx.clinicAiCredit.update({
      where: { clinicId },
      data: { balance: { increment: signedAmount } },
      select: { balance: true },
    });
    await tx.aiCreditLedger.create({
      data: {
        clinicId,
        type,
        amount: signedAmount,
        balanceAfter: credit.balance,
        actorId,
        note,
      },
    });
    return credit.balance;
  });
}

/** Platform admin: add credit. `amount` must be a positive Decimal. */
export async function topUpClinicCredit(
  clinicId: string,
  amount: Prisma.Decimal,
  actorId: string,
  note?: string,
): Promise<Prisma.Decimal> {
  await ensureClinicAiCredit(clinicId);
  return moveBalance(clinicId, amount, AiLedgerType.TOPUP, actorId, note ?? null);
}

/** Platform admin: signed correction (may be negative). */
export async function adjustClinicCredit(
  clinicId: string,
  amount: Prisma.Decimal,
  actorId: string,
  note?: string,
): Promise<Prisma.Decimal> {
  await ensureClinicAiCredit(clinicId);
  return moveBalance(
    clinicId,
    amount,
    AiLedgerType.ADJUSTMENT,
    actorId,
    note ?? null,
  );
}

/** Platform admin: set the per-clinic markup multiplier. */
export async function setClinicMarkup(
  clinicId: string,
  markup: Prisma.Decimal,
): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { markup },
    create: { clinicId, markup },
  });
}

/** Clinic admin: flip the per-clinic global AI auto-reply switch. */
export async function setClinicAiEnabled(
  clinicId: string,
  enabled: boolean,
): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { aiEnabled: enabled },
    create: { clinicId, aiEnabled: enabled },
  });
}

/**
 * Raises an Escalation so a human sees the message in the admin inbox when the
 * agent won't reply (AI disabled or out of credit). Deduped: only one open
 * escalation (resolvedAt = null) per session. Unlike the escalate_to_human tool
 * it does NOT flip ChatSession.aiEnabled — the block is driven by clinic state,
 * so a top-up alone lets the agent resume.
 */
export async function ensureOpenEscalation(
  conversationId: string,
  sessionId: string,
  reason: string,
): Promise<void> {
  const open = await prisma.escalation.findFirst({
    where: { sessionId, resolvedAt: null },
    select: { id: true },
  });
  if (open) return;
  await prisma.escalation.create({
    data: { conversationId, sessionId, reason },
  });
}
