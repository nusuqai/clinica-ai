import "server-only";
import { Prisma, AiLedgerType, AiUnitLedgerType, AiUsageKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendClinicLowUnitsAlert } from "@/lib/email/send-transactional";
import type { TokenUsage } from "@/agent/types";

/**
 * Per-clinic AI metering — the money path AND the unit path.
 *
 * TWO METERS, ONE OF THEM PREPAID (see the ClinicAiCredit schema comment):
 *   - UNITS are what a clinic is granted, sees, and spends. One agent reply
 *     costs exactly one unit, however many tokens it burned; transcription and
 *     TTS cost none. This is the only meter that gates the agent.
 *   - USD is pure telemetry: the real marked-up cost of every reply,
 *     transcription and TTS call, computed by `computeCost` below. Nobody tops
 *     it up — it only accrues — so it can never stop a clinic from replying.
 * They move together in one transaction so they can never disagree about
 * whether a reply happened.
 *
 * MONEY SAFETY (read before editing):
 *   - Every amount here is a Prisma.Decimal (decimal.js). JS floats never touch a
 *     rate, cost, markup or balance. `Number()` is only ever applied at the UI
 *     serialization boundary, never in this file. (Units are exact integers, so
 *     they are the one thing here that is safe as a plain `number`.)
 *   - The AiCreditLedger / AiUnitLedger are the sources of truth;
 *     `ClinicAiCredit.balance` and `.unitBalance` are denormalized caches. Every
 *     change happens inside one transaction that locks the credit row
 *     (SELECT … FOR UPDATE), mutates the balance, and appends a ledger row — so
 *     SUM(ledger.amount) always equals the cached balance.
 *   - Charging is idempotent via AiUsageLog @@unique([messageId, kind]): a
 *     webhook redelivery that re-charges the same reply rolls the whole txn
 *     back, units included.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * What one agent reply costs a clinic, in units. Flat by design: the clinic
 * pays per answered message and never has to reason about tokens — the variable
 * real cost lands on the platform's USD ledger instead. Voice does not change
 * it; transcription and TTS are charged in USD only.
 */
export const UNITS_PER_REPLY = 1;

/**
 * Which low-credit alert a charge just triggered for the platform admins.
 * "low" = the clinic crossed its warning threshold and should be topped up.
 * "out" = it just spent its last unit, so the agent has stopped answering.
 */
export type UnitAlertSeverity = "low" | "out";

export interface UnitAlert {
  severity: UnitAlertSeverity;
  /** Units left after the charge that triggered the alert. */
  unitBalance: number;
  lowUnitsThreshold: number;
}

const TOKENS_PER_MILLION = D(1_000_000);
const DEFAULT_MARKUP = D("1.5");

/** OpenAI list prices in USD per 1,000,000 tokens (as of 2026). Snapshotted onto
 *  each usage log so historical cost stays correct when these change. */
const PRICING: Record<string, { inputPerM: Prisma.Decimal; outputPerM: Prisma.Decimal }> = {
  // GPT-5.6 reasoning family. Reasoning (thinking) tokens are billed as output
  // tokens and are already included in the reply's output_tokens count, so no
  // separate handling is needed here.
  "gpt-5.6-luna": { inputPerM: D("0.2"), outputPerM: D("1.2") },
  "gpt-5.6-terra": { inputPerM: D("2"), outputPerM: D("12") },
  "gpt-4o": { inputPerM: D("2.5"), outputPerM: D("10") },
  "gpt-4o-mini": { inputPerM: D("0.15"), outputPerM: D("0.6") },
  "gpt-4.1": { inputPerM: D("2"), outputPerM: D("8") },
  "gpt-4.1-mini": { inputPerM: D("0.4"), outputPerM: D("1.6") },
  "gpt-4.1-nano": { inputPerM: D("0.1"), outputPerM: D("0.4") },
};

/** Used when a model isn't in the table — never bill an unknown model as free. */
const FALLBACK_RATE = { inputPerM: D("2.5"), outputPerM: D("10") };

/** Transcription (speech-to-text) list prices in USD per MINUTE of audio. */
const TRANSCRIBE_PRICING: Record<string, Prisma.Decimal> = {
  "gpt-transcribe": D("0.0045"),
  "gpt-4o-transcribe": D("0.006"),
  "gpt-4o-mini-transcribe": D("0.003"),
  "whisper-1": D("0.006"),
};
const FALLBACK_TRANSCRIBE_PER_MIN = D("0.006");

