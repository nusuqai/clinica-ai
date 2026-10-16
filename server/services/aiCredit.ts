import "server-only";
import { Prisma, AiUnitLedgerType, AiUsageKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendClinicLowUnitsAlert } from "@/lib/email/send-transactional";
import type { TokenUsage } from "@/agent/types";

/**
 * Per-clinic AI metering — units for the clinic, raw USD cost for the platform.
 *
 *   - UNITS are what a clinic is granted, sees, and spends. One agent reply
 *     costs exactly one unit, however many tokens it burned; transcription, TTS
 *     and image extraction cost none. This is the only meter, and the only
 *     thing that gates the agent.
 *   - USD is telemetry only: every reply, transcription, TTS and extraction
 *     call logs its real OpenAI list cost (`rawCost`, see `computeCost`) on its
 *     AiUsageLog row, so the platform can see what a unit costs to serve. It is
 *     never charged to anyone and never gates anything.
 *
 * SAFETY (read before editing):
 *   - Every USD amount here is a Prisma.Decimal (decimal.js). JS floats never
 *     touch a rate or cost. `Number()` is only ever applied at the UI
 *     serialization boundary, never in this file. (Units are exact integers, so
 *     they are safe as a plain `number`.)
 *   - AiUnitLedger is the source of truth; `ClinicAiCredit.unitBalance` is a
 *     denormalized cache. Every change happens inside one transaction that locks
 *     the credit row (SELECT … FOR UPDATE), moves the balance, and appends a
 *     ledger row — so SUM(ledger.amount) always equals the cached balance.
 *   - Charging is idempotent via AiUsageLog @@unique([messageId, kind]): a
 *     webhook redelivery that re-charges the same reply rolls the whole txn
 *     back, unit included.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

/**
 * What one agent reply costs a clinic, in units. Flat by design: the clinic
 * pays per answered message and never has to reason about tokens — the variable
 * real cost is only logged (rawCost) for the platform. Voice does not change
 * it; transcription and TTS cost no unit.
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

interface TokenRate {
  inputPerM: Prisma.Decimal;
  /** Prompt-cache reads (the cached share of input_tokens) — a steep discount. */
  cachedInputPerM: Prisma.Decimal;
  outputPerM: Prisma.Decimal;
}

/** OpenAI Standard-tier list prices in USD per 1,000,000 tokens, from
 *  developers.openai.com/api/docs/pricing (checked 2026-10-16). Snapshotted onto
 *  each usage log so historical cost stays correct when these change.
 *
 *  gpt-5.6 rates are the short-context (≤272K input tokens per request) tier;
 *  the agent's requests stay well under that. Not modelled: the >272K tier and
 *  the 10% regional/data-residency uplift (we call the global endpoint). */
const PRICING: Record<string, TokenRate> = {
  // GPT-5.6 reasoning family. Reasoning (thinking) tokens are billed as output
  // tokens and are already included in the reply's output_tokens count, so no
  // separate handling is needed here.
  "gpt-5.6-sol": { inputPerM: D("4"), cachedInputPerM: D("0.4"), outputPerM: D("20") },
  "gpt-5.6-terra": { inputPerM: D("2"), cachedInputPerM: D("0.2"), outputPerM: D("12") },
  "gpt-5.6-luna": { inputPerM: D("0.2"), cachedInputPerM: D("0.02"), outputPerM: D("1.2") },
  "gpt-4o": { inputPerM: D("2.5"), cachedInputPerM: D("1.25"), outputPerM: D("10") },
  "gpt-4o-mini": { inputPerM: D("0.15"), cachedInputPerM: D("0.075"), outputPerM: D("0.6") },
  "gpt-4.1": { inputPerM: D("2"), cachedInputPerM: D("0.5"), outputPerM: D("8") },
  "gpt-4.1-mini": { inputPerM: D("0.4"), cachedInputPerM: D("0.1"), outputPerM: D("1.6") },
  "gpt-4.1-nano": { inputPerM: D("0.1"), cachedInputPerM: D("0.025"), outputPerM: D("0.4") },
};

