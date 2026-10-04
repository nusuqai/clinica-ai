-- Message debounce (WhatsApp): consolidate a rapid burst of patient messages
-- into ONE agent reply, driven by Supabase pg_cron → /api/cron/process-debounce.
--
-- Applied by hand with `prisma migrate deploy` because `migrate dev` breaks on
-- this project's cross-schema FK (public.profiles -> auth.users) shadow DB.
-- Everything here is additive + idempotent. See memory message-debounce-pgcron
-- and prisma/sql/debounce-pgcron.sql (the scheduler, run separately in Supabase).

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "MessageDelivery" AS ENUM ('QUEUED', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationProcessingStatus" AS ENUM ('IDLE', 'PENDING', 'PROCESSING', 'FAILED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Message: debounce bookkeeping + outbound delivery lifecycle ──────────────
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryStatus" "MessageDelivery" NOT NULL DEFAULT 'SENT',
  ADD COLUMN IF NOT EXISTS "sendAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "messages_sessionId_processedAt_idx"
  ON "messages"("sessionId", "processedAt");
CREATE INDEX IF NOT EXISTS "messages_sessionId_deliveryStatus_idx"
  ON "messages"("sessionId", "deliveryStatus");

-- ── Clinic: per-clinic debounce window (seconds), live-editable, clamped 5–120 ─
ALTER TABLE "clinics"
  ADD COLUMN IF NOT EXISTS "debounceSeconds" INTEGER NOT NULL DEFAULT 15;

-- ── ClinicAiCredit: second image controller (extract-and-respond vs extract-only)
-- Default true so existing image-analysis clinics keep answering images.
ALTER TABLE "clinic_ai_credits"
  ADD COLUMN IF NOT EXISTS "imageAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT true;

-- ── ConversationProcessing: per-conversation debounce + retry controller ─────
CREATE TABLE IF NOT EXISTS "conversation_processing" (
  "conversationId"      UUID NOT NULL,
  "clinicId"            UUID NOT NULL,
  "status"              "ConversationProcessingStatus" NOT NULL DEFAULT 'IDLE',
  "lastInboundAt"       TIMESTAMP(3) NOT NULL,
  "readyAt"             TIMESTAMP(3) NOT NULL,
  "lastInboundWasVoice" BOOLEAN NOT NULL DEFAULT false,
  "claimedAt"           TIMESTAMP(3),
  "retryCount"          INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt"         TIMESTAMP(3),
  "lastError"           TEXT,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_processing_pkey" PRIMARY KEY ("conversationId")
);

CREATE INDEX IF NOT EXISTS "conversation_processing_status_readyAt_idx"
  ON "conversation_processing"("status", "readyAt");
CREATE INDEX IF NOT EXISTS "conversation_processing_status_nextRetryAt_idx"
  ON "conversation_processing"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "conversation_processing_clinicId_idx"
  ON "conversation_processing"("clinicId");

DO $$ BEGIN
  ALTER TABLE "conversation_processing"
    ADD CONSTRAINT "conversation_processing_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "conversation_processing"
    ADD CONSTRAINT "conversation_processing_clinicId_fkey"
    FOREIGN KEY ("clinicId") REFERENCES "clinics"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
