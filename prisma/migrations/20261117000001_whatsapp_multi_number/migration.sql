-- Several WhatsApp numbers per clinic, and a resumable chat-history sync per
-- number.
--
--  * whatsapp_configs: no longer one per clinic. At most one official
--    (META_CLOUD) number and exactly one main ("isPrimary") number per clinic,
--    both enforced by partial unique indexes. Every existing row was its
--    clinic's only number, so it becomes the main one.
--  * messages.whatsappConfigId: the clinic number a message came in on / went
--    out from. Backfilled for existing WhatsApp conversations (each clinic had
--    one number, so it's unambiguous).
--  * whatsapp_history_syncs: saved progress of a number's history import, so
--    staff can stop it and later resume it (or start a fresh 90 days).
--
-- Applied with `prisma migrate deploy` (hand-written: `migrate dev` breaks on
-- this project's cross-schema FK shadow DB). Additive + idempotent.

-- ── whatsapp_configs ─────────────────────────────────────────────────────────
ALTER TABLE "whatsapp_configs"
  ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Only on first apply: before this migration a clinic had at most one row.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'whatsapp_configs_clinicId_key') THEN
    UPDATE "whatsapp_configs" SET "isPrimary" = true;
  END IF;
END $$;

DROP INDEX IF EXISTS "whatsapp_configs_clinicId_key";
CREATE INDEX IF NOT EXISTS "whatsapp_configs_clinicId_idx" ON "whatsapp_configs"("clinicId");
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_one_official_per_clinic"
  ON "whatsapp_configs"("clinicId") WHERE "provider" = 'META_CLOUD';
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_configs_one_primary_per_clinic"
  ON "whatsapp_configs"("clinicId") WHERE "isPrimary";

-- ── messages.whatsappConfigId ────────────────────────────────────────────────
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "whatsappConfigId" UUID;

DO $$ BEGIN
  ALTER TABLE "messages"
    ADD CONSTRAINT "messages_whatsappConfigId_fkey"
    FOREIGN KEY ("whatsappConfigId") REFERENCES "whatsapp_configs"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "messages_conversationId_whatsappConfigId_createdAt_idx"
  ON "messages"("conversationId", "whatsappConfigId", "createdAt");

UPDATE "messages" m
SET "whatsappConfigId" = c."id"
FROM "conversations" conv, "whatsapp_configs" c
WHERE m."whatsappConfigId" IS NULL
  AND conv."id" = m."conversationId"
  AND conv."channel" = 'WHATSAPP'
  AND c."clinicId" = m."clinicId"
  AND c."isPrimary";

-- ── whatsapp_history_syncs ───────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "HistorySyncStatus" AS ENUM ('RUNNING', 'STOPPED', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- An earlier draft of this change (20261117000001_whatsapp_history_sync, applied
-- on some dev databases) created the table keyed by clinic. Reshape it to one row
-- per number: back then a clinic had at most one number, so the join is exact;
-- rows whose clinic has no WhatsApp Web number are just stale progress — dropped.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'whatsapp_history_syncs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'whatsapp_history_syncs'
      AND column_name = 'whatsappConfigId'
  ) THEN
    ALTER TABLE "whatsapp_history_syncs" ADD COLUMN "whatsappConfigId" UUID;
    UPDATE "whatsapp_history_syncs" s
      SET "whatsappConfigId" = c."id"
      FROM "whatsapp_configs" c
      WHERE c."clinicId" = s."clinicId" AND c."provider" = 'EVOLUTION';
    DELETE FROM "whatsapp_history_syncs" WHERE "whatsappConfigId" IS NULL;
    ALTER TABLE "whatsapp_history_syncs" ALTER COLUMN "whatsappConfigId" SET NOT NULL;
    DROP INDEX IF EXISTS "whatsapp_history_syncs_clinicId_key";
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "whatsapp_history_syncs" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "whatsappConfigId" UUID NOT NULL,
  "status" "HistorySyncStatus" NOT NULL,
  "runId" UUID NOT NULL,
  "since" TIMESTAMP(3) NOT NULL,
  "chats" JSONB,
  "totalChats" INTEGER NOT NULL DEFAULT 0,
  "nextIndex" INTEGER NOT NULL DEFAULT 0,
  "messagesImported" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "whatsapp_history_syncs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_history_syncs_whatsappConfigId_key"
  ON "whatsapp_history_syncs"("whatsappConfigId");
CREATE INDEX IF NOT EXISTS "whatsapp_history_syncs_clinicId_idx"
  ON "whatsapp_history_syncs"("clinicId");

DO $$ BEGIN
  ALTER TABLE "whatsapp_history_syncs"
    ADD CONSTRAINT "whatsapp_history_syncs_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "whatsapp_history_syncs"
    ADD CONSTRAINT "whatsapp_history_syncs_whatsappConfigId_fkey"
    FOREIGN KEY ("whatsappConfigId") REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