/** Used when a model isn't in the table — never bill an unknown model as free.
 *  Cache reads at the full input rate: without a known discount, err toward
 *  over- rather than under-counting cost. */
const FALLBACK_RATE: TokenRate = {
  inputPerM: D("2.5"),
  cachedInputPerM: D("2.5"),
  outputPerM: D("10"),
};

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

function rateFor(model: string): TokenRate {
  // Provider may report a dated variant (e.g. "gpt-4o-2024-08-06"); match on the
  // LONGEST prefix, so "gpt-4o-mini-2024-07-18" is gpt-4o-mini, not gpt-4o.
  if (PRICING[model]) return PRICING[model];
  const key = Object.keys(PRICING)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICING[key] : FALLBACK_RATE;
}

export interface CostBreakdown {
  rawCost: Prisma.Decimal;
  inputRatePerM: Prisma.Decimal;
  cachedInputRatePerM: Prisma.Decimal;
  outputRatePerM: Prisma.Decimal;
  /** Cache-read count clamped to promptTokens — what was actually billed at the
   *  cached rate, and what the usage log should record. */
  cachedInputTokens: number;
}

/**
 * Raw OpenAI list cost for a turn. Decimal only.
 *
 * promptTokens INCLUDES the cached share: cached tokens go at the cached rate,
 * the rest at the ordinary input rate. Completions go at output. (Same formula
 * as LangSmith's cost.)
 */
export function computeCost(usage: TokenUsage): CostBreakdown {
  const rate = rateFor(usage.model);
  const cachedInputTokens = Math.min(Math.max(usage.cachedInputTokens ?? 0, 0), usage.promptTokens);
  const uncachedInputTokens = usage.promptTokens - cachedInputTokens;
  const rawCost = rate.inputPerM
    .mul(uncachedInputTokens)
    .plus(rate.cachedInputPerM.mul(cachedInputTokens))
    .plus(rate.outputPerM.mul(usage.completionTokens))
    .div(TOKENS_PER_MILLION);
  return {
    rawCost,
    inputRatePerM: rate.inputPerM,
    cachedInputRatePerM: rate.cachedInputPerM,
    outputRatePerM: rate.outputPerM,
    cachedInputTokens,
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
  /** Per-clinic image-analysis (vision) switch — see schema. Default false. */
  imageAnalysisEnabled: boolean;
  /** When analysis is on: let the agent answer the image (true) vs. only store
   *  the extraction for the call-centre team + escalate (false). Default true. */
  imageAutoReplyEnabled: boolean;
  /** Clinic-facing meter: replies remaining. The ONLY prepaid meter. */
  unitBalance: number;
  lowUnitsThreshold: number;
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
      imageAnalysisEnabled: true,
      imageAutoReplyEnabled: true,
      unitBalance: true,
      lowUnitsThreshold: true,
    },
  });
  return {
    aiEnabled: row.aiEnabled,
    voiceReplyEnabled: row.voiceReplyEnabled,
    imageAnalysisEnabled: row.imageAnalysisEnabled,
    imageAutoReplyEnabled: row.imageAutoReplyEnabled,
    unitBalance: row.unitBalance,
    lowUnitsThreshold: row.lowUnitsThreshold,
    sufficient: row.unitBalance >= UNITS_PER_REPLY,
    lowUnits: row.unitBalance <= row.lowUnitsThreshold,
  };
}