/** TTS list prices in USD per 1,000,000 characters of spoken text. */
const TTS_PRICING: Record<string, Prisma.Decimal> = {
  "gpt-4o-mini-tts": D("15"),
  "tts-1": D("15"),
  "tts-1-hd": D("30"),
};
const FALLBACK_TTS_PER_M_CHARS = D("15");

const SECONDS_PER_MINUTE = D(60);

function transcribeRate(model: string): Prisma.Decimal {
  if (TRANSCRIBE_PRICING[model]) return TRANSCRIBE_PRICING[model];
  const key = Object.keys(TRANSCRIBE_PRICING).find((k) => model.startsWith(k));
  return key ? TRANSCRIBE_PRICING[key] : FALLBACK_TRANSCRIBE_PER_MIN;
}

function ttsRate(model: string): Prisma.Decimal {
  if (TTS_PRICING[model]) return TTS_PRICING[model];
  const key = Object.keys(TTS_PRICING).find((k) => model.startsWith(k));
  return key ? TTS_PRICING[key] : FALLBACK_TTS_PER_M_CHARS;
}

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
  /** Per-clinic voice-reply (TTS) switch — see schema. Default false. */
  voiceReplyEnabled: boolean;
  /** Clinic-facing meter: replies remaining. The ONLY prepaid meter. */
  unitBalance: number;
  lowUnitsThreshold: number;
  markup: Prisma.Decimal;
  /**
   * Hard gate: the agent replies only when the clinic has a unit left to spend.
   * Units are the only thing a clinic is granted, so they are the only thing
   * that can stop it — the USD figures are cost telemetry and never gate.
   */
  sufficient: boolean;
  /** Soft warning for the UI only — does not block replies. */
  lowUnits: boolean;
}

/** Just the unit meter, for display. */
export interface ClinicUnitSummary {
  unitBalance: number;
  lowUnitsThreshold: number;
  /** Running low — show a warning colour, but the agent still replies. */
  lowUnits: boolean;
  /** Out of units — the agent has stopped replying. */
  unitsSufficient: boolean;
  aiEnabled: boolean;
}

/**
 * The unit meter alone, as a plain READ — no upsert, unlike getClinicAiStatus.
 *
 * That distinction is the point of this function: the meter is shown on every
 * admin screen (sidebar, dashboard, reports), and a satellite-creating write on
 * each of those renders would be a pointless write amplification. A clinic with
 * no credit row yet simply reads as zero units; the row gets created the moment
 * anything real happens (the runner's gate, a platform top-up, the AI settings
 * page).
 */
export async function getClinicUnitSummary(clinicId: string): Promise<ClinicUnitSummary> {
  const row = await prisma.clinicAiCredit.findUnique({
    where: { clinicId },
    select: { unitBalance: true, lowUnitsThreshold: true, aiEnabled: true },
  });
  const unitBalance = row?.unitBalance ?? 0;
  const lowUnitsThreshold = row?.lowUnitsThreshold ?? 50;
  return {
    unitBalance,
    lowUnitsThreshold,
    lowUnits: unitBalance <= lowUnitsThreshold,
    unitsSufficient: unitBalance >= UNITS_PER_REPLY,
    aiEnabled: row?.aiEnabled ?? true,
  };
}

/**
 * Reads the clinic's AI gate + unit meter, creating the satellite lazily so a
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
      voiceReplyEnabled: true,
      unitBalance: true,
      lowUnitsThreshold: true,
      markup: true,
    },
  });
  return {
    aiEnabled: row.aiEnabled,
    voiceReplyEnabled: row.voiceReplyEnabled,
    unitBalance: row.unitBalance,
    lowUnitsThreshold: row.lowUnitsThreshold,
    markup: row.markup,
    sufficient: row.unitBalance >= UNITS_PER_REPLY,
    lowUnits: row.unitBalance <= row.lowUnitsThreshold,
  };
}

/**
 * Charges one agent reply: ONE UNIT off the clinic's meter and its real cost off
 * the platform's USD balance, atomically, in the same transaction.
 *
 * This is the ONLY place a unit is ever spent, and it is reached only from the
 * agent runner after an AGENT message has been persisted — which is exactly what
 * makes "units decrease only when the AI answers" true by construction. A human
 * admin replying from the inbox goes through server/actions/messages.ts and
 * never comes near this function, so it costs the clinic nothing.
 *
 * The credit row is locked FOR UPDATE first so concurrent turns for the same
 * clinic serialize and both `balanceAfter` values are exact. The markup is read
 * under that lock so a mid-turn markup edit can't split the cost. Either balance
 * may dip slightly negative on the turn that spent the last of it — that's
 * accepted; the next turn is blocked by the `sufficient` gate.
 *
 * Idempotent: a duplicate (messageId, kind) violates the unique index and rolls
 * the whole txn back — the unit with it, so a redelivered webhook can never
 * charge a clinic twice for one answer. Callers should swallow that specific
 * error (already charged).
 */
