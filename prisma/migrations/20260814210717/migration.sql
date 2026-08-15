/*
  Warnings:

  - You are about to drop the `ai_credit_ledger` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ai_usage_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `clinic_ai_credits` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `whatsapp_configs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ai_credit_ledger" DROP CONSTRAINT "ai_credit_ledger_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ai_credit_ledger" DROP CONSTRAINT "ai_credit_ledger_usageId_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_messageId_fkey";

-- DropForeignKey
ALTER TABLE "ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "clinic_ai_credits" DROP CONSTRAINT "clinic_ai_credits_clinicId_fkey";

-- DropForeignKey
ALTER TABLE "whatsapp_configs" DROP CONSTRAINT "whatsapp_configs_clinicId_fkey";

-- DropTable
DROP TABLE "ai_credit_ledger";

-- DropTable
DROP TABLE "ai_usage_logs";

-- DropTable
DROP TABLE "clinic_ai_credits";

-- DropTable
DROP TABLE "whatsapp_configs";

-- DropEnum
DROP TYPE "AiLedgerType";
