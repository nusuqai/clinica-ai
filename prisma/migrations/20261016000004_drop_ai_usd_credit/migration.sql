-- Clinics are charged in UNITS only, so the USD charging layer goes.
--
-- Before: every AI call deducted rawCost × markup ("chargedCost") from a USD
-- `balance` on clinic_ai_credits, mirrored row-by-row in ai_credit_ledger. That
-- balance was never topped up, never gated anything and was never shown — the
-- unit meter (unitBalance + ai_unit_ledger) is what clinics are granted and
-- spend. What stays as USD is ai_usage_logs.rawCost: the real OpenAI list cost
-- of each call, kept as platform telemetry (cost per unit).
--
-- Drops:
--   * ai_credit_ledger (table) and its "AiLedgerType" enum
--   * clinic_ai_credits: balance, markup, lowBalanceThreshold
--   * ai_usage_logs: markup, chargedCost
--
-- DESTRUCTIVE: the dropped USD data is not recoverable. Applied with
-- `prisma migrate deploy` (hand-written: `migrate dev` breaks on this project's
-- cross-schema FK shadow DB). IF EXISTS keeps a re-run harmless.

DROP TABLE IF EXISTS "ai_credit_ledger";
DROP TYPE IF EXISTS "AiLedgerType";

ALTER TABLE "clinic_ai_credits"
  DROP COLUMN IF EXISTS "balance",
  DROP COLUMN IF EXISTS "markup",
  DROP COLUMN IF EXISTS "lowBalanceThreshold";

ALTER TABLE "ai_usage_logs"
  DROP COLUMN IF EXISTS "markup",
  DROP COLUMN IF EXISTS "chargedCost";