export async function chargeUsage(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  usage: TokenUsage;
}): Promise<UnitAlert | null> {
  const { clinicId, sessionId, messageId, usage } = args;

  return prisma.$transaction(async (tx) => {
    // (1) Lock the credit row and read the CURRENT markup under the lock.
    const locked = await tx.$queryRaw<{ markup: Prisma.Decimal }[]>`
      SELECT "markup" FROM "clinic_ai_credits"
      WHERE "clinicId" = ${clinicId}::uuid
      FOR UPDATE`;
    const markup = locked[0]?.markup ?? DEFAULT_MARKUP;

    // (2) Compute cost (Decimal only).
    const { rawCost, chargedCost, inputRatePerM, outputRatePerM } = computeCost(usage, markup);

    // (3) Atomic decrement of BOTH meters; the returned values are
    //     post-decrement. One update, so the two can never diverge.
    const credit = await tx.clinicAiCredit.update({
      where: { clinicId },
      data: {
        balance: { decrement: chargedCost },
        unitBalance: { decrement: UNITS_PER_REPLY },
      },
      select: {
        balance: true,
        unitBalance: true,
        lowUnitsThreshold: true,
        lowUnitsNotifiedAt: true,
        unitsOutNotifiedAt: true,
      },
    });

    // (4) Append the usage log — (messageId, kind) @unique makes this idempotent.
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
        unitsCharged: UNITS_PER_REPLY,
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

    // (6) The same entry on the unit ledger, linked to the same usage row — so
    //     every unit a clinic spent points at the reply that spent it.
    await tx.aiUnitLedger.create({
      data: {
        clinicId,
        type: AiUnitLedgerType.USAGE,
        amount: -UNITS_PER_REPLY,
        balanceAfter: credit.unitBalance,
        usageId: usageRow.id,
      },
    });

    // (7) Claim the platform alert, still under the row lock taken in (1).
    //     Claiming here — rather than checking after the commit — is what makes
    //     the email fire exactly once per crossing: concurrent turns for the
    //     same clinic serialize on this row, so only one of them can find the
    //     stamp unset and take it. The send itself happens after the commit.
    const isOut = credit.unitBalance < UNITS_PER_REPLY;
    const isLow = credit.unitBalance <= credit.lowUnitsThreshold;

    let severity: UnitAlertSeverity | null = null;
    if (isOut && !credit.unitsOutNotifiedAt) severity = "out";
    else if (!isOut && isLow && !credit.lowUnitsNotifiedAt) severity = "low";
    if (!severity) return null;

    const now = new Date();
    await tx.clinicAiCredit.update({
      where: { clinicId },
      data:
        severity === "out"
          ? // Stamp the low mark too when a clinic drops straight to empty
            // (e.g. it was granted fewer units than its own threshold), so a
            // partial top-up back into "low" doesn't mail a redundant warning.
            { unitsOutNotifiedAt: now, lowUnitsNotifiedAt: credit.lowUnitsNotifiedAt ?? now }
          : { lowUnitsNotifiedAt: now },
    });

    return {
      severity,
      unitBalance: credit.unitBalance,
      lowUnitsThreshold: credit.lowUnitsThreshold,
    };
  });
}

/**
 * Sends the platform-admin alert claimed by `chargeUsage`. Kept separate so the
 * mail goes out AFTER the billing transaction commits — never inside it, where
 * a slow SMTP call would hold the clinic's row lock and a rollback could not
 * unsend the message.
 *
 * Never throws: the alert is a courtesy to the platform, and the reply it was
 * triggered by has already reached the patient.
 */
export async function notifyUnitAlert(clinicId: string, alert: UnitAlert): Promise<void> {
  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, slug: true },
    });
    if (!clinic) return;

    await sendClinicLowUnitsAlert({
      clinicName: clinic.name,
      clinicSlug: clinic.slug,
      unitBalance: alert.unitBalance,
      lowUnitsThreshold: alert.lowUnitsThreshold,
      severity: alert.severity,
    });
  } catch (err) {
    console.error("[aiCredit] failed to notify unit alert", err);
  }
}

