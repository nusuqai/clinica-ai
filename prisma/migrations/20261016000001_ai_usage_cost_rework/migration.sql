-- AI usage cost rework: cached-input pricing, gpt-5.6-luna repricing, and
-- removal of the unused USD charging layer (clinics are charged in UNITS only).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Every step is idempotent
-- (IF [NOT] EXISTS / recomputed from token counts), so a re-run is harmless.
--
-- DESTRUCTIVE: step 4 drops USD balance/ledger data, which is not recoverable.

-- ---------------------------------------------------------------------------
-- 1) Prompt-cache READ tokens on AI usage rows.
--    OpenAI bills the cached share of a request's input tokens at a steep
--    discount, so a REPLY/EXTRACTION row needs that share, and the rate it was
--    billed at, to make rawCost auditable. Both stay null on older rows — those
--    billed every prompt token at the full input rate.
-- ---------------------------------------------------------------------------
ALTER TABLE "ai_usage_logs"
  ADD COLUMN IF NOT EXISTS "cachedInputTokens"   INTEGER,
  ADD COLUMN IF NOT EXISTS "cachedInputRatePerM" DECIMAL(12,4);

-- ---------------------------------------------------------------------------
-- 2) Drop the prompt-cache WRITE columns. A dev database briefly had them (an
--    unreleased migration); cache writes are costed as ordinary input, so they
--    aren't recorded. IF EXISTS keeps this a no-op elsewhere.
-- ---------------------------------------------------------------------------
ALTER TABLE "ai_usage_logs"
  DROP COLUMN IF EXISTS "cacheWriteTokens",
  DROP COLUMN IF EXISTS "cacheWriteRatePerM";

-- ---------------------------------------------------------------------------
-- 3) Backfill: reprice every EXISTING gpt-5.6-luna token row (REPLY /
--    EXTRACTION) at the current list rates, per 1,000,000 tokens:
--       input $0.20 · cached input $0.02 · output $1.20
--    (same rates as MODEL_PRICING in server/services/aiCredit.ts, which prices
--    new rows at write time). promptTokens INCLUDES the cached share, so cached
--    tokens go at the cached rate and the rest at the input rate. Rows without
--    cachedInputTokens cost every prompt token at the input rate. Audio rows
--    (TRANSCRIPTION / TTS) are untouched.
-- ---------------------------------------------------------------------------
UPDATE "ai_usage_logs"
SET "inputRatePerM"       = 0.2,
    "cachedInputRatePerM" = CASE WHEN "cachedInputTokens" IS NULL THEN NULL ELSE 0.02 END,
    "outputRatePerM"      = 1.2,
    "rawCost"             = ( (COALESCE("promptTokens", 0) - COALESCE("cachedInputTokens", 0)) * 0.2
                            + COALESCE("cachedInputTokens", 0) * 0.02
                            + COALESCE("completionTokens", 0) * 1.2
                            ) / 1000000
WHERE "kind" IN ('REPLY', 'EXTRACTION')
  AND "model" LIKE 'gpt-5.6-luna%';

-- ---------------------------------------------------------------------------
-- 4) Drop the USD charging layer.
--    Every AI call used to deduct rawCost × markup ("chargedCost") from a USD
--    `balance` on clinic_ai_credits, mirrored in ai_credit_ledger. That balance
--    was never topped up, never gated anything and was never shown — the unit
--    meter (unitBalance + ai_unit_ledger) is what clinics are granted and
--    spend. ai_usage_logs.rawCost stays as platform telemetry (cost per unit).
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "ai_credit_ledger";
DROP TYPE IF EXISTS "AiLedgerType";

ALTER TABLE "clinic_ai_credits"
  DROP COLUMN IF EXISTS "balance",
  DROP COLUMN IF EXISTS "markup",
  DROP COLUMN IF EXISTS "lowBalanceThreshold";

ALTER TABLE "ai_usage_logs"
  DROP COLUMN IF EXISTS "markup",
  DROP COLUMN IF EXISTS "chargedCost";
