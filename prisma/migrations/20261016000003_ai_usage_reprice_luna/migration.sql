-- AI usage cost: input, cached input and output only.
--
-- (1) Drops the prompt-cache WRITE columns. A dev database briefly had them
--     (an unreleased migration); cache writes are now costed as ordinary input,
--     so they aren't recorded. IF EXISTS keeps this a no-op elsewhere.
--
-- (2) Reprices every past gpt-5.6-luna token row (REPLY / EXTRACTION) at the
--     current list rates, per 1,000,000 tokens:
--        input $0.20 · cached input $0.02 · output $1.20
--     promptTokens INCLUDES the cached share, so the cached tokens go at the
--     cached rate and the rest at the input rate. Rows from before cached
--     tokens were captured (cachedInputTokens null) cost every prompt token at
--     the input rate, as they always did. Audio rows (TRANSCRIPTION / TTS) are
--     untouched. (chargedCost is not recomputed — the next migration drops it.)
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Idempotent: it recomputes from
-- the token counts, so re-running yields the same values.

ALTER TABLE "ai_usage_logs"
  DROP COLUMN IF EXISTS "cacheWriteTokens",
  DROP COLUMN IF EXISTS "cacheWriteRatePerM";

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