/**
 * Shared money path for a non-token (audio) charge — transcription or TTS.
 * Mirrors `chargeUsage`: locks the credit row, reads the markup under the lock,
 * decrements the balance, and appends a usage log + a signed-negative ledger
 * row in one transaction. Idempotent on (messageId, kind): a webhook redelivery
 * that re-charges the same audio rolls the whole txn back.
 *
 * USD ONLY — no unit is spent here. A voice conversation costs the clinic the
 * same one unit per answer as a text one; understanding the question and
 * speaking the answer are costs the platform absorbs on its own ledger.
 *
 * For audio rows the token columns are null and `audioSeconds` carries the
 * length; the per-unit list rate is snapshotted in `inputRatePerM` (per-minute
 * for transcription, per-1M-chars for TTS) so historical cost stays correct.
 */
async function chargeAudioUsage(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  kind: AiUsageKind;
  ledgerType: AiLedgerType;
  model: string;
  audioSeconds: number | null;
  ratePerM: Prisma.Decimal;
  rawCost: Prisma.Decimal;
}): Promise<void> {
  const {
    clinicId,
    sessionId,
    messageId,
    kind,
    ledgerType,
    model,
    audioSeconds,
    ratePerM,
    rawCost,
  } = args;

  await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ markup: Prisma.Decimal }[]>`
      SELECT "markup" FROM "clinic_ai_credits"
      WHERE "clinicId" = ${clinicId}::uuid
      FOR UPDATE`;
    const markup = locked[0]?.markup ?? DEFAULT_MARKUP;

    const chargedCost = rawCost.mul(markup);

    const credit = await tx.clinicAiCredit.update({
      where: { clinicId },
      data: { balance: { decrement: chargedCost } },
      select: { balance: true },
    });

    const usageRow = await tx.aiUsageLog.create({
      data: {
        clinicId,
        sessionId,
        messageId,
        kind,
        model,
        audioSeconds: audioSeconds ?? null,
        // Audio rows are not token-shaped.
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        inputRatePerM: ratePerM,
        outputRatePerM: D(0),
        rawCost,
        markup,
        chargedCost,
        // Explicit, though it is also the column default: audio never costs the
        // clinic a unit. Keeps unit reporting a plain SUM over this column.
        unitsCharged: 0,
      },
      select: { id: true },
    });

    await tx.aiCreditLedger.create({
      data: {
        clinicId,
        type: ledgerType,
        amount: chargedCost.neg(),
        balanceAfter: credit.balance,
        usageId: usageRow.id,
      },
    });
  });
}

/**
 * Charges transcription of one inbound voice message, as its own ledger line
 * (type TRANSCRIPTION), separate from the agent reply. `messageId` is the
 * inbound patient message; `audioSeconds` is the billed audio length.
 */
export async function chargeTranscription(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  model: string;
  audioSeconds: number | null;
}): Promise<void> {
  const seconds = args.audioSeconds && args.audioSeconds > 0 ? args.audioSeconds : 1;
  const ratePerMin = transcribeRate(args.model);
  const rawCost = ratePerMin.mul(seconds).div(SECONDS_PER_MINUTE);
  await chargeAudioUsage({
    clinicId: args.clinicId,
    sessionId: args.sessionId,
    messageId: args.messageId,
    kind: AiUsageKind.TRANSCRIPTION,
    ledgerType: AiLedgerType.TRANSCRIPTION,
    model: args.model,
    audioSeconds: args.audioSeconds,
    ratePerM: ratePerMin,
    rawCost,
  });
}

/**
 * Charges a synthesized (TTS) voice reply, as its own ledger line (type TTS),
 * separate from the agent reply's token charge. `messageId` is the agent reply
 * message; billed per character of spoken text.
 */
export async function chargeTts(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  model: string;
  characters: number;
  audioSeconds: number | null;
}): Promise<void> {
  const chars = args.characters > 0 ? args.characters : 1;
  const ratePerM = ttsRate(args.model);
  // TOKENS_PER_MILLION is just 1,000,000 — reused here as chars-per-million.
  const rawCost = ratePerM.mul(chars).div(TOKENS_PER_MILLION);
  await chargeAudioUsage({
    clinicId: args.clinicId,
    sessionId: args.sessionId,
    messageId: args.messageId,
    kind: AiUsageKind.TTS,
    ledgerType: AiLedgerType.TTS,
    model: args.model,
    audioSeconds: args.audioSeconds,
    ratePerM,
    rawCost,
  });
}

