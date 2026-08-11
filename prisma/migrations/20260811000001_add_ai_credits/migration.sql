-- Per-clinic AI credit metering & cost logging. Adds:
--   * clinic_ai_credits — 1:1 satellite of clinics: global AI on/off switch +
--     prepaid USD balance (cache) + per-clinic markup multiplier.
--   * ai_usage_logs — append-only, one row per charged agent reply (tokens,
--     rate/markup snapshots, raw + charged cost). messageId unique = idempotent.
--   * ai_credit_ledger — append-only money ledger, the source of truth for the
--     balance (SUM(amount) must equal clinic_ai_credits.balance).
-- All money columns are numeric(18,8): a single agent turn can cost far under a
-- cent, so 8 fractional digits keep sums of many tiny charges exact.

-- CreateEnum
CREATE TYPE "AiLedgerType" AS ENUM ('TOPUP', 'USAGE', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "clinic_ai_credits" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "markup" DECIMAL(6,4) NOT NULL DEFAULT 1.5,
    "lowBalanceThreshold" DECIMAL(18,8) NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_ai_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "sessionId" UUID,
    "messageId" UUID,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "inputRatePerM" DECIMAL(12,4) NOT NULL,
    "outputRatePerM" DECIMAL(12,4) NOT NULL,
    "rawCost" DECIMAL(18,8) NOT NULL,
    "markup" DECIMAL(6,4) NOT NULL,
    "chargedCost" DECIMAL(18,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_credit_ledger" (
    "id" UUID NOT NULL,
    "clinicId" UUID NOT NULL,
    "type" "AiLedgerType" NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "balanceAfter" DECIMAL(18,8) NOT NULL,
    "usageId" UUID,
    "note" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinic_ai_credits_clinicId_key" ON "clinic_ai_credits"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_logs_messageId_key" ON "ai_usage_logs"("messageId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_clinicId_createdAt_idx" ON "ai_usage_logs"("clinicId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_credit_ledger_usageId_key" ON "ai_credit_ledger"("usageId");

-- CreateIndex
CREATE INDEX "ai_credit_ledger_clinicId_createdAt_idx" ON "ai_credit_ledger"("clinicId", "createdAt");

-- AddForeignKey
ALTER TABLE "clinic_ai_credits" ADD CONSTRAINT "clinic_ai_credits_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_credit_ledger" ADD CONSTRAINT "ai_credit_ledger_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "ai_usage_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every existing clinic (incl. the default backfill clinic) gets a
-- credit satellite so getClinicAiStatus never faces a missing row. Balance
-- starts at 0 — a clinic must be topped up before the agent will reply.
INSERT INTO "clinic_ai_credits" ("id", "clinicId", "updatedAt")
SELECT gen_random_uuid(), "id", CURRENT_TIMESTAMP FROM "clinics"
ON CONFLICT ("clinicId") DO NOTHING;
