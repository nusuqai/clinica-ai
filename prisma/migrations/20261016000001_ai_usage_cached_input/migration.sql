-- Prompt-cache READ tokens on AI usage rows. OpenAI bills the cached share of a
-- request's input tokens at a steep discount, so a REPLY/EXTRACTION row needs
-- that share, and the rate it was billed at, to make rawCost auditable.
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent. Both
-- columns stay null on existing rows — those billed every prompt token at the
-- full input rate, and no cache counts were recorded for them.

ALTER TABLE "ai_usage_logs"
  ADD COLUMN IF NOT EXISTS "cachedInputTokens"   INTEGER,
  ADD COLUMN IF NOT EXISTS "cachedInputRatePerM" DECIMAL(12,4);