/** True when the thrown error is a duplicate-messageId charge (already applied). */
export function isDuplicateChargeError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/**
 * Moves a clinic's unit meter and records it. Take the credit row's lock, move
 * `unitBalance`, append the signed unit-ledger row. Integers throughout — no
 * Decimal, because a unit is indivisible.
 *
 * Units are the only thing a clinic is ever granted: there is deliberately no
 * USD counterpart to this function. The dollar side is never topped up or
 * adjusted by hand — it only ever accrues what replies actually cost, as
 * telemetry (see chargeUsage).
 */
async function moveUnits(
  clinicId: string,
  signedUnits: number,
  type: AiUnitLedgerType,
  actorId: string | null,
  note: string | null
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id" FROM "clinic_ai_credits"
      WHERE "clinicId" = ${clinicId}::uuid
      FOR UPDATE`;
    const credit = await tx.clinicAiCredit.update({
      where: { clinicId },
      data: { unitBalance: { increment: signedUnits } },
      select: { unitBalance: true, lowUnitsThreshold: true },
    });
    await tx.aiUnitLedger.create({
      data: {
        clinicId,
        type,
        amount: signedUnits,
        balanceAfter: credit.unitBalance,
        actorId,
        note,
      },
    });

    // Re-arm the alerts this top-up has resolved, so the NEXT time the clinic
    // slides down it mails again. Only the stamps that no longer apply are
    // cleared: a partial top-up that leaves the clinic still below its warning
    // threshold re-arms the "out" alert (it can run dry again) but keeps the
    // "low" one (the admins already know it is low — don't tell them twice).
    if (credit.unitBalance > credit.lowUnitsThreshold) {
      await tx.clinicAiCredit.update({
        where: { clinicId },
        data: { lowUnitsNotifiedAt: null, unitsOutNotifiedAt: null },
      });
    } else if (credit.unitBalance >= UNITS_PER_REPLY) {
      await tx.clinicAiCredit.update({
        where: { clinicId },
        data: { unitsOutNotifiedAt: null },
      });
    }

    return credit.unitBalance;
  });
}

/** Platform admin: grant units to a clinic. `units` must be a positive integer. */
export async function topUpClinicUnits(
  clinicId: string,
  units: number,
  actorId: string,
  note?: string
): Promise<number> {
  await ensureClinicAiCredit(clinicId);
  return moveUnits(clinicId, units, AiUnitLedgerType.TOPUP, actorId, note ?? null);
}

/** Platform admin: signed unit correction (may be negative). */
export async function adjustClinicUnits(
  clinicId: string,
  units: number,
  actorId: string,
  note?: string
): Promise<number> {
  await ensureClinicAiCredit(clinicId);
  return moveUnits(clinicId, units, AiUnitLedgerType.ADJUSTMENT, actorId, note ?? null);
}

/**
 * Platform admin: set the unit count at which the clinic sees a low-balance
 * warning. Not a ledger movement — it changes no balance.
 */
export async function setClinicLowUnitsThreshold(
  clinicId: string,
  threshold: number
): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { lowUnitsThreshold: threshold },
    create: { clinicId, lowUnitsThreshold: threshold },
  });
}

/** Platform admin: set the per-clinic markup multiplier. */
export async function setClinicMarkup(clinicId: string, markup: Prisma.Decimal): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { markup },
    create: { clinicId, markup },
  });
}

/** Clinic admin: flip the per-clinic global AI auto-reply switch. */
export async function setClinicAiEnabled(clinicId: string, enabled: boolean): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { aiEnabled: enabled },
    create: { clinicId, aiEnabled: enabled },
  });
}

/** Clinic admin: flip the per-clinic voice-reply (TTS) switch. */
export async function setClinicVoiceReplyEnabled(
  clinicId: string,
  enabled: boolean
): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { voiceReplyEnabled: enabled },
    create: { clinicId, voiceReplyEnabled: enabled },
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
  clinicId: string,
  conversationId: string,
  sessionId: string,
  reason: string
): Promise<void> {
  const open = await prisma.escalation.findFirst({
    where: { sessionId, resolvedAt: null },
    select: { id: true },
  });
  if (open) return;
  await prisma.escalation.create({
    data: { clinicId, conversationId, sessionId, reason },
  });
}
