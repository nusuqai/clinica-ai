-- Per-clinic AI UNITS: the clinic-facing meter. A clinic buys N units and each
-- agent reply spends exactly one, whatever that reply cost in tokens. The USD
-- ledger stays exactly as it was — it is now the platform-only view of what the
-- same replies really cost (see aiCredit.ts / aiReports.ts).
--
-- Hand-written (not `migrate dev`) because this project's Supabase cross-schema
-- FK (public.profiles -> auth.users) breaks Prisma's shadow DB; applied via
-- `prisma migrate deploy`, which never touches a shadow database.

-- Units are only ever granted by a platform admin or spent one-per-reply, so
-- this is deliberately narrower than "AiLedgerType" (no TRANSCRIPTION/TTS:
-- those cost the platform money but never cost a clinic a unit).
CREATE TYPE "AiUnitLedgerType" AS ENUM ('TOPUP', 'USAGE', 'ADJUSTMENT');

-- The clinic-facing balance, alongside the existing USD one. Starts at 0 for
-- every existing clinic: units are granted explicitly from the platform console,
-- never inferred from a dollar balance. NOTE: the agent gates on BOTH meters, so
-- after this migration a clinic replies only once it has been granted units.
ALTER TABLE "clinic_ai_credits"
  ADD COLUMN "unitBalance" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lowUnitsThreshold" INTEGER NOT NULL DEFAULT 50;

-- Units spent by one usage row: 1 on REPLY rows, 0 on TRANSCRIPTION/TTS.
-- Backfilled to 0 for history — units did not exist when those rows were
-- written, so charging them retroactively would misstate the meter.
ALTER TABLE "ai_usage_logs"
  ADD COLUMN "unitsCharged" INTEGER NOT NULL DEFAULT 0;

-- Append-only source of truth for clinic_ai_credits."unitBalance".
CREATE TABLE "ai_unit_ledger" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "clinicId"     UUID NOT NULL,
  "type"         "AiUnitLedgerType" NOT NULL,
  "amount"       INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "usageId"      UUID,
  "note"         TEXT,
  "actorId"      UUID,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_unit_ledger_pkey" PRIMARY KEY ("id")
);

-- One unit-ledger row per usage row: this is what makes a redelivered webhook
-- safe on the unit meter as well as the money one.
CREATE UNIQUE INDEX "ai_unit_ledger_usageId_key" ON "ai_unit_ledger" ("usageId");
CREATE INDEX "ai_unit_ledger_clinicId_createdAt_idx" ON "ai_unit_ledger" ("clinicId", "createdAt");

ALTER TABLE "ai_unit_ledger"
  ADD CONSTRAINT "ai_unit_ledger_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_unit_ledger"
  ADD CONSTRAINT "ai_unit_ledger_usageId_fkey"
  FOREIGN KEY ("usageId") REFERENCES "ai_usage_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