/**
 * Charges one agent reply: ONE UNIT off the clinic's meter, plus a usage log of
 * its real USD cost (telemetry), atomically, in the same transaction.
 *
 * This is the ONLY place a unit is ever spent, and it is reached only from the
 * agent runner after an AGENT message has been persisted — which is exactly what
 * makes "units decrease only when the AI answers" true by construction. A human
 * admin replying from the inbox goes through server/actions/messages.ts and
 * never comes near this function, so it costs the clinic nothing.
 *
 * The credit row is locked FOR UPDATE first so concurrent turns for the same
 * clinic serialize and `balanceAfter` is exact. The unit balance may dip
 * slightly negative on the turn that spent the last of it — that's accepted;
 * the next turn is blocked by the `sufficient` gate.
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
  /** The AI employee that wrote the reply — attributes the unit to it. */
  aiAgentId?: string | null;
}): Promise<UnitAlert | null> {
  const { clinicId, sessionId, messageId, usage } = args;

  return prisma.$transaction(async (tx) => {
    // (1) Lock the credit row so concurrent turns for this clinic serialize.
    await tx.$queryRaw`
      SELECT "id" FROM "clinic_ai_credits"
      WHERE "clinicId" = ${clinicId}::uuid
      FOR UPDATE`;

    // (2) Compute the raw cost (Decimal only) — telemetry, not charged.
    const { rawCost, inputRatePerM, cachedInputRatePerM, outputRatePerM, cachedInputTokens } =
      computeCost(usage);

    // (3) Atomic unit decrement; the returned values are post-decrement.
    const credit = await tx.clinicAiCredit.update({
      where: { clinicId },
      data: { unitBalance: { decrement: UNITS_PER_REPLY } },
      select: {
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
        aiAgentId: args.aiAgentId ?? null,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedInputTokens,
        totalTokens: usage.totalTokens,
        inputRatePerM,
        cachedInputRatePerM,
        outputRatePerM,
        rawCost,
        unitsCharged: UNITS_PER_REPLY,
      },
      select: { id: true },
    });

    // (5) The unit ledger entry (source of truth), linked to the usage row — so
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

    // (6) Claim the platform alert, still under the row lock taken in (1).
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
 * Logs a non-token (audio) call — transcription or TTS — as its own usage row.
 * Idempotent on (messageId, kind): a webhook redelivery that logs the same audio
 * again fails the unique and is swallowed by the caller.
 *
 * No unit is spent here. A voice conversation costs the clinic the same one
 * unit per answer as a text one; understanding the question and speaking the
 * answer are costs the platform absorbs — logged here as rawCost only.
 *
 * For audio rows the token columns are null and `audioSeconds` carries the
 * length; the per-unit list rate is snapshotted in `inputRatePerM` (per-minute
 * for transcription, per-1M-chars for TTS) so historical cost stays correct.
 */
async function logAudioUsage(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  kind: AiUsageKind;
  model: string;
  audioSeconds: number | null;
  ratePerM: Prisma.Decimal;
  rawCost: Prisma.Decimal;
}): Promise<void> {
  const { clinicId, sessionId, messageId, kind, model, audioSeconds, ratePerM, rawCost } = args;

  await prisma.aiUsageLog.create({
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
      // Explicit, though it is also the column default: audio never costs the
      // clinic a unit. Keeps unit reporting a plain SUM over this column.
      unitsCharged: 0,
    },
  });
}

/**
 * Logs transcription of one inbound voice message, as its own usage row (kind
 * TRANSCRIPTION), separate from the agent reply. `messageId` is the inbound
 * patient message; `audioSeconds` is the billed audio length.
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
  await logAudioUsage({
    clinicId: args.clinicId,
    sessionId: args.sessionId,
    messageId: args.messageId,
    kind: AiUsageKind.TRANSCRIPTION,
    model: args.model,
    audioSeconds: args.audioSeconds,
    ratePerM: ratePerMin,
    rawCost,
  });
}

/**
 * Logs a synthesized (TTS) voice reply, as its own usage row (kind TTS),
 * separate from the agent reply's token usage. `messageId` is the agent reply
 * message; costed per character of spoken text.
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
  await logAudioUsage({
    clinicId: args.clinicId,
    sessionId: args.sessionId,
    messageId: args.messageId,
    kind: AiUsageKind.TTS,
    model: args.model,
    audioSeconds: args.audioSeconds,
    ratePerM,
    rawCost,
  });
}

/**
 * Logs the one-time vision call that describes an inbound image (issue #52), as
 * its own usage row (kind EXTRACTION), separate from the agent reply.
 * `messageId` is the inbound patient image message; costed on the vision call's
 * own token usage (image tokens are already inside `promptTokens`).
 *
 * Token-shaped like a reply, but no unit is spent (the platform absorbs the
 * cost of understanding the patient, same as transcription/TTS). Idempotent on
 * (messageId, EXTRACTION): a redelivery fails the unique.
 */
export async function chargeExtraction(args: {
  clinicId: string;
  sessionId: string | null;
  messageId: string | null;
  usage: TokenUsage;
}): Promise<void> {
  const { clinicId, sessionId, messageId, usage } = args;
  const { rawCost, inputRatePerM, cachedInputRatePerM, outputRatePerM, cachedInputTokens } =
    computeCost(usage);

  await prisma.aiUsageLog.create({
    data: {
      clinicId,
      sessionId,
      messageId,
      kind: AiUsageKind.EXTRACTION,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedInputTokens,
      totalTokens: usage.totalTokens,
      inputRatePerM,
      cachedInputRatePerM,
      outputRatePerM,
      rawCost,
      // Vision never costs the clinic a unit — only the reply it feeds does.
      unitsCharged: 0,
    },
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
 * USD counterpart to this function. USD is only ever logged per call, as
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

/** Clinic admin: flip the per-clinic image-analysis (vision) switch. */
export async function setClinicImageAnalysisEnabled(
  clinicId: string,
  enabled: boolean
): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { imageAnalysisEnabled: enabled },
    create: { clinicId, imageAnalysisEnabled: enabled },
  });
}

/**
 * Clinic admin: when image analysis is on, choose whether the agent answers the
 * image (extract-and-respond) or only stores the extraction for the call-centre
 * team and escalates (extract-only). See schema ClinicAiCredit.imageAutoReplyEnabled.
 */
export async function setClinicImageAutoReplyEnabled(
  clinicId: string,
  enabled: boolean
): Promise<void> {
  await prisma.clinicAiCredit.upsert({
    where: { clinicId },
    update: { imageAutoReplyEnabled: enabled },
    create: { clinicId, imageAutoReplyEnabled: enabled },
  });
}

/** Allowed range for the per-clinic message-debounce window (seconds). The floor
 *  keeps a clinic from effectively disabling debounce (→ spam + 4× cost); the
 *  ceiling keeps replies from feeling abandoned. Also near the pg_cron cadence. */
export const DEBOUNCE_SECONDS_MIN = 5;
export const DEBOUNCE_SECONDS_MAX = 120;

/** Clinic admin: set how long to wait after a patient's last message before the
 *  agent answers the burst. Clamped to [MIN, MAX]. */
export async function setClinicDebounceSeconds(clinicId: string, seconds: number): Promise<number> {
  const clamped = Math.round(
    Math.min(DEBOUNCE_SECONDS_MAX, Math.max(DEBOUNCE_SECONDS_MIN, seconds))
  );
  await prisma.clinic.update({ where: { id: clinicId }, data: { debounceSeconds: clamped } });
  return clamped;
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

/**
 * Raises an Escalation tied to a SPECIFIC inbound message — media the agent can't
 * read (image with analysis off, video, document, etc.). Unlike
 * `ensureOpenEscalation` this is deduped per message (so each attachment the
 * agent couldn't handle is individually flagged and resolvable in the inbox), and
 * it likewise NEVER disables the AI — the agent keeps answering the next messages.
 * Idempotent on messageId so a webhook redelivery doesn't double-flag.
 */
export async function escalateMessage(
  clinicId: string,
  conversationId: string,
  sessionId: string,
  messageId: string,
  reason: string
): Promise<void> {
  const existing = await prisma.escalation.findFirst({
    where: { messageId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.escalation.create({
    data: { clinicId, conversationId, sessionId, messageId, reason },
  });
}
